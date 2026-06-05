import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, addDoc, db, auth, googleSignIn, logout, deleteDoc, getDocs } from "../firebase";
import { formatCurrency, formatDate, playAlertSound, playTTSAlert } from "../utils";
import { StreamerProfile, DonationRecord } from "../types";
import { 
  Settings, Key, Link as LinkIcon, Radio, Volume2, Image as ImageIcon, 
  HelpCircle, Eye, LogIn, LogOut, CheckCircle2, XCircle, Clock, 
  ChevronRight, RefreshCw, Sparkles, FileSpreadsheet, ShieldAlert, FileText, Globe, Trash2,
  Tv, Compass, DollarSign, Activity, Sparkle, MessageSquare, Mic, ShieldCheck, Heart, Coins
} from "lucide-react";
import InvoiceReport from "./InvoiceReport";
import Swal from "sweetalert2";

export default function StreamerDashboard() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<StreamerProfile | null>(null);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // View States
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "settings">("overview");
  const [viewReport, setViewReport] = useState(false);

  // Settings State Managers
  const [displayName, setDisplayName] = useState("");
  const [promptpayId, setPromptpayId] = useState("");
  const [promptpayName, setPromptpayName] = useState("");
  const [truemoneyPhone, setTruemoneyPhone] = useState("");
  const [truemoneyName, setTruemoneyName] = useState("");
  const [bio, setBio] = useState("");
  const [overlaySound, setOverlaySound] = useState("retro");
  const [overlayGif, setOverlayGif] = useState("pikachu");
  const [minDonationAlert, setMinDonationAlert] = useState<number>(5);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  // Overlay Position Layout States
  const [overlayAspectFormat, setOverlayAspectFormat] = useState<"16:9" | "9:16">("16:9");
  const [overlayPositionX, setOverlayPositionX] = useState<number>(50);
  const [overlayPositionY, setOverlayPositionY] = useState<number>(50);
  const [overlayScale, setOverlayScale] = useState<number>(1.0);

  // Test Alert States
  const [testDonorName, setTestDonorName] = useState("ผู้สนับสนุนใจดี (ทดสอบ)");
  const [testAmount, setTestAmount] = useState<number>(99);
  const [testMessage, setTestMessage] = useState("ทดสอบการแจ้งเตือน PromptPay ทำงานสมบูรณ์แบบแล้วจ้า! 🎉");
  const [testLoading, setTestLoading] = useState(false);

  const [clearLoading, setClearLoading] = useState(false);

  // SweetAlert helpers for professional visual consistency
  const showSwalAlert = (title: string, text: string, icon: "success" | "error" | "warning" | "info" = "success") => {
    Swal.fire({
      title,
      text,
      icon,
      confirmButtonColor: "#db2777", // deep pink-600
      background: "#ffffff",
      customClass: {
        popup: "rounded-3xl border border-pink-100 font-sans shadow-2xl p-6",
        title: "text-stone-900 font-extrabold text-lg",
        htmlContainer: "text-stone-600 text-xs.5 leading-relaxed",
        confirmButton: "px-6 py-2.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-700 text-white transition-all shadow-md shadow-pink-600/10 cursor-pointer"
      },
      buttonsStyling: false
    });
  };

  const showSwalToast = (title: string, icon: "success" | "info" | "error" = "success") => {
    Swal.fire({
      toast: true,
      position: "top-end",
      icon,
      title,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      background: "#ffffff",
      customClass: {
        popup: "rounded-2xl border border-pink-50 font-sans shadow-lg p-3.5"
      }
    });
  };

  // Sound themes
  const soundThemes = [
    { key: "retro", label: "🕹️ เรโทรเกม (Retro)" },
    { key: "bell", label: "🔔 กระดิ่งคลาสสิก (Classic Bell)" },
    { key: "mario", label: "🍄 ขุมทรัพย์มาริโอ้ (Mario Treasure)" },
    { key: "anime", label: "🌸 อนิเมะดีเลย์ (Anime Sparkle)" }
  ];

  // GIF selection themes
  const gifThemes = [
    { key: "pikachu", label: "⚡ พิคาชูดิ่งแดนซ์ (Pikachu)" },
    { key: "cute_cat", label: "🐱 เหมียวน้อยดงเด้ง (Cute Cat)" },
    { key: "coin", label: "🪙 เหรียญทองคำพิกเซล (Gold Coin)" },
    { key: "heart", label: "💖 หัวใจกะพริบนีออน (Neon Heart)" },
    { key: "profile_photo", label: "👤 ภาพโปรไฟล์บัญชีของคุณ (Use Profile Picture)" }
  ];

  // 1. Initial State changed listener for Google/Gmail connection auth
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadOrBootstrapProfile(currentUser);
      } else {
        setProfile(null);
        setDonations([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Subscription to donations history once profile exists
  useEffect(() => {
    if (!profile) return;

    const donationsRef = collection(db, "streamers", profile.uid, "donations");
    
    // Sort transactions chronologically
    const unsubscribeDonations = onSnapshot(donationsRef, (snapshot) => {
      const records: DonationRecord[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as DonationRecord;
        if (!data.isTest) {
          records.push({ ...data, id: doc.id });
        }
      });
      records.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDonations(records);
    });

    return () => unsubscribeDonations();
  }, [profile]);

  // Load profile or dynamically bootstrap registration from Gmail credentials
  const loadOrBootstrapProfile = async (googleUser: any) => {
    setLoading(true);
    try {
      const docRef = doc(db, "streamers", googleUser.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as StreamerProfile;
        setProfile(data);
        syncFormValues(data);
      } else {
        // dynamic bootstrapping
        const newProfile: StreamerProfile = {
          uid: googleUser.uid,
          email: googleUser.email || "",
          displayName: googleUser.displayName || "สตรีมเมอร์นิรนาม",
          photoURL: googleUser.photoURL || "",
          coverURL: "",
          promptpayId: "stripe_enabled", 
          promptpayName: googleUser.displayName || "",
          truemoneyPhone: "",
          truemoneyName: googleUser.displayName || "",
          bio: "ยินดีต้อนรับสู่แดนสนับสนุน! พิมพ์ยอดเงินและข้อความเพื่อส่งกำลังใจได้ทันทีนะคะ",
          overlaySound: "retro",
          overlayGif: "pikachu",
          minDonationAlert: 5,
          ttsEnabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await setDoc(docRef, newProfile);
        setProfile(newProfile);
        syncFormValues(newProfile);
        setActiveTab("overview");
        
        Swal.fire({
          title: "ยินดีต้อนรับเข้าใช้งาน! 🎉",
          text: `ยินดีต้อนรับคุณ ${googleUser.displayName} เข้าสู่ระบบ Donate me! สำหรับสตรีมเมอร์แล้วเรียบร้อย`,
          icon: "success",
          confirmButtonColor: "#db2777"
        });
      }
    } catch (err) {
      console.error("Bootstrapping profile failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const syncFormValues = (p: StreamerProfile) => {
    setDisplayName(p.displayName || "");
    setPromptpayId(p.promptpayId || "");
    setPromptpayName(p.promptpayName || "");
    setTruemoneyPhone(p.truemoneyPhone || "");
    setTruemoneyName(p.truemoneyName || "");
    setBio(p.bio || "");
    setOverlaySound(p.overlaySound || "retro");
    setOverlayGif(p.overlayGif || "pikachu");
    setMinDonationAlert(p.minDonationAlert ?? 5);
    setTtsEnabled(p.ttsEnabled !== false);
    setOverlayAspectFormat(p.overlayAspectFormat || "16:9");
    setOverlayPositionX(p.overlayPositionX ?? 50);
    setOverlayPositionY(p.overlayPositionY ?? 50);
    setOverlayScale(p.overlayScale ?? 1.0);
  };

  // Google OAuth Login Action
  const handleLogin = async () => {
    try {
      setLoading(true);
      await googleSignIn();
      showSwalToast("ล็อกอินเข้าสู่ระบบผ่าน Google สำเร็จเรียบร้อย", "success");
    } catch (err: any) {
      console.error("Google authentication action err:", err);
      showSwalAlert("ล้มเหลวในการล็อกอิน", err.message || "เกิดปัญหาขัดข้องขณะล็อกอิน", "error");
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth Logout Action
  const handleLogout = async () => {
    const confirmLogout = await Swal.fire({
      title: "ออกจากระบบ?",
      text: "คุณแน่ใจหรือไม่ที่จะออกจากส่วนควบคุมสตรีมเมอร์ส่วนตัว?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "ออกจากระบบ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#db2777",
      cancelButtonColor: "#78716c",
      customClass: {
        popup: "rounded-3xl"
      }
    });

    if (confirmLogout.isConfirmed) {
      await logout();
      showSwalToast("ออกจากระบบและแยกความปลอดภัยเรียบร้อย", "info");
    }
  };

  // Save Settings Config
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaveLoading(true);
    try {
      const updatePayload = {
        displayName: displayName.trim(),
        promptpayId: promptpayId.trim() || "stripe_enabled",
        promptpayName: promptpayName.trim(),
        truemoneyPhone: truemoneyPhone.trim(),
        truemoneyName: truemoneyName.trim(),
        bio: bio.trim(),
        overlaySound,
        overlayGif,
        minDonationAlert: Number(minDonationAlert),
        ttsEnabled,
        overlayAspectFormat,
        overlayPositionX: Number(overlayPositionX),
        overlayPositionY: Number(overlayPositionY),
        overlayScale: Number(overlayScale),
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "streamers", profile.uid), updatePayload);
      setProfile((prev) => prev ? { ...prev, ...updatePayload } : null);
      showSwalAlert("🎉 บันทึกการตั้งค่าสำเร็จ!", "ข้อมูลช่องและตำแหน่ง overlay ทั้งหมดได้รับการปกป้องบนคลาวด์แล้วเรียบร้อย", "success");
      setActiveTab("overview");
    } catch (err) {
      console.error("Failed to update profile settings:", err);
      showSwalAlert("เกิดข้อผิดพลาด", "ระบบไม่สามารถอัปโหลดข้อมูลบันทึกได้ กรุณาลองอีกครั้ง", "error");
    } finally {
      setSaveLoading(false);
    }
  };

  // URLs helpers for copy actions
  const getAbsoluteURL = (paramKey: string, val: string) => {
    let origin = window.location.origin + window.location.pathname;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    return `${origin}?${paramKey}=${val}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: `คัดลอกลิงก์ ${label} ไปยังคลิปบอร์ดแล้ว!`,
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
      background: "#ffffff",
      customClass: {
        popup: "rounded-2xl border border-pink-100 font-sans shadow-md"
      }
    });
  };

  // Trigger simulated completed test donation on Firestore to play real-time overlay
  const handleTriggerTestAlert = async () => {
    if (!profile) return;
    setTestLoading(true);
    try {
      const collectionRef = collection(db, "streamers", profile.uid, "donations");
      const payload = {
        streamerId: profile.uid,
        donorName: testDonorName.trim() || "ผู้สนับสนุนใจดี (ทดสอบ)",
        amount: Number(testAmount) || 99,
        message: testMessage.trim() || "ทดสอบระบบแจ้งเตือนสำเร็จแล้วจ้า!",
        status: "completed",
        createdAt: new Date().toISOString(),
        triggered: false,
        slipVerified: true,
        paymentMethod: "stripe",
        isTest: true, 
      };

      await addDoc(collectionRef, payload);
      showSwalAlert("🚀 ส่งแจ้งเตือนทดสอบสำเร็จ!", "แอนิเมชันและเอฟเฟกต์เสียงคำพูด (TTS) จะเด้งขึ้นแสดงบน OBS Overlay ของคุณแบบดีเลย์เรียลไทม์ทันที", "success");
    } catch (err) {
      console.error("Test alert failed:", err);
      showSwalAlert("ขัดข้อง", "ไม่สามารถส่งข้อมูลอวยพรจำลองลงคลาวด์เดต้าเบสได้", "error");
    } finally {
      setTestLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!profile) return;

    const result = await Swal.fire({
      title: "ล้างคลังประวัติผู้สนับสนุนทั้งหมด?",
      text: "สถิติรายรับทั้งหมด บันทึกธุรกรรมบิล และคำอวยพรจะถูกลบถาวรทันที ไม่สามารถกู้คืนได้!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ยืนยันการลุกเคลียร์ถาวร",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#be185d", // Deep pink-700
      cancelButtonColor: "#78716c", // Stone-500
      background: "#ffffff",
      customClass: {
        popup: "rounded-3xl border border-pink-100 p-6"
      }
    });

    if (result.isConfirmed) {
      setClearLoading(true);
      try {
        const donationsRef = collection(db, "streamers", profile.uid, "donations");
        const snapshot = await getDocs(donationsRef);
        
        const batchPromises: Promise<void>[] = [];
        snapshot.forEach((docSnap) => {
          batchPromises.push(deleteDoc(doc(db, "streamers", profile.uid, "donations", docSnap.id)));
        });
        
        await Promise.all(batchPromises);
        showSwalAlert("🧹 คืนค่าเรียบร้อย!", "เคลียร์ประวัติการโดเนททั้งหมดในระบบสำเร็จเป็นฐานข้อมูลสีขาวใสสะอาด", "success");
      } catch (err) {
        console.error("Failed to clear donation history:", err);
        showSwalAlert("เกิดข้อผิดพลาด", "คลาวด์เดต้าเบสลบข้อมูลผิดพลาด กรุณาลองใหม่อีกครั้ง", "error");
      } finally {
        setClearLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FCFAF7] text-pink-600">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <RefreshCw className="h-12 w-12 animate-spin text-pink-605" />
            <Sparkle className="h-5 w-5 absolute top-1 right-1 text-pink-400 animate-pulse" />
          </div>
          <p className="text-stone-600 font-extrabold text-sm tracking-wide">กำลังเชื่อมโยงบัญชีสว่างไสวและเซิร์ฟเวอร์ความปลอดภัย...</p>
        </div>
      </div>
    );
  }

  // A. Guest Welcome Screen (Redesigned Presentation Landing)
  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-[#FCFAF7] text-stone-850 flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 relative overflow-hidden">
        
        {/* Subtle Decorative Pink/Cream ambient bubbles */}
        <div className="absolute top-[-10%] right-[-10%] w-[35rem] h-[35rem] rounded-full bg-pink-100/40 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-pink-200/20 blur-[150px] pointer-events-none" />
        
        {/* Header Branding */}
        <header className="w-full max-w-6xl flex justify-between items-center py-4 border-b border-pink-100/60 z-10">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Donate me! Logo" className="h-11 w-11 object-contain" referrerPolicy="no-referrer" />
            <div>
              <span className="font-extrabold text-stone-900 text-lg leading-tight block tracking-tight">Donate <span className="text-pink-600">me!</span></span>
              <span className="text-[10px] text-stone-500 font-bold uppercase tracking-widest block -mt-0.5">ระบบสนับสนุนสตรีมเมอร์</span>
            </div>
          </div>
          
          <button
            onClick={handleLogin}
            className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-pink-50 border border-pink-200 hover:border-pink-300 text-pink-600 font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <LogIn className="h-4 w-4" /> เริ่มใช้งานฟรี
          </button>
        </header>

        {/* HERO SECTION CONTAINER */}
        <main className="w-full max-w-5xl mx-auto py-12 md:py-20 z-10 space-y-16 flex-grow flex flex-col justify-center">
          
          {/* Main Display Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Column: Visual copy */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 text-xs font-semibold uppercase tracking-wide">
                <Sparkles className="h-3.5 w-3.5 text-pink-500 animate-pulse" /> ระบบแจ้งเตือนท็อปพรีเมียมอันดับหนึ่งของไทย
              </div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-stone-900 tracking-tight leading-[1.1] md:leading-[1.05]">
                เด้งคำสั่งโอนขึ้นจอ <br />
                ด้วย <span className="text-pink-600 underline decoration-pink-200 decoration-8 font-black">Donate me!</span>
              </h1>
              
              <p className="text-stone-600 text-sm.5 sm:text-base leading-relaxed max-w-2xl mx-auto lg:mx-0">
                ปฏิวัติวงการสตรีมเมอร์ไทย! เชื่อมบัญชีรับเงินสนับสนุนง่ายๆ ทางอ้อมด้วยระบบสากล ปลุกสีสันให้ทุกวินาทีของยอดบริจาคด้วย <strong>ภาพ GIF ดิ่งแดนซ์ การเด้งการสแกน และเสียงอ่านสังเคราะห์ภาษาไทย (AI TTS)</strong> ตัวอักษรคมกริบแบบเรียลไทม์ผ่านเกตเวย์ความปลอดภัยพรีเมียม 🌸
              </p>

              {/* GSI Login Button Platform wrapper */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <button
                  onClick={handleLogin}
                  className="w-full sm:w-auto px-8 py-4 bg-pink-600 hover:bg-pink-700 active:bg-pink-950 text-white rounded-2xl font-extrabold text-base transition-all shadow-xl shadow-pink-600/10 flex items-center justify-center gap-3 cursor-pointer"
                >
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5.5 w-5.5">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>ล็อกอินเข้าสู่สถานีด้วย Google Sync</span>
                </button>
                
                <span className="text-stone-500 text-xs font-semibold">
                  ⚡ เข้าใช้งานอัตโนมัติภายใน 5 วินาที โดยไม่ต้องลงทะเบียนเพิ่ม!
                </span>
              </div>
            </div>

            {/* Right Column: Dynamic Mockup Preview Showcase */}
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="p-5 bg-white border-2 border-pink-100 rounded-3xl shadow-2xl relative max-w-sm w-full md:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="absolute top-2 right-2 flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                </div>

                <div className="flex justify-between items-center border-b border-pink-100 pb-3">
                  <span className="text-xs font-mono font-bold text-stone-500 flex items-center gap-1">
                    <Tv className="h-4 w-4 text-pink-600 animate-pulse" /> LIVE_STREAM_OVERLAY
                  </span>
                  <span className="h-2 w-2 rounded-full bg-pink-500 animate-ping"></span>
                </div>

                <div className="p-4 bg-pink-50/50 rounded-2xl border border-pink-100 flex flex-col items-center justify-center space-y-3.5 text-center min-h-[160px]">
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-pink-200 bg-white p-2">
                    <img
                      src="https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif"
                      alt="Sample Pikachu"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs.5 font-sans font-bold text-pink-700 bg-pink-100 rounded-full px-3 py-1 inline-block">
                      💖 คุณสมหญิง โอนสนับสนุน ฿100.00
                    </div>
                    <p className="text-[11px] text-stone-700 font-medium italic mt-1 font-mono">
                      "ฝากก้านไลฟ์และคำอวยพรรักสตรีมเมอร์นะค้าา! 🎉"
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-[#FAF7F2] rounded-xl border border-pink-50 flex items-center justify-between text-xs font-mono font-semibold text-stone-600">
                  <span>🔊 Thai TTS Voice:</span>
                  <span className="text-pink-600">วิเคราะห์อ่านอัจฉริยะ</span>
                </div>
              </div>
            </div>

          </div>

          {/* SECTION: HOW IT WORKS (วิธีการทำงานใน 3 ขั้นตอน) */}
          <section className="space-y-10 pt-10 border-t border-pink-100/60">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                วิธีการทำสตรีมร่วมแจ้งเตือนใน <span className="text-pink-600">3 ขั้นตอนง่ายๆ</span>
              </h2>
              <p className="text-stone-500 text-xs sm:text-sm max-w-xl mx-auto">
                เราตั้งใจย่อระดับความซับซ้อนให้มีผลเร็วที่สุด เพื่อให้คุณเพิ่มช่องทางโอนแจ้งเตือนได้ภายใน 1 นาที
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className="bg-white border border-pink-100 p-6 rounded-2xl space-y-4 hover:shadow-lg transition-all text-center md:text-left">
                <div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center border border-pink-100 mx-auto md:mx-0">
                  <Radio className="h-6 w-6 text-pink-600" />
                </div>
                <h3 className="text-base font-bold text-stone-900">1. เข้าสู่ระบบ Google Sync</h3>
                <p className="text-stone-500 text-xs.5 leading-relaxed">
                  คลิกปุ่มเข้าสู่ระบบด้วยบัญชี Google เพื่อผูกประวัติ บัญชีข้อมูลจะถูกดึงและตั้งค่าสิทธิโดยอัตโนมัติในทันที ไม่ต้องกรอกรหัสอะไรเพิ่ม
                </p>
              </div>

              {/* Card 2 */}
              <div className="bg-white border border-pink-100 p-6 rounded-2xl space-y-4 hover:shadow-lg transition-all text-center md:text-left">
                <div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center border border-pink-100 mx-auto md:mx-0">
                  <Settings className="h-6 w-6 text-pink-600" />
                </div>
                <h3 className="text-base font-bold text-stone-900">2. คัดลอกลิงก์ OBS Overlay</h3>
                <p className="text-stone-500 text-xs.5 leading-relaxed">
                  เมื่อระบบสร้างหน้าเสร็จเรียบร้อย คัดลอกพารามิเตอร์ลิงก์ Browser Source ไปวางบนโปรแกรมสตรีมใดก็ได้ของคุณ (OBS, Streamlabs, TikTok Live)
                </p>
              </div>

              {/* Card 3 */}
              <div className="bg-white border border-pink-100 p-6 rounded-2xl space-y-4 hover:shadow-lg transition-all text-center md:text-left">
                <div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center border border-pink-100 mx-auto md:mx-0">
                  <Coins className="h-6 w-6 text-pink-600" />
                </div>
                <h3 className="text-base font-bold text-stone-900">3. เริ่มเปิดรับยอดบริจาค</h3>
                <p className="text-stone-500 text-xs.5 leading-relaxed">
                  ส่งหน้าบริจาคหรือนำบาร์โค้ด QR ให้ผู้สนับสนุนสแกนจ่ายผ่านทางหน้าต่างบริจาค ส่วนหลังบ้านจะยิงขยับแจ้งเตือนทันที สลิตมีความโปร่งใส 100%
                </p>
              </div>
            </div>
          </section>

          {/* SECTION: Core Benefits & Advantage Cards */}
          <section className="bg-white border border-pink-100 rounded-3xl p-8 md:p-12 shadow-md grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight leading-snug">
                ฟีเจอร์เด่นระบบแจ้งเตือนโอนเงิน <span className="text-pink-600">ที่คุ้มค่าที่สุดในตลาด</span>
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-pink-100 text-pink-600 rounded-full p-1"><CheckCircle2 className="h-3.5 w-3.5" /></div>
                  <div className="text-xs.5 leading-relaxed">
                    <strong className="text-stone-900 block font-bold">📢 Thai AI Text-To-Speech (TTS)</strong>
                    เสียงสังเคราะห์ภาษาไทยธรรมชาติ ปรับเปิดปิดการอ่านเสียงและข้อความอวยพรร่วมจังหวะได้อย่างแม่นยำ
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-pink-100 text-pink-600 rounded-full p-1"><CheckCircle2 className="h-3.5 w-3.5" /></div>
                  <div className="text-xs.5 leading-relaxed">
                    <strong className="text-stone-900 block font-bold">⚡ บูรณาการรองรับบัตรเครดิตด่วนสากล</strong>
                    ผู้สนับสนุนพิมพ์จ่ายปลอดภัยผ่านเกตเวย์ Stripe ประมวลผลลัดวงจรไม่สร้างภาระการอัปโหลดเช็คซ้ำๆ
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-pink-100 text-pink-600 rounded-full p-1"><CheckCircle2 className="h-3.5 w-3.5" /></div>
                  <div className="text-xs.5 leading-relaxed">
                    <strong className="text-stone-900 block font-bold">🎨 เลือกแอนิเมชันกล่องแจ้งเตือนด้วย Presets</strong>
                    ตกแต่งใบปลวกเด้งหน้าจอสีสันสดใส เช่น แมวพิกเซล เหมียวดิ่งดี๊ด๊า ยอดทองพับ หรือภาพโปรไฟล์บัญชีของคุณ
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-pink-100 text-pink-600 rounded-full p-1"><CheckCircle2 className="h-3.5 w-3.5" /></div>
                  <div className="text-xs.5 leading-relaxed">
                    <strong className="text-stone-900 block font-bold">📊 ระบบพิมพ์บิลดาวน์โหลดรายงาน PDF บทบัญญัติการเงิน</strong>
                    ออกรายงานบิลกระดาษจัดเรียงสรุปช่วงเวลาประจำเดือนประจักษ์ ยอดรวม ยอดเฉลี่ย อย่างเป็นระบบ
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 bg-pink-50/40 p-6 rounded-2xl border border-pink-100/60">
              <span className="text-[10px] bg-pink-100 text-pink-700 font-extrabold uppercase px-2.5 py-1 rounded-full text-center tracking-wider block w-max">
                🟢 STRIPE CONNECT MOCK ACTIVE
              </span>
              
              <div className="space-y-3 font-medium text-stone-700">
                <h3 className="text-xs.5 font-bold text-pink-850">เกตเวย์ความปลอดภัยสากล</h3>
                <p className="text-xs leading-relaxed">
                  ระบบเชื่อมต่อโดยตรงกับบิลและตรวจสอบการโอนด้วยสิทธิครอบภัยที่ปลอดภัยที่สุด ตรวจจับการสแกนบัตรหรือชำระ PromptPay ได้ในระดับไมโครวินาที เพื่อเกลี่ยความผิดพลาดและการหลอกลวง
                </p>
                <div className="text-center pt-3">
                  <button
                    onClick={handleLogin}
                    className="w-full py-3.5 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-sm rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <LogIn className="h-4.5 w-4.5" /> เริ่มล็อกอินเข้าระบบทันทีเลย
                  </button>
                </div>
              </div>
            </div>
          </section>

        </main>

        {/* Footer */}
        <footer className="w-full max-w-6xl py-6 border-t border-pink-100/60 text-center text-xs text-stone-500 mt-10 z-10 space-y-1">
          <p>© 2026 PromptPay alert terminal & custom OBS stream trigger system. All rights reserved.</p>
          <p className="text-[10.5px] text-stone-400">พัฒนาบนฐานระบบปิดด้วย Firebase Cloud Security และ Stripe API ประสานตรวจตราบัตรสเตตัสสากล</p>
        </footer>

      </div>
    );
  }

  // B. Financial Statement Reporting Modal Screen View
  if (viewReport) {
    return (
      <div className="min-h-screen bg-[#FCFAF7] text-stone-850 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <InvoiceReport
            streamer={profile}
            donations={donations}
            onBack={() => setViewReport(false)}
          />
        </div>
      </div>
    );
  }

  // C. Authenticated Main Dashboard Portal
  const totalReceived = donations
    .filter(d => d.status === "completed")
    .reduce((sum, current) => sum + current.amount, 0);

  return (
    <div className="min-h-screen bg-[#FCFAF7] text-stone-800 flex flex-col justify-between">
      
      {/* Top Navbar Header */}
      <header className="border-b border-pink-100 bg-white sticky top-0 z-30 px-4 md:px-10 lg:px-14 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Donate me! Logo" className="h-10 w-10 object-contain" referrerPolicy="no-referrer" />
          <div>
            <h1 className="text-base font-black tracking-tight leading-none text-stone-900">Donate <span className="text-pink-600">me!</span></h1>
            <p className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest mt-0.5">ระบบสนับสนุนสตรีมเมอร์</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#FCFAF7] py-1.5 px-3 rounded-full border border-pink-100 text-xs">
            {profile.photoURL && (
               <img src={profile.photoURL} alt={profile.displayName} className="h-5 w-5 rounded-full object-cover" referrerPolicy="no-referrer" />
            )}
            <span className="font-bold text-stone-700">{profile.displayName}</span>
          </div>
          
          <button
            onClick={handleLogout}
            id="logout-btn"
            className="p-2 border border-pink-100 bg-white hover:bg-pink-50 text-stone-400 hover:text-pink-600 rounded-xl transition-all cursor-pointer"
            title="ออกจากระบบ"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* Main Content Workspace Grid */}
      <main className="flex-grow max-w-full w-full mx-auto px-4 md:px-10 lg:px-14 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Pinned Navigation (3 Cols) */}
        <section className="lg:col-span-3 flex flex-col gap-3">
          <button
            onClick={() => { setActiveTab("overview"); setViewReport(false); }}
            className={`w-full py-3.5 px-5 rounded-2xl border font-extrabold text-left text-xs sm:text-sm transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "overview" && !viewReport
                ? "bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/15"
                : "bg-white text-stone-600 border-pink-50 hover:bg-pink-50/50 hover:text-pink-600 shadow-sm"
            }`}
          >
            <Radio className="h-4.5 w-4.5" /> ภาพรวมคีย์บอร์ดความคืบหน้า
          </button>

          <button
            onClick={() => { setActiveTab("history"); setViewReport(false); }}
            className={`w-full py-3.5 px-5 rounded-2xl border font-extrabold text-left text-xs sm:text-sm transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "history" && !viewReport
                ? "bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/15"
                : "bg-white text-stone-600 border-pink-50 hover:bg-pink-50/50 hover:text-pink-600 shadow-sm"
            }`}
          >
            <Clock className="h-4.5 w-4.5" /> ประวัติการสนับสนุนสะสม
          </button>

          <button
            onClick={() => { setActiveTab("settings"); setViewReport(false); }}
            className={`w-full py-3.5 px-5 rounded-2xl border font-extrabold text-left text-xs sm:text-sm transition-all flex items-center gap-3 cursor-pointer ${
              activeTab === "settings" && !viewReport
                ? "bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/15"
                : "bg-white text-stone-600 border-pink-50 hover:bg-pink-50/50 hover:text-pink-600 shadow-sm"
            }`}
          >
            <Settings className="h-4.5 w-4.5" /> การตั้งค่าระบบ / บัญชีรับเงิน
          </button>

          <button
            onClick={() => setViewReport(true)}
            className="w-full py-3.5 px-5 rounded-2xl border border-pink-100 bg-white hover:bg-pink-50 text-pink-600 font-extrabold text-left text-xs sm:text-sm transition-all flex items-center gap-3 cursor-pointer shadow-sm"
          >
            <FileText className="h-4.5 w-4.5" /> บิลรายงานการเงินรายวัน/ปี
          </button>

          {/* Stripe Active Portal status notice banner */}
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-xs mt-4 leading-relaxed space-y-1">
            <span className="font-extrabold flex items-center gap-1.5 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ระบบ Stripe Gateway ออนไลน์
            </span>
            <span className="text-stone-500 block mt-1">ผู้สนับสนุนสามารถบริจาคอย่างปลอดภัย ผ่านบัตรเครดิตและการสแกนพร้อมเพย์ได้อย่างราบรื่น 100%</span>
          </div>
        </section>

        {/* RIGHT COLUMN: Active Views Pane (9 Cols) */}
        <section className="lg:col-span-9 space-y-8">
          
          {/* TAB 1: OVERVIEW PANEL */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              
              {/* Financial Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-pink-50 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                  <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">รายได้สนับสนุนรวม (บาท)</span>
                  <span className="text-3xl font-black mt-2 text-pink-600">{formatCurrency(totalReceived)}</span>
                </div>

                <div className="bg-white border border-pink-50 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                  <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">ยอดจำนวนครั้งโอนสำเร็จ</span>
                  <span className="text-3xl font-black mt-2 text-stone-800">
                    {donations.filter(d => d.status === "completed").length} ครั้ง
                  </span>
                </div>

                <div className="bg-white border border-pink-50 p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
                  <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">ธุรกรรมรอการตรวจสอบ</span>
                  <span className="text-3xl font-black mt-2 text-stone-600">
                    {donations.filter(d => d.status === "pending").length} บิล
                  </span>
                </div>
              </div>

              {/* Streaming OBS Links and Donations Card */}
              <div className="bg-white border border-pink-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-stone-900">ลิงค์ช่องทางและ overlay การเชื่อมโยงสตรีม</h2>
                  <p className="text-stone-500 text-xs mt-1">คัดลอกลิงค์เหล่านี้เพื่อนำไปตั้งเปิดหน้าสำหรับการโดเนท สนับสนุน หรือฝังแอนิเมชั่นบน OBS Studio</p>
                </div>

                <div className="space-y-4">

                  {/* Donor Donation Target URL */}
                  <div className="p-4 bg-[#FCFAF7] border border-pink-50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="font-extrabold text-sm text-pink-700 flex items-center gap-1.5">
                        <Globe className="h-4.5 w-4.5 text-pink-600 animate-pulse" /> หน้าลิงค์เป้าหมายสำหรับผู้สนับสนุน (Donation page)
                      </span>
                      <p className="text-stone-500 text-xs">นำลิงค์นี้ไปแสดงด้านในช่องแชท คำบรรยาย เพื่อให้ donors คลิกสแกนจ่ายสนับสนุน</p>
                    </div>

                    <div className="flex items-center gap-1.5 w-full md:w-auto">
                      <input
                        type="text"
                        readOnly
                        value={getAbsoluteURL("donate", profile.uid)}
                        className="bg-white text-stone-700 text-xs rounded-lg p-2.5 focus:outline-none w-full md:w-64 border border-pink-100 font-mono select-all.5"
                      />
                      <button
                        onClick={() => copyToClipboard(getAbsoluteURL("donate", profile.uid), "Donation Page")}
                        className="px-4 py-2.5 bg-pink-600 hover:bg-pink-700 active:bg-pink-900 rounded-lg text-xs font-bold transition-all cursor-pointer text-white flex items-center gap-1 shrink-0"
                      >
                        คัดลอก
                      </button>
                    </div>
                  </div>

                  {/* OBS Alert Overlay URL */}
                  <div className="p-4 bg-[#FCFAF7] border border-pink-50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <span className="font-extrabold text-sm text-pink-700 flex items-center gap-1.5">
                        <Radio className="h-4.5 w-4.5 text-pink-600" /> ลิงก์ดึงหน้าจอแจ้งเตือน (OBS Browser Source / Alert Overlay)
                      </span>
                      <p className="text-stone-500 text-xs">คัดลอกลิงก์นี้ไปใส่ใน Browser Source ของ OBS เพื่อให้แสดงเสียงและภาพอนิเมชันแบบสปอยบนไลฟ์สตรีม</p>
                    </div>

                    <div className="flex items-center gap-1.5 w-full md:w-auto">
                      <input
                        type="text"
                        readOnly
                        value={getAbsoluteURL("overlay", profile.uid)}
                        className="bg-white text-stone-700 text-xs rounded-lg p-2.5 focus:outline-none w-full md:w-64 border border-pink-100 font-mono select-all.5"
                      />
                      <button
                        onClick={() => copyToClipboard(getAbsoluteURL("overlay", profile.uid), "OBS Alert Overlay")}
                        className="px-4 py-2.5 bg-pink-600 hover:bg-pink-700 active:bg-pink-900 rounded-lg text-xs font-bold transition-all cursor-pointer text-white flex items-center gap-1 shrink-0"
                      >
                        คัดลอก
                      </button>
                    </div>
                  </div>

                </div>

                <div className="p-4 rounded-xl bg-pink-50/40 border border-pink-100 text-xs text-pink-900 flex items-start gap-3">
                  <div className="p-1 px-2 py-0.5 rounded bg-pink-100 font-bold shrink-0">⚠️ คำแนะนำพิเศษ:</div>
                  <p className="leading-relaxed">
                    คุณสามารถทดสอบหน้าจอแจ้งเตือนได้ทันที! โดยการคัดลอกลิงก์ <b>OBS Browser Source</b> ข้างต้นไปวางเปิดบนแท็บต่างหากในเบราว์เซอร์ จากนั้นเลื่อนลงมาที่กล่องดีบักข้างล่างเพื่อกดปุ่ม <b>"ส่งคำขอแจ้งเตือนจำลอง"</b> และฟังเสียงตรวจสอบความเรียบร้อย
                  </p>
                </div>
              </div>

              {/* Interactive Test Notification Card */}
              <div className="bg-white border border-pink-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-stone-950 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-pink-600" /> 🔔 ทดสอบระบบการทำงานของการแจ้งเตือนด่วน (Instant Tester)
                  </h2>
                  <p className="text-stone-500 text-xs.5 mt-1">
                    จำลองรูปแบบหน้าตา ชื่อ สื่ออวยพร และจำนวนเงินเพื่อยิงเสียงและภาพ GIF ออกไปยังจอ OBS ทันที ณ หมวดหมู่นี้
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-stone-500 font-extrabold mb-1.5">ชื่อผู้โอนจำลอง</label>
                    <input
                      type="text"
                      placeholder="เช่น สมชาย ใจดี"
                      value={testDonorName}
                      onChange={(e) => setTestDonorName(e.target.value)}
                      className="w-full bg-[#FAF7F2] border border-pink-50 rounded-lg p-2.5 text-xs text-stone-850 placeholder-stone-400 focus:outline-none focus:border-pink-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 font-extrabold mb-1.5">ยอดโอน (บาท)</label>
                    <input
                      type="number"
                      placeholder="เช่น 100"
                      value={testAmount || ""}
                      onChange={(e) => setTestAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                      className="w-full bg-[#FAF7F2] border border-pink-50 rounded-lg p-2.5 text-xs text-pink-600 placeholder-stone-400 focus:outline-none focus:border-pink-500 font-black"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 font-extrabold mb-1.5">คำอวยพรร่วมแอนิเมชั่น</label>
                    <input
                      type="text"
                      placeholder="เช่น ฝากดันสตรีมมิ่งด้วยจ้า!"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="w-full bg-[#FAF7F2] border border-pink-50 rounded-lg p-2.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-pink-500 font-bold"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTriggerTestAlert}
                  disabled={testLoading}
                  className="w-full py-3.5 bg-pink-700 hover:bg-pink-800 active:bg-pink-950 text-white font-extrabold text-sm rounded-xl transition-all shadow-md shadow-pink-700/10 cursor-pointer flex items-center justify-center gap-2"
                >
                  {testLoading ? (
                    <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    "🚀 ทดสอบส่งข้อความและยอดจำลองไปยัง OBS ทันที (Trigger OBS Alert)"
                  )}
                </button>
              </div>

              {/* Transactions list layout snippet */}
              <div className="bg-white border border-pink-150 rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold tracking-tight text-stone-900">รายการสนับสนุนเงินล่าสุด</h2>
                  <button
                    onClick={() => setActiveTab("history")}
                    className="text-pink-600 text-xs font-bold hover:underline flex items-center gap-1"
                  >
                    ดูคำร้องโอนทั้งหมด <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {donations.slice(0, 4).length > 0 ? (
                    donations.slice(0, 4).map((record) => (
                      <div key={record.id} className="p-4 bg-[#FCFAF7] rounded-xl border border-pink-50 flex items-center justify-between gap-4 text-sm font-medium hover:shadow-xs transition-all">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-stone-800">{record.donorName}</span>
                            <span className="text-[10px] text-stone-400 font-mono">บิล: {record.id.substring(0, 8)}</span>
                          </div>
                          {record.message && <p className="text-stone-500 text-xs italic">"{record.message}"</p>}
                          <span className="text-[11px] text-stone-400 block">{formatDate(record.createdAt)}</span>
                        </div>

                        <div className="text-right flex flex-col items-end gap-1.5">
                          <span className="text-pink-600 font-black text-sm.5">{formatCurrency(record.amount)}</span>
                          {record.status === "completed" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> โอนเรียบร้อย
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-400 border border-stone-200">
                              <Clock className="h-3 w-3" /> รอการจ่าย
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-stone-400 italic text-sm">
                      คุณยังว่างเปล่าไม่มีรายการโอนเงินสนับสนุนในขณะนี้
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: COMPLETE TRANSACTION HISTORY */}
          {activeTab === "history" && (
            <div className="bg-white border border-pink-105 rounded-2xl p-6 shadow-sm space-y-6 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-stone-900">คลังประวัติผู้สนับสนุนสะสม</h2>
                  <p className="text-stone-500 text-xs mt-1">ประวัติครอบคลุมตรวจสอบรายการสลิปและบัตรผ่านเข้าเกตเวย์ Stripe อย่างครบครัน</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setViewReport(true)}
                    className="px-4.5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-pink-600/10 cursor-pointer"
                  >
                    <FileText className="h-4 w-4" /> ดูรายงานบัญชีสรุปแนวนอน/ตั้ง
                  </button>

                  <button
                    onClick={handleClearHistory}
                    disabled={clearLoading}
                    className="px-4.5 py-2.5 bg-red-50 hover:bg-red-100 disabled:bg-stone-50 text-red-600 font-extrabold text-xs border border-red-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" /> ล้างประวัติการโดเนททั้งหมด
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {donations.length > 0 ? (
                  donations.map((record) => (
                    <div key={record.id} className="p-4.5 bg-[#FCFAF7] rounded-xl border border-pink-50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm font-medium hover:shadow-xs transition-all">
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-stone-800 text-base">{record.donorName}</span>
                          <span className="text-[10px] text-stone-500 font-mono bg-white border border-pink-100 px-1.5 py-0.5 rounded">
                            บิล: {record.id}
                          </span>
                          <span className="text-[10px] text-pink-700 font-extrabold bg-pink-50 border border-pink-100 px-1.5 py-0.5 rounded">
                            Stripe Connected
                          </span>
                        </div>
                        {record.message && (
                          <p className="text-stone-600 text-xs italic bg-white py-1.5 px-3 rounded-lg border border-pink-50">
                            "{record.message}"
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 text-[11px] text-stone-500">
                          <span>วันโอน: {formatDate(record.createdAt)}</span>
                          {record.triggered ? (
                            <span className="text-pink-600 font-extrabold text-[10px] uppercase">● แสดงหน้าจอเรียบร้อย</span>
                          ) : (
                            <span className="text-stone-400 font-semibold text-[10px] uppercase">● ตรวจคิวหน้าจอ</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-stretch md:items-end justify-center gap-2">
                        <span className="text-pink-600 font-black text-xl">{formatCurrency(record.amount)}</span>
                        
                        <div className="flex gap-2 justify-end">
                          {record.status === "completed" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> สำเร็จ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-400 border border-stone-200">
                              <Clock className="h-3 w-3" /> รอยืนยัน
                            </span>
                          )}

                          {record.slipVerified && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-200">
                              Verified
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  ))
                ) : (
                  <div className="py-24 text-center text-stone-400 italic text-sm">
                    ประวัติตัวตนของคุณยังไม่มีรายการสนับสนุนใดๆ เข้ามาเลย
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PROFILE SETTINGS */}
          {activeTab === "settings" && (
            <form onSubmit={handleSaveSettings} className="bg-white border border-pink-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-8 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-stone-900">การตั้งค่าระบบ & บัญชีรับโอนเงินโดยตรง</h2>
                <p className="text-stone-500 text-xs mt-1">
                  แก้ไขข้อมูลเหล่านี้สำหรับประดับหน้าต้อนรับผู้สนับสนุนของคุณ และปรับจูนแอนิเมชั่น overlay
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-pink-100">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-pink-600 uppercase tracking-widest">ข้อมูลช่องสตรีมเมอร์</h3>
                  
                  {/* Name */}
                  <div>
                    <label className="block text-xs text-stone-500 font-bold mb-2">
                      ชื่อสตรีมเมอร์รับบิล (Display Name)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น พี่แอดสตรีมดีเจ"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-3 text-sm focus:outline-none focus:border-pink-500 font-bold text-stone-800"
                    />
                  </div>

                  {/* Bio Description */}
                  <div>
                    <label className="block text-xs text-stone-500 font-bold mb-2">
                      คำแนะนำทักทาย (Bio)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="คำทักทายหรือการตั้งรายละเอียดที่ด้านบนใบสมัครสนับสนุน..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-3 text-sm focus:outline-none focus:border-pink-500 text-stone-700 font-medium resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-pink-600 uppercase tracking-widest">เกตเวย์การรับเงิน (Stripe Gateway)</h3>

                  {/* Informational Stripe Status Card */}
                  <div className="p-5 bg-[#FCFAF7] rounded-xl border border-pink-100 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                      <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider block">🟢 ชำระเงินหลัก: บัตรเครดิต, เดบิต และ PromptPay QR</span>
                    </div>

                    <p className="text-xs text-stone-600 leading-relaxed">
                      ระบบของคุณใช้ประโยชน์จากเทคโนโลยีโอนเงินคลาวด์ความปลอดภัยสูงของ <strong>Stripe System</strong> ทุกครั้งที่มีการโดเนท บิลจะได้รับการจำแนกสเตตัสออนไลน์ทันใจ
                    </p>

                    <div className="p-3.5 bg-white rounded-lg border border-pink-50 space-y-2 text-[11px] font-mono text-zinc-500">
                      <div className="flex justify-between">
                        <span>เกตเวย์สเตตัส (Gateway ID):</span>
                        <span className="text-emerald-600 font-bold">Stripe SEC_ACTIVE</span>
                      </div>
                      <div className="flex justify-between">
                        <span>สกุลเงินรับรอง (Currency):</span>
                        <span className="text-stone-800">Thai Baht (THB)</span>
                      </div>
                    </div>

                    <span className="text-[10px] text-stone-400 block leading-normal text-center italic">
                      * ไม่จำเป็นต้องระบุเลขระบบ บัตรทุกรูปแบบจะทำงานอัตโนมัติ 100%
                    </span>
                  </div>
                </div>
              </div>

              {/* OBS Overlay Customization */}
              <div className="space-y-6">
                <h3 className="text-xs font-bold text-pink-600 uppercase tracking-widest">การปรับจูบตำแหน่งเเละขนาดยี่ห้อกล่อง OBS Overlay</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Min trigger Sum value */}
                  <div>
                    <label className="block text-xs text-stone-500 font-bold mb-2">
                      ขั้นต่ำการส่งเสียงแจ้งเตือน (THB)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={minDonationAlert}
                      onChange={(e) => setMinDonationAlert(Number(e.target.value))}
                      className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-3 text-sm focus:outline-none focus:border-pink-500 text-pink-600 font-black"
                    />
                    <span className="text-[10px] text-stone-400 mt-1.5 block">
                      ยอดสนับสนุนสะสมเพื่อเริ่มยิงแอนิเมชั่นและเล่นเสียงสังเคราะห์ (TTS Reader) เลี่ยงยอดโอนแบบป่วน
                    </span>
                  </div>

                  {/* TTS sound switch */}
                  <div className="flex flex-col justify-end">
                    <div className="flex gap-2">
                      <label className="flex-grow inline-flex items-center gap-3.5 bg-[#FCFAF7] border border-pink-100 rounded-xl p-3.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ttsEnabled}
                          onChange={(e) => setTtsEnabled(e.target.checked)}
                          className="h-5 w-5 rounded border-pink-200 bg-white text-pink-600 focus:ring-0 focus:ring-offset-0 accent-pink-600"
                        />
                        <div className="text-left">
                          <span className="block text-xs sm:text-sm font-bold text-stone-800">เปิดระบบอ่านเสียงสังเคราะห์ (TTS Reader)</span>
                          <span className="block text-[10px] text-stone-400 leading-none mt-1">อ่านรายงานคำอวยพรชื่อสปอนเซอร์ภาษาไทยอัจฉริยะ</span>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => playTTSAlert("ขอบคุณผู้สนับสนุนสำหรับการสุ่มจำลองแจ้งเตือนเสียงผู้หญิงภาษาไทยค่ะ")}
                        className="px-3.5 bg-pink-50 hover:bg-pink-100 active:bg-pink-200 text-pink-700 font-extrabold text-xs rounded-xl transition-all flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer border border-pink-100"
                        title="ทดสอบฟังเสียงสังเคราะห์ภาษาไทย"
                      >
                        <Mic className="h-4 w-4 text-pink-600" />
                        <span>ฟังเสียง AI</span>
                      </button>
                    </div>
                  </div>

                  {/* Sound Trigger Selection */}
                  <div>
                    <label className="block text-xs text-stone-500 font-bold mb-2 flex items-center gap-1">
                      <Volume2 className="h-4 w-4 text-pink-600" /> เสียงเอฟเฟกต์ดนตรีแจ้งเตือน (Sound SFX)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={overlaySound}
                        onChange={(e) => setOverlaySound(e.target.value)}
                        className="flex-grow bg-[#FCFAF7] border border-pink-50 rounded-lg p-3 text-sm focus:outline-none focus:border-pink-500 font-semibold text-stone-800"
                      >
                        {soundThemes.map(t => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => playAlertSound(overlaySound)}
                        className="px-4.5 bg-pink-50 hover:bg-pink-100 active:bg-pink-200 text-pink-700 font-extrabold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                        title="ฟังตัวอย่าง"
                      >
                        ฟังตัวอย่าง
                      </button>
                    </div>
                  </div>

                  {/* GIF Trigger Selection */}
                  <div>
                    <label className="block text-xs text-stone-500 font-bold mb-2 flex items-center gap-1">
                      <ImageIcon className="h-4 w-4 text-pink-600" /> ภาพแอนิเมชั่นแสดงตอนเด้ง (GIF Preset)
                    </label>
                    <select
                      value={overlayGif}
                      onChange={(e) => setOverlayGif(e.target.value)}
                      className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-3 text-sm focus:outline-none focus:border-pink-500 font-semibold text-stone-800"
                    >
                      {gifThemes.map(t => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    
                    {/* Live Preview Block */}
                    <div className="mt-3 flex items-center gap-3 p-2 bg-[#FCFAF7] border border-pink-50 rounded-xl">
                      <div className="w-12 h-12 bg-white rounded-lg overflow-hidden shrink-0 border border-pink-50 flex items-center justify-center">
                        {overlayGif === "profile_photo" ? (
                          profile?.photoURL ? (
                            <img src={profile.photoURL} alt="Profile photo preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="text-stone-400 text-[10px] text-center p-1 font-bold">ไม่มีรูป</div>
                          )
                        ) : (
                          <img
                            src={
                              overlayGif === "pikachu"
                                ? "https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif"
                                : overlayGif.trim() === "cute_cat"
                                ? "https://media.giphy.com/media/MWSR5TGOuXY9G/giphy.gif"
                                : overlayGif === "coin"
                                ? "https://media.giphy.com/media/Y8S9xo9OnonS5Z7K4Z/giphy.gif"
                                : overlayGif === "heart"
                                ? "https://media.giphy.com/media/8byZThhLaUms4bM3g3/giphy.gif"
                                : ""
                            }
                            alt="Preset preview representation"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      <span className="text-[10px] text-stone-500 leading-tight">
                        👁️ ตัวอย่างแอนิเมชั่นที่จะเด้งสว่างขึ้นมาบนหน้าจอสตรีมจริงเมื่อยอดโอนอนุมัติ
                      </span>
                    </div>
                  </div>

                  {/* Visual Drag and Position Overlay Layout */}
                  <div className="md:col-span-2 bg-[#FCFAF7] border border-pink-100 rounded-2xl p-5 md:p-6 space-y-5 mt-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-extrabold text-pink-700 flex items-center gap-1.5 animate-pulse">
                          🖥️ ปรับจูนตำแหน่งพิกัดเด้งหน้าจอ (Live OBS Position Editor)
                        </h4>
                        <p className="text-[10px] text-stone-500 mt-1">
                          เลือกพิกัดจุดเด้งโดยคลิกบนกรอบจำลอง สัดส่วนจะคำนวณตำแหน่งอย่างแม่นยำ 100%
                        </p>
                      </div>

                      {/* Aspect Ratio Selector */}
                      <div className="flex gap-1.5 bg-white p-1 rounded-lg border border-pink-100 shrink-0">
                        <button
                          type="button"
                          onClick={() => setOverlayAspectFormat("16:9")}
                          className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                            overlayAspectFormat === "16:9"
                              ? "bg-pink-600 text-white shadow-xs"
                              : "text-stone-500 hover:text-stone-900"
                          }`}
                        >
                          แนวนอน 16:9 (Desktop)
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverlayAspectFormat("9:16")}
                          className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                            overlayAspectFormat === "9:16"
                              ? "bg-pink-600 text-white shadow-xs"
                              : "text-stone-500 hover:text-stone-900"
                          }`}
                        >
                          แนวตั้ง 9:16 (TikTok/Shorts)
                        </button>
                      </div>
                    </div>

                    {/* Interactive Simulated Screen Canvas Area */}
                    <div className="flex flex-col lg:flex-row gap-6">
                      
                      {/* Left: TV Simulated Frame Container */}
                      <div className="flex-grow flex items-center justify-center bg-white rounded-xl p-4 border border-pink-50">
                        <div className="w-full flex flex-col items-center">
                          <span className="text-[10px] text-stone-500 mb-2 uppercase font-mono tracking-wider text-center font-bold">
                            📺 พรีวิวจอด่วน ({overlayAspectFormat === "16:9" ? "16:9 Landscape" : "9:16 Portrait"}) - จิ้มเลือกจุดย้ายตําเเหน่งกล่องได้เลย!
                          </span>
                          
                          {/* Simulated Canvas bounding screen */}
                          <div
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = ((e.clientX - rect.left) / rect.width) * 100;
                              const y = ((e.clientY - rect.top) / rect.height) * 100;
                              setOverlayPositionX(Math.round(x));
                              setOverlayPositionY(Math.round(y));
                            }}
                            className={`relative bg-stone-950 border-2 border-dashed border-pink-200 shadow-inner overflow-hidden cursor-crosshair select-none transition-all duration-300 rounded-lg ${
                              overlayAspectFormat === "16:9"
                                ? "w-full max-w-lg aspect-video"
                                : "w-44 md:w-52 aspect-[9/16]"
                            }`}
                          >
                            {/* Gridlines in TV for aid */}
                            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none opacity-5">
                              <div className="border border-white w-full h-full"></div>
                              <div className="border border-white w-full h-full"></div>
                              <div className="border border-white w-full h-full"></div>
                              <div className="border border-white w-full h-full"></div>
                            </div>

                            {/* Center-lines for guidelines */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="border-t border-dashed border-pink-400/20 w-full absolute"></div>
                              <div className="border-l border-dashed border-pink-400/20 h-full absolute"></div>
                            </div>

                            {/* Simulated active dynamic Alert box item */}
                            <div
                              style={{
                                position: "absolute",
                                left: `${overlayPositionX}%`,
                                top: `${overlayPositionY}%`,
                                transform: `translate(-50%, -50%) scale(${overlayScale * 0.45})`,
                                transformOrigin: "center center",
                                pointerEvents: "none"
                              }}
                              className="w-40 md:w-44 bg-white border border-pink-200 p-2 md:p-3 rounded-2xl text-center flex flex-col items-center justify-center whitespace-nowrap shadow-lg transition-all"
                            >
                              <div className="w-8 h-8 md:w-10 md:h-10 mb-1">
                                <img
                                  src={
                                    overlayGif === "profile_photo"
                                      ? (profile?.photoURL || "https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif")
                                      : overlayGif === "pikachu"
                                      ? "https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif"
                                      : overlayGif === "cute_cat"
                                      ? "https://media.giphy.com/media/MWSR5TGOuXY9G/giphy.gif"
                                      : overlayGif === "coin"
                                      ? "https://media.giphy.com/media/Y8S9xo9OnonS5Z7K4Z/giphy.gif"
                                      : overlayGif === "heart"
                                      ? "https://media.giphy.com/media/8byZThhLaUms4bM3g3/giphy.gif"
                                      : "https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif"
                                  }
                                  alt="Preview representation"
                                  className="w-full h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="text-[7.5px] font-extrabold text-stone-900">สมชาย ใจดี</div>
                              <div className="bg-pink-600 text-white px-1 py-0.5 rounded text-[6.5px] font-black my-0.5">โอนแล้ว ฿100.00</div>
                              <div className="text-[5px] text-stone-500 font-bold font-mono">"ฝากดันสตรีมน้า ขอบคุณจ้า!"</div>
                            </div>

                            {/* Coordinates Indicator */}
                            <div className="absolute bottom-2 left-2 bg-stone-900/90 px-2 py-0.5 rounded border border-pink-900/10 text-[8px] text-pink-200 pointer-events-none font-mono">
                              X: {overlayPositionX}% | Y: {overlayPositionY}% | Zoom: {overlayScale}x
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Preset controller buttons */}
                      <div className="w-full lg:w-72 flex flex-col justify-between gap-5 shrink-0">
                        
                        <div className="space-y-2">
                          <label className="block text-[10px] text-stone-500 font-extrabold uppercase tracking-wider">🎯 เลือกตำแหน่งด่วน (Presets)</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(15); setOverlayPositionY(15); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ↖️ ซ้ายบน
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(50); setOverlayPositionY(15); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ⬆️ กลางบน
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(85); setOverlayPositionY(15); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ↗️ ขวาบน
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(15); setOverlayPositionY(50); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ⬅️ ซ้ายกลาง
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(50); setOverlayPositionY(50); }}
                              className="px-2 py-2 bg-pink-600 hover:bg-pink-700 rounded-lg text-[10px] text-white font-extrabold transition-all cursor-pointer text-center"
                            >
                              🎯 กลางเป๊ะ
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(85); setOverlayPositionY(50); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ➡️ ขวากลาง
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(15); setOverlayPositionY(85); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ↙️ ซ้ายล่าง
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(50); setOverlayPositionY(85); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ⬇️ กลางล่าง
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOverlayPositionX(85); setOverlayPositionY(85); }}
                              className="px-2 py-2 bg-white hover:bg-pink-50 rounded-lg border border-pink-100 text-[10px] text-stone-700 font-bold transition-all cursor-pointer"
                            >
                              ↘️ ขวาล่าง
                            </button>
                          </div>
                        </div>

                        {/* Interactive sliders */}
                        <div className="space-y-3 bg-white p-4 border border-pink-100 rounded-xl">
                          
                          {/* Slider X */}
                          <div>
                            <div className="flex justify-between items-center text-[10px] text-stone-600 font-extrabold mb-1">
                              <span>↔️ แนวราบ พิกัด X</span>
                              <span className="font-mono text-pink-600 font-black">{overlayPositionX}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={overlayPositionX}
                              onChange={(e) => setOverlayPositionX(Number(e.target.value))}
                              className="w-full accent-pink-600 cursor-pointer h-1.5 bg-[#FAF7F2] rounded-full appearance-none"
                            />
                          </div>

                          {/* Slider Y */}
                          <div>
                            <div className="flex justify-between items-center text-[10px] text-stone-600 font-extrabold mb-1">
                              <span>↕️ แนวดิ่ง พิกัด Y</span>
                              <span className="font-mono text-pink-600 font-black">{overlayPositionY}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={overlayPositionY}
                              onChange={(e) => setOverlayPositionY(Number(e.target.value))}
                              className="w-full accent-pink-600 cursor-pointer h-1.5 bg-[#FAF7F2] rounded-full appearance-none"
                            />
                          </div>

                          {/* Slider Scaling Scale */}
                          <div>
                            <div className="flex justify-between items-center text-[10px] text-stone-600 font-extrabold mb-1">
                              <span>🔍 สเกลสัดส่วน Zoom</span>
                              <span className="font-mono text-pink-600 font-black">{overlayScale}x</span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="2.0"
                              step="0.05"
                              value={overlayScale}
                              onChange={(e) => setOverlayScale(Number(e.target.value))}
                              className="w-full accent-pink-600 cursor-pointer h-1.5 bg-[#FAF7F2] rounded-full appearance-none"
                            />
                          </div>

                        </div>
                        
                      </div>

                    </div>
                  </div>

                </div>

              </div>

              {/* Submit panel */}
              <div className="pt-4 border-t border-pink-100 flex justify-end">
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-8 py-3.5 bg-pink-600 hover:bg-pink-700 text-white font-extrabold rounded-xl transition-all shadow-md shadow-pink-600/10 cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {saveLoading ? "กำลังปกป้องข้อมูล..." : "บันทึกการตั้งค่าทั้งหมดลงคลาวด์"}
                </button>
              </div>

            </form>
          )}

        </section>

      </main>

      {/* Footer System information */}
      <footer className="border-t border-pink-100 bg-white py-6 text-center text-xs text-stone-500 font-medium space-y-0.5">
        <p>Donate me! - ระบบสนับสนุนสตรีมเมอร์ © 2026</p>
        <p className="text-[10px] text-stone-400">พัฒนาด้วยสถาปัตยกรรม Google Cloud, Firestore Secured และมาตรฐานเกตเวย์ Stripe Connect</p>
      </footer>

    </div>
  );
}
