import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, db } from "../firebase";
import { formatCurrency } from "../utils";
import { StreamerProfile, DonationRecord } from "../types";
import { ShieldCheck, ArrowRight, CheckCircle2, Coins, Sparkles, User, MessageCircle, RefreshCw, CreditCard, AlertTriangle, ArrowLeft } from "lucide-react";
import Swal from "sweetalert2";

interface DonationPageProps {
  streamerId: string;
}

export default function DonationPage({ streamerId }: DonationPageProps) {
  const [streamer, setStreamer] = useState<StreamerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form States
  const [donorName, setDonorName] = useState("บุคคลนิรนาม(Annonymous)");
  const [amount, setAmount] = useState<number | "">("");
  const [message, setMessage] = useState("");
  const [activeStep, setActiveStep] = useState<"form" | "pay" | "confirmed">("form");

  // Active Transaction Details
  const [donation, setDonation] = useState<DonationRecord | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);
  const [stripeCancelError, setStripeCancelError] = useState(false);

  // Helper sweetalert triggers
  const showDetailAlert = (title: string, text: string, icon: "success" | "error" | "warning" = "warning") => {
    Swal.fire({
      title,
      text,
      icon,
      confirmButtonColor: "#db2777",
      background: "#ffffff",
      customClass: {
        popup: "rounded-3xl font-sans"
      }
    });
  };

  useEffect(() => {
    async function loadStreamer() {
      try {
        if (!streamerId) {
          setError("No streamer account selected.");
          return;
        }
        const docSnap = await getDoc(doc(db, "streamers", streamerId));
        if (docSnap.exists()) {
          const profileData = docSnap.data() as StreamerProfile;
          setStreamer(profileData);
          if (profileData.minDonationAlert !== undefined) {
            setAmount(profileData.minDonationAlert || 20); 
          }
        } else {
          setError("Streamer profile lookup failed. The ID may be unregistered.");
        }
      } catch (err) {
        console.error("Error loading streamer profile:", err);
        setError("Error fetching streamer details.");
      } finally {
        setLoading(false);
      }
    }
    loadStreamer();
  }, [streamerId]);

  // Check for successful donation in sessionStorage on mount or streamer object resolution to prevent duplicate popups on refresh!
  useEffect(() => {
    if (!streamerId || !streamer) return;

    const savedDonationStr = sessionStorage.getItem("success_donation");
    if (savedDonationStr) {
      try {
        const savedDonation = JSON.parse(savedDonationStr) as DonationRecord;
        if (savedDonation.streamerId === streamerId) {
          setDonation(savedDonation);
          setActiveStep("confirmed");

          // Clear IMMEDIATELY so any future refresh/navigation won't trigger this again!
          sessionStorage.removeItem("success_donation");

          // Display the sweet high-fidelity celebration pop-up ONCE
          Swal.fire({
            title: "🎉 โอนสนับสนุนสำเร็จคู่สตรีม!",
            text: `คุณได้สนับสนุนคุณ ${streamer.displayName} จำนวน ${savedDonation.amount} บาทเรียบร้อยแล้ว ยอดนี้จะเด้งอ่านออกจอด้วยระบบ AI Voice วินาทีนี้ทันที!`,
            icon: "success",
            confirmButtonColor: "#db2777",
            background: "#ffffff",
            customClass: {
              popup: "rounded-3xl font-sans"
            }
          });
        }
      } catch (error) {
        console.error("Error reading saved donation:", error);
      }
    }
  }, [streamerId, streamer]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const isCancel = params.get("donation_cancel") === "true";

    if (isCancel) {
      setStripeCancelError(true);
      showDetailAlert("รายการโอนถูกยกเลิก", "คุณไม่ได้ชำระเงินต่อบนหน้าต่างระบบชำระเงินของ Stripe ธุรกรรมมีความปลอดภัยและไม่เจอยอดหักเงินใดๆ", "warning");
    } else if (sessionId) {
      const verifyStripePayment = async () => {
        setIsVerifying(true);
        setActiveStep("pay");
        setVerificationFeedback("กำลังเชื่อมโยงการชำระเงินกับเครือข่ายความปลอดภัยของ Stripe และธนาคารพันธมิตร...");

        try {
          let verifyUrl = `/api/verify-stripe-session?session_id=${sessionId}`;
          if (params.get("is_mock") === "true") {
            const mockAmount = params.get("mock_amount") || "";
            const mockDonorName = params.get("mock_donorName") || "";
            const mockMessage = params.get("mock_message") || "";
            verifyUrl += `&mock_amount=${mockAmount}&mock_donorName=${encodeURIComponent(mockDonorName)}&mock_message=${encodeURIComponent(mockMessage)}&streamerId=${streamerId}`;
          }

          const res = await fetch(verifyUrl);
          if (!res.ok) {
            let errMsg = "ล้มเหลวในการตรวจทานความถูกต้องกับเซิร์ฟเวอร์หลัก";
            try {
              const errJson = await res.json();
              errMsg = errJson.error || errMsg;
            } catch (jErr) {
              const text = await res.text().catch(() => "");
              if (text.includes("Publishable Key") || text.includes("pk_")) {
                errMsg = "คุณตั้งค่าเกตเวย์ Stripe API สลับประเภท! รหัสความปลอดภัยที่ป้อนบนระบบเป็น Publishable Key แต่หลังบ้านต้องการ Secret Key ('sk_') หรือ Restricted Key ('rk_')";
              } else {
                errMsg = `ระบบเซิร์ฟเวอร์แจ้งข้อผิดพลาด (${res.status}): ${text.substring(0, 100)}`;
              }
            }
            throw new Error(errMsg);
          }
          const result = await res.json();
          if (result.success) {
            const finalAmount = result.amount || (result.metadata?.amount ? Number(result.metadata.amount) : 50);
            const finalDonorName = result.metadata?.donorName || "บุคคลนิรนาม(Annonymous)";
            const finalMessage = result.metadata?.message || "";

            const completeDonationData = {
              streamerId,
              donorName: finalDonorName,
              amount: finalAmount,
              message: finalMessage,
              status: "completed" as const,
              paymentMethod: "stripe",
              createdAt: new Date().toISOString(),
              triggered: false,
              slipVerified: true,
              slipParsed: {
                transactionId: sessionId,
                amount: finalAmount,
                senderName: result.customerDetails?.name || finalDonorName,
                paymentMethod: "stripe",
                datetime: new Date().toISOString(),
                isMock: result.isMock || false,
                message: result.message || "บัตรเครดิต/เดบิตอนุมัติเงินผ่านระบบหลัก"
              },
              updatedAt: new Date().toISOString()
            };

            const donationDocRef = doc(db, "streamers", streamerId, "donations", sessionId);
            const docSnap = await getDoc(donationDocRef);
            if (!docSnap.exists()) {
              await setDoc(donationDocRef, completeDonationData);
              const donationObj = { ...completeDonationData, id: sessionId } as DonationRecord;
              
              // 1. Store in sessionStorage to display success state ONCE on the clean URL page
              sessionStorage.setItem("success_donation", JSON.stringify(donationObj));
              
              // 2. Redirect to clean URL immediately to strip session_id parameters and avoid any double verification on subsequent manual refreshes
              window.location.replace(window.location.origin + window.location.pathname + "?donate=" + streamerId);
            } else {
              // This document already exists! This means it's a manual refresh or duplicate load.
              // To prevent duplicate triggers/warnings, let's gracefully notify and clean redirect.
              Swal.fire({
                title: "⚠️ รายการชำระเงินเดิมประมวลผลแล้ว",
                text: "ธุรกรรมสนับสนุนรหัสนี้ได้รับการจัดส่งให้สตรีมเมอร์เรียบร้อยแล้ว ไม่สามารถส่งซ้ำสถานการณ์เดิมได้ค่ะ",
                icon: "info",
                confirmButtonColor: "#db2777",
                background: "#ffffff",
                customClass: {
                  popup: "rounded-3xl font-sans"
                }
              }).then(() => {
                window.location.replace(window.location.origin + window.location.pathname + "?donate=" + streamerId);
              });
            }

          } else {
            setVerificationFeedback(`❌ ข้อผิดพลาด: ${result.message || "รายการจ่ายเงินถูกสกัดกั้นหรือบัตรเครดิตปฏิเสธยอด"}`);
            showDetailAlert("ธุรกรรมขัดข้อง", result.message || "รายการถูกปฏิเสธยอดกรุณาติดต่อธนาคารเจ้าของบัตร", "error");
          }
        } catch (e: any) {
          console.error("Verification processing crash:", e);
          setVerificationFeedback(`⚠️ ขัดข้องในการยืนยันบิล: ${e.message}`);
          showDetailAlert("ปัญหาการสื่อสารบิล", e.message || "ไม่สามารถดึงข้อมูลยอดความปลอดภัยได้", "error");
        } finally {
          setIsVerifying(false);
        }
      };

      verifyStripePayment();
    }
  }, [streamerId, streamer]);

  const handleInitiateDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamer) return;

    if (!amount || amount <= 0) {
      showDetailAlert("ยอดเงินไม่ถูกต้อง", "กรุณาระบุยอดสนับสนุนที่มากกว่า 0 บาท", "warning");
      return;
    }

    setIsVerifying(true);
    setVerificationFeedback("กำลังเชื่อมโยงการชำระเงินกับเครือข่ายความปลอดภัยพันธมิตร Stripe...");
    setActiveStep("pay");

    try {
      const response = await fetch("/api/create-stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamerId,
          donorName: donorName.trim() || "บุคคลนิรนาม(Annonymous)",
          amount: Number(amount),
          message: message.trim(),
          streamerName: streamer.displayName,
        }),
      });

      if (!response.ok) {
        let errMsg = "ไม่สามารถเชื่อมต่อไปยังเกตเวย์ของ Stripe ได้";
        try {
          const errJson = await response.json();
          errMsg = errJson.error || errMsg;
        } catch (jErr) {
          const text = await response.text().catch(() => "");
          if (text.includes("Publishable Key") || text.includes("pk_")) {
            errMsg = "❌ ตั้งค่าคีย์ Stripe ในระบบผิดประเภท! คุณนำคีย์ 'pk_' ไปใส่เป็นความลับเซิร์ฟเวอร์กรุณานำ 'sk_' หรือ 'rk_' มากรอกใหม่";
          } else {
            errMsg = `เซิร์ฟเวอร์ล้มเหลวนำทางสปอนเซอร์ (${response.status}): ${text.substring(0, 150)}`;
          }
        }
        throw new Error(errMsg);
      }

      const checkoutSessionResult = await response.json();
      if (checkoutSessionResult.url) {
        window.location.href = checkoutSessionResult.url;
      } else {
        throw new Error("ลิงก์หน้าต่างใบเสร็จชำระเงินไม่ถูกต้อง");
      }
    } catch (err: any) {
      console.error("Payment redirect crash:", err);
      showDetailAlert("ขัดข้องสัญญาณเกตเวย์", err.message || "ขัดข้องขณะติดต่อ Stripe Server", "error");
      setActiveStep("form");
      setIsVerifying(false);
    }
  };

  const handleSimulateInstantVerify = async () => {
    setIsVerifying(true);
    setVerificationFeedback("Sandboxจำลองบิล: ระบบกำลังอนุมัติสำเร็จจำลอง...");

    try {
      await new Promise((r) => setTimeout(r, 1000));
      const mockSessionId = donation?.id || `mock_stripe_${Math.random().toString(36).substring(3, 11).toUpperCase()}`;
      const finalAmount = donation?.amount || (amount ? Number(amount) : 50);
      const finalDonorName = donation?.donorName || donorName || "บุคคลนิรนาม(Annonymous)";
      const finalMessage = donation?.message || message || "";

      const simulatedData = {
        streamerId,
        donorName: finalDonorName,
        amount: finalAmount,
        message: finalMessage,
        status: "completed" as const,
        paymentMethod: "stripe",
        createdAt: new Date().toISOString(),
        triggered: false,
        slipVerified: true,
        slipParsed: {
          transactionId: mockSessionId,
          amount: finalAmount,
          senderName: finalDonorName,
          paymentMethod: "stripe",
          datetime: new Date().toISOString(),
          isMock: true,
          message: "ชำระเงินจำลอง (Sandbox Bypass) อนุมัติสำเร็จ"
        },
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "streamers", streamerId, "donations", mockSessionId), simulatedData);
      
      const donationObj = { ...simulatedData, id: mockSessionId } as DonationRecord;
      
      // Store in sessionStorage to show success state ONCE on the clean URL page
      sessionStorage.setItem("success_donation", JSON.stringify(donationObj));
      
      // Clean redirect immediately
      window.location.replace(window.location.origin + window.location.pathname + "?donate=" + streamerId);
    } catch (error) {
      console.error("Sandbox bypass error:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFAF7] text-pink-600 flex flex-col items-center justify-center p-6">
        <RefreshCw className="h-12 w-12 text-pink-600 animate-spin" />
        <p className="mt-4 text-sm text-stone-600 font-extrabold">กำลังติดต่อคลังบัญชีสว่างไสวของสตรีมเมอร์...</p>
      </div>
    );
  }

  if (error || !streamer) {
    return (
      <div className="min-h-screen bg-[#FCFAF7] text-stone-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border-2 border-pink-100 rounded-3xl p-8 max-w-md space-y-4 shadow-xl">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto animate-bounce" />
          <h2 className="text-xl font-extrabold text-stone-900">ไม่พบบัญชีสตรีมเมอร์ปลายทาง</h2>
          <p className="text-xs text-stone-500 leading-relaxed">{error || "ระบุตัวเอกสารสตรีมเมอร์ไม่ผ่าน (Invalid ID Reference)"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFAF7] text-stone-850 flex flex-col justify-between">
      
      {/* Decorative top cover */}
      <div className="h-44 md:h-56 w-full relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-[#db2777]/20" />
        {streamer.coverURL ? (
          <img src={streamer.coverURL} alt="Streamer Cover Profile" className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-pink-500 to-pink-900 opacity-30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#FCFAF7] to-transparent" />
      </div>

      {/* Main Donation Card container */}
      <div className="max-w-3xl w-full mx-auto px-4 -mt-16 md:-mt-24 z-10 flex-grow pb-16">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-pink-100 shadow-xl backdrop-blur-md mb-8">
          
          {/* Streamer Header Display details */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-pink-100 pb-8">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-5">
              {streamer.photoURL ? (
                <img src={streamer.photoURL} alt={streamer.displayName} className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border-4 border-white shadow-md object-cover shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-pink-100 flex items-center justify-center text-3xl font-black text-pink-650 border-4 border-white shadow-md shrink-0">
                  {streamer.displayName.substring(0, 1).toUpperCase()}
                </div>
              )}
              <div className="text-center md:text-left space-y-1">
                <span className="px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold bg-pink-50 text-pink-750 border border-pink-200">
                  🛡️ ปลอดภัยระดับสากล • Stripe Terminal
                </span>
                <h1 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">{streamer.displayName}</h1>
                <p className="text-stone-500 text-xs md:text-sm mt-1">{streamer.bio || "ยินดีต้อนรับสู่หน้าร่วมบริจาคสนับสนุนและส่งข้อความตรงเข้าหน้าต่างไลฟ์!"}</p>
              </div>
            </div>
            
            <div className="flex justify-center md:justify-end shrink-0">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 text-xs font-semibold">
                <ShieldCheck className="h-4 w-4 text-pink-600" /> ระบบ Stripe Gateway
              </span>
            </div>
          </div>

          {/* Steps Display */}
          {activeStep === "form" && (
            <form onSubmit={handleInitiateDonation} className="space-y-6">
              
              {/* Stripe Payment Notification warning section */}
              {stripeCancelError && (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-start gap-2.5 leading-relaxed">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block">รายการล่าสุดถูกคัดกรองยกเลิกแล้ว</span>
                    <span>คุณไม่มีการชำระเงินต่อที่หน้าความปลอดภัยทางการเงินสากลของ Stripe ท่านสามารถลองระบุยอดใหม่แล้วดำเนินการบริจาคอีกครั้ง</span>
                  </div>
                </div>
              )}

              <div className="p-4 bg-pink-50/50 rounded-xl border border-pink-100 flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-pink-600 mt-1 shrink-0 animate-pulse" />
                <div className="text-xs text-stone-700 space-y-1">
                  <span className="font-bold text-stone-900 block font-sans">รับจ่ายปลอดภัยผ่านบัตรเครดิต, เดบิต หรือพร้อมเพย์ด่วน</span>
                  <p className="leading-relaxed text-stone-605">ระบบของเรารีดประสิทธิภาพด้านความเร็วและการห้ามสลิปปลอม โดยเชื่อมโยงผ่าน Stripe เจ้าของบัตรไม่ต้องถ่ายรูปใบสลิปส่งมาเช็คซ้ำซาก ยอดบันทึกทันที!</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Donor Name input */}
                <div>
                  <label htmlFor="donor-name" className="block text-xs font-extrabold text-stone-700 mb-2 flex items-center gap-1.5">
                    <User className="h-4 w-4 text-pink-650" /> ชื่อผู้สนับสนุนแฟนคลับ
                  </label>
                  <input
                    id="donor-name"
                    type="text"
                    placeholder="ระบุชื่อหรือนามแฝง (เว้นว่างเพื่อใช้ นิรนาม)"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg py-3 px-4 text-stone-900 font-bold focus:outline-none focus:border-pink-500 placeholder-stone-400 text-xs sm:text-sm"
                  />
                </div>

                {/* Amount to transfer THB */}
                <div>
                  <label htmlFor="donation-amount" className="block text-xs font-extrabold text-stone-700 mb-2 flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-pink-650" /> ยอดเงินสนับสนุนร่วมคำอธิษฐาน (บาท) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="donation-amount"
                    type="number"
                    required
                    min={1}
                    placeholder="เช่น 100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg py-3 px-4 focus:outline-none focus:border-pink-500 font-black text-lg focus:ring-0 text-pink-600"
                  />
                  {streamer.minDonationAlert > 0 && (
                    <span className="text-stone-500 text-[10.5px] mt-1.5 block">
                      💡 ยอดคำขอส่งขึ้นออพติคอลขั้นต่ำ {formatCurrency(streamer.minDonationAlert)} เพื่อยิงหน้าจอ GIFs เเละเสียงอ่านภาษาไทย (AI TTS) ของสตรีมเมอร์
                    </span>
                  )}
                </div>

              </div>

              {/* Message text details */}
              <div>
                <label htmlFor="donation-msg" className="block text-xs font-extrabold text-stone-700 mb-2 flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4 text-pink-650" /> เขียนคำอวยพรส่งเสียง (พิมพ์ไทยได้ลื่นหูเสียงสังเคราะห์อัจฉริยะ)
                </label>

                {/* Quick Selection Templates */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {[
                    "สู้ๆ นะสตรีมเมอร์",
                    "เป็นกำลังใจให้น้า",
                    "ขอบคุณนะครับ",
                    "แนะนำดีมากๆ เลย",
                    "สู้ต่อไปน้า"
                  ].map((tpl) => (
                    <button
                      key={tpl}
                      type="button"
                      onClick={() => {
                        if (!message) {
                          setMessage(tpl);
                        } else {
                          const spacing = message.endsWith(" ") ? "" : " ";
                          setMessage((prev) => prev + spacing + tpl);
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] bg-pink-50 hover:bg-pink-100 active:bg-pink-200 text-pink-700 font-extrabold rounded-full border border-pink-100 transition-all cursor-pointer"
                    >
                      + {tpl}
                    </button>
                  ))}
                </div>

                <textarea
                  id="donation-msg"
                  rows={3}
                  placeholder="พิมพ์ถ้อยคำส่งกำลังใจ ยิงเสียงคำสังเคราะห์ภาษาไทยออกลำโพงไลฟ์สดสตรีมเมอร์..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg py-3 px-4 text-stone-800 font-bold focus:outline-none focus:border-pink-500 placeholder-stone-400 resize-none text-xs sm:text-sm"
                  maxLength={150}
                />
                <span className="text-stone-400 text-xs mt-1 block text-right font-mono">{message.length}/150 ตัวอักษร</span>
              </div>

              <button
                type="submit"
                id="submit-donation-form"
                className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-base rounded-xl transition-all shadow-md shadow-pink-600/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                ยืนยันและไปหน้าต่างเลือกรับบัตรเครดิต Stripe <ArrowRight className="h-5 w-5" />
              </button>
            </form>
          )}

          {activeStep === "pay" && (
            <div className="space-y-6 max-w-xl mx-auto py-10 text-center">
              <div className="relative inline-flex items-center justify-center">
                <div className="h-16 w-16 rounded-full border-4 border-pink-100 border-t-pink-600 animate-spin absolute" />
                <CreditCard className="h-6 w-6 text-pink-600" />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-lg font-extrabold text-stone-850">
                  {isVerifying ? "กำลังสื่อสารบัญชีการเงิน..." : "เกิดข้อผิดพลาดในการตรวจสอบธุรกรรมชั่วคราว"}
                </h3>
                <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                  {verificationFeedback || "กำลังประสานรายงานเซสชันหลัก กรุณาอย่างเพิ่งแยกปิดหน้าต่างนี้..."}
                </p>
              </div>

              {/* Simulation bypass panel for fast integration testing */}
              {isVerifying && donation && (
                <div className="p-4 rounded-xl border border-pink-100 bg-pink-50/20 max-w-md mx-auto space-y-2 mt-8 text-left">
                  <span className="text-[10px] uppercase font-bold text-pink-700 tracking-wider block text-center">💻 โหมดจำลอง Sandbox เพื่อทดสอบสำหรับ AI Studio</span>
                  <p className="text-[10px] text-stone-500 text-center leading-relaxed">กรณีไม่มีรหัส Stripe sk_key ปลั๊กเซิร์ฟเวอร์จะเปลี่ยนมาเปิดจำลอง หากท่านกำลังทดสอบความเร็วนิ่งของ overlay ทันตาเห็น สามารถกดยืนยันด้วยมือตัวเลือกนี้:</p>
                  <button
                    onClick={handleSimulateInstantVerify}
                    className="w-full py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs border-none"
                  >
                    ⚡ จำลองทำธุรกรรมสำเร็จทันที (Simulate Success Bypass Session)
                  </button>
                </div>
              )}
            </div>
          )}

          {activeStep === "confirmed" && donation && (
            <div className="text-center py-8 max-w-md mx-auto space-y-6 animate-in fade-in duration-300">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-250">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              
              <div>
                <h2 className="text-2xl font-black text-emerald-600">สนับสนุนสำเร็จเรียบร้อยแล้ว!</h2>
                <p className="text-stone-500 text-xs sm:text-sm mt-2 leading-relaxed">
                  รายการสแกนความสากลจำนวน <span className="text-stone-900 font-extrabold">{formatCurrency(donation.amount)}</span> จากคุณได้รับการคัดกรองจัดทานเเละเด้งขึ้น OBS Live ของคุณสตรีมเมอร์ {streamer.displayName} แล้วเรียบร้อย ขอขอบพระคุณเป็นอย่างยิ่งค่ะ!
                </p>
              </div>

              <div className="bg-[#FCFAF7] rounded-2xl p-4.5 border border-pink-50 text-left space-y-2 text-xs font-mono">
                <p className="text-stone-450 text-center mb-1 font-bold font-sans tracking-wide">คำสั่งสปอนเซอริ่ง Stripe Audit</p>
                <div className="flex justify-between items-center gap-4"><span className="text-stone-400 shrink-0">รหัสยืนยันบิล:</span> <span className="text-stone-800 select-all font-bold truncate text-right">{donation.id}</span></div>
                <div className="flex justify-between items-center gap-4"><span className="text-stone-400 shrink-0">สปอนเซอร์ผู้โอน:</span> <span className="font-extrabold text-stone-850 truncate text-right">{donation.donorName}</span></div>
                <div className="flex justify-between items-center gap-4"><span className="text-stone-400 shrink-0">ธรึกรรมผ่านบัตร:</span> <span className="text-stone-800 text-right font-bold">Stripe Secured</span></div>
                <div className="flex justify-between items-center gap-4"><span className="text-stone-400 shrink-0">เวลาบันทึกยอด:</span> <span className="text-stone-700 text-right">{new Date(donation.createdAt).toLocaleString("th-TH")}</span></div>
              </div>

              <button
                onClick={() => {
                  setDonorName("บุคคลนิรนาม(Annonymous)");
                  setAmount(streamer.minDonationAlert !== undefined ? streamer.minDonationAlert : 50);
                  setMessage("");
                  setActiveStep("form");
                  setDonation(null);
                  setStripeCancelError(false);
                  setVerificationFeedback(null);
                }}
                className="px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-sm rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                โอนร่วมคำอวยพรข้อความใหม่ <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

        </div>
      </div>

      <footer className="text-center py-6 border-t border-pink-50 bg-white text-stone-450 text-xs flex flex-col items-center justify-center gap-1.5">
        <div className="flex items-center gap-1.5 justify-center">
          <img src="/logo.svg" alt="Donate me! Logo" className="h-5 w-5" referrerPolicy="no-referrer" />
          <p className="font-bold text-stone-800">Donate me! - ระบบสนับสนุนสตรีมเมอร์ © 2026</p>
        </div>
        <p className="mt-0.5 text-[10px] text-stone-400">ระบบเกตเวย์ความปลอดภัยสากลประสานงานข้อมูลและแอนิเมชั่นไลฟ์สตรีมด่วน</p>
      </footer>
    </div>
  );
}
