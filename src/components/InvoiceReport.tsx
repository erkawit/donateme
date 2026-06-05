import { useState, useMemo } from "react";
import { DonationRecord, StreamerProfile } from "../types";
import { formatCurrency, formatDate } from "../utils";
import { Printer, Calendar, ArrowLeft, TrendingUp, DollarSign, ListCollapse, FileText } from "lucide-react";

interface InvoiceReportProps {
  streamer: StreamerProfile;
  donations: DonationRecord[];
  onBack: () => void;
}

type ReportRangeType = "daily" | "monthly" | "yearly" | "custom";

export default function InvoiceReport({ streamer, donations, onBack }: InvoiceReportProps) {
  const [reportRange, setReportRange] = useState<ReportRangeType>("monthly");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  // Custom Date Range
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().substring(0, 10));

  // 1. Filter donations matching report date ranges
  const filteredDonations = useMemo(() => {
    return donations.filter((donation) => {
      // Ensure only completed payments are part of standard financial audits
      if (donation.status !== "completed") return false;

      const dateObj = new Date(donation.createdAt);
      const donationDateStr = dateObj.toISOString().substring(0, 10);
      const donationMonthStr = dateObj.toISOString().substring(0, 7);
      const donationYearNum = dateObj.getFullYear();

      switch (reportRange) {
        case "daily":
          return donationDateStr === selectedDate;
        case "monthly":
          return donationMonthStr === selectedMonth;
        case "yearly":
          return donationYearNum === selectedYear;
        case "custom":
          return donationDateStr >= startDate && donationDateStr <= endDate;
        default:
          return true;
      }
    });
  }, [donations, reportRange, selectedDate, selectedMonth, selectedYear, startDate, endDate]);

  // 2. Financial Metrics Sum / Count calculations
  const totalFinancials = useMemo(() => {
    let rawSum = 0;
    filteredDonations.forEach((d) => (rawSum += d.amount));
    const average = filteredDonations.length > 0 ? rawSum / filteredDonations.length : 0;
    
    // Max transaction
    const maxVal = filteredDonations.length > 0 
      ? Math.max(...filteredDonations.map((d) => d.amount)) 
      : 0;

    return {
      totalSum: rawSum,
      volumeCount: filteredDonations.length,
      averageGift: average,
      maxInvoice: maxVal,
    };
  }, [filteredDonations]);

  // 3. Trigger raw browser printer settings
  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="invoice-bill-report-view" className="space-y-6">
      
      {/* Control Box: Selecting Ranges (Excluded from print output using CSS) */}
      <div className="bg-white border border-pink-100 rounded-2xl p-6 shadow-md print:hidden flex flex-col gap-6">
        
        {/* Navigation Action */}
        <div className="flex items-center gap-2 justify-between border-b border-pink-50 pb-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#FCFAF7] hover:bg-pink-50 text-pink-700 text-xs font-bold rounded-xl transition-all border border-pink-100 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> ย้อนกลับไปแดชบอร์ด
          </button>
          
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-pink-50 text-pink-600 border border-pink-100 rounded-full text-xs font-bold">
            <FileText className="h-3.5 w-3.5" /> รายงานบัญชีมาตรฐานสตรีมเมอร์
          </span>
        </div>

        {/* Filter Forms */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          
          {/* A. Selector Range Mode */}
          <div>
            <label className="block text-xs text-stone-500 font-extrabold mb-2 uppercase tracking-wider">
              ประเภทการออกรายงาน
            </label>
            <select
              value={reportRange}
              onChange={(e) => setReportRange(e.target.value as ReportRangeType)}
              className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-3 text-sm focus:outline-none focus:border-pink-550 font-semibold text-stone-800"
            >
              <option value="daily">รายวัน (Daily Statement)</option>
              <option value="monthly">รายเดือน (Monthly Report)</option>
              <option value="yearly">รายปี (Yearly Audit)</option>
              <option value="custom">กำหนดช่วงเวลาเอง (Custom Range)</option>
            </select>
          </div>

          {/* B. Specific Parameters based on range choice */}
          {reportRange === "daily" && (
            <div>
              <label className="block text-xs text-stone-500 font-extrabold mb-2 uppercase tracking-wider">
                เลือกวันที่ต้องการออกรายงาน
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-2.5 text-sm focus:outline-none focus:border-pink-500 font-semibold text-stone-800"
              />
            </div>
          )}

          {reportRange === "monthly" && (
            <div>
              <label className="block text-xs text-stone-500 font-extrabold mb-2 uppercase tracking-wider">
                เลือกเดือนและปี
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-2.5 text-sm focus:outline-none focus:border-pink-500 font-semibold text-stone-800"
              />
            </div>
          )}

          {reportRange === "yearly" && (
            <div>
              <label className="block text-xs text-stone-500 font-extrabold mb-2 uppercase tracking-wider">
                ระบุปี พ.ศ. / ค.ศ.
              </label>
              <input
                type="number"
                min={2020}
                max={2030}
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-2.5 text-sm focus:outline-none focus:border-pink-500 font-semibold text-stone-800"
              />
            </div>
          )}

          {reportRange === "custom" && (
            <>
              <div>
                <label className="block text-xs text-stone-500 font-extrabold mb-1.5 uppercase tracking-wider">
                  ตั้งแต่วันที่
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-2.5 text-sm focus:outline-none focus:border-pink-500 text-stone-800 font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 font-extrabold mb-1.5 uppercase tracking-wider">
                  ถึงวันที่
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#FCFAF7] border border-pink-50 rounded-lg p-2.5 text-sm focus:outline-none focus:border-pink-500 text-stone-800 font-semibold"
                />
              </div>
            </>
          )}

          {/* Print trigger CTA */}
          <div className="lg:col-span-1">
            <button
              onClick={handlePrint}
              className="w-full px-5 py-3 bg-pink-600 hover:bg-pink-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-pink-600/10"
            >
              <Printer className="h-4.5 w-4.5" /> สั่งพิมพ์ / PDF
            </button>
          </div>

        </div>

      </div>

      {/* RENDER STYLES for Printable Portrait Sheets (Supports print preview layout naturally) */}
      <div className="flex justify-center bg-[#FCFAF7] py-4 print:p-0">
        
        {/* The Standard Sheet Portrait Page Template wrapper */}
        <div 
          id="printable-portrait-sheet"
          className="w-[21cm] min-h-[29.7cm] bg-white text-zinc-900 p-12 shadow-md relative flex flex-col justify-between border border-pink-100 rounded-3xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0"
        >
          
          <div className="space-y-8">
            {/* 1. Report Document Header */}
            <div className="flex justify-between items-start border-b-2 border-pink-600 pb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-neutral-900 uppercase">
                  รายงานสรุปยอดโอนสนับสนุนสตรีมเมอร์
                </h1>
                <p className="text-pink-600 text-xs font-semibold uppercase mt-0.5 tracking-wider">
                  Stripe secure donation statement report
                </p>
                <div className="mt-4 space-y-1 text-xs text-zinc-500 font-medium">
                  <div>ผู้รับเงินสะสม: <span className="font-bold text-zinc-800">{streamer.displayName}</span></div>
                  <div>ระบบรับชำระและประมวลธุรกรรมบัตร: <span className="font-bold text-zinc-800">Stripe Payment Gateway</span></div>
                  <div>อีเมลบันทึกย่อ: <span className="text-zinc-800">{streamer.email}</span></div>
                </div>
              </div>
              
              <div className="text-right flex flex-col items-end">
                <div className="text-md font-bold bg-pink-50 text-pink-700 px-4 py-1.5 rounded-lg border border-pink-200">
                  {reportRange === "daily" && "Daily Statement"}
                  {reportRange === "monthly" && "Monthly Audits"}
                  {reportRange === "yearly" && "Yearly Statement"}
                  {reportRange === "custom" && "Custom Audit Report"}
                </div>
                <div className="text-xs text-zinc-500 mt-3 space-y-0.5 font-medium">
                  <div>วันที่จัดเตรียมบิล: {new Date().toLocaleDateString("th-TH")}</div>
                  <div>ช่วงเวลาอ้างอิง: 
                    <span className="font-bold text-zinc-800 ml-1">
                      {reportRange === "daily" && selectedDate}
                      {reportRange === "monthly" && selectedMonth}
                      {reportRange === "yearly" && selectedYear}
                      {reportRange === "custom" && `${startDate} - ${endDate}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Abstract Financial Summary Metrics Cards in Portrait format */}
            <div className="grid grid-cols-4 gap-4">
              
              <div className="bg-pink-50/50 border border-pink-100 rounded-lg p-3 text-center">
                <span className="block text-[9px] font-extrabold text-pink-700 uppercase">ยอดโอนสุทธิรวม</span>
                <span className="text-lg font-black text-pink-650 block mt-1">
                  {formatCurrency(totalFinancials.totalSum)}
                </span>
              </div>

              <div className="bg-pink-50/30 border border-pink-100 rounded-lg p-3 text-center">
                <span className="block text-[9px] font-extrabold text-pink-700 uppercase">จำนวนครั้งสนับสนุน</span>
                <span className="text-lg font-black text-zinc-800 block mt-1">
                  {totalFinancials.volumeCount} ครั้ง
                </span>
              </div>

              <div className="bg-pink-50/30 border border-pink-100 rounded-lg p-3 text-center">
                <span className="block text-[9px] font-extrabold text-pink-700 uppercase">ยอดเฉลี่ยต่อบิล</span>
                <span className="text-lg font-black text-zinc-800 block mt-1">
                  {formatCurrency(totalFinancials.averageGift)}
                </span>
              </div>

              <div className="bg-pink-50/30 border border-pink-400/20 rounded-lg p-3 text-center">
                <span className="block text-[9px] font-extrabold text-pink-700 uppercase">ยอดสูงสุดหนึ่งครั้ง</span>
                <span className="text-lg font-black text-emerald-600 block mt-1">
                  {formatCurrency(totalFinancials.maxInvoice)}
                </span>
              </div>

            </div>

            {/* 3. Detailed Transactions Bookkeeper Table Row */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold tracking-wider uppercase border-b border-pink-100 pb-1.5 text-pink-650">
                รายการโอนเงินผ่านระบบอัตโนมัติสำเร็จ ({filteredDonations.length} รายการ)
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b-2 border-pink-200 bg-pink-50 text-pink-700 font-bold uppercase">
                      <th className="py-2.5 px-3">วันและเวลาที่สแกนสลิป</th>
                      <th className="py-2.5 px-3">รหัสธุรกรรมอ้างอิง (Ref ID/Slip ID)</th>
                      <th className="py-2.5 px-3">ผู้สนับสนุน</th>
                      <th className="py-2.5 px-3 text-right">จำนวนที่โอน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDonations.length > 0 ? (
                      filteredDonations.map((item, idx) => (
                        <tr 
                          key={item.id} 
                          className={`border-b border-pink-50 font-medium ${idx % 2 === 1 ? "bg-[#FCFAF7]" : ""}`}
                        >
                          <td className="py-2 px-3 text-[#db2777]">
                            {formatDate(item.createdAt)}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-mono text-[10px] text-zinc-500 block">บิล: {item.id}</span>
                            {item.slipParsed?.transactionId && (
                              <span className="font-mono text-[11px] text-neutral-800 font-bold">ธนาคาร: {item.slipParsed.transactionId}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-semibold text-zinc-800">
                            {item.donorName}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-[#db2777]">
                            {item.amount.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-zinc-400 font-semibold italic">
                          ไม่มีบันทึกข้อมูลการโอนเงินสะสมที่สมบูรณ์ตามเวลาตรวจสอบ
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    {filteredDonations.length > 0 && (
                      <tr className="border-t-2 border-pink-600 font-black text-sm bg-pink-50">
                        <td colSpan={3} className="py-3 px-3 text-pink-700 text-right">
                          รวมยอดรายรับสะสมสุทธิ (GRAND TOTAL):
                        </td>
                        <td className="py-3 px-3 text-right text-pink-750 underline decoration-double">
                          {formatCurrency(totalFinancials.totalSum)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>

          </div>

          {/* 4. Report Footer Signature authentication block */}
          <div className="mt-16 pt-8 border-t border-pink-100 grid grid-cols-2 gap-8 text-xs font-semibold text-zinc-500">
            <div>
              <p className="italic">
                * เอกสารฉบับนี้สร้างขึ้นโดยระบบอัตโนมัติของ Donate me! & Verification Dashboard และมีการรับสมทบยอดผ่านเกตเวย์ความปลอดภัยพรีเมียม Stripe
              </p>
              <p className="mt-2 text-[10px]">
                ID ตรวจสอบสถานะความเรียบร้อย: PP-VERIFY-{streamer.uid.substring(0,6).toUpperCase()}-{new Date().getFullYear()}
              </p>
            </div>
            
            <div className="flex flex-col items-center justify-end text-center space-y-4">
              <div className="w-44 border-b border-pink-300 h-10" />
              <p className="text-pink-700 uppercase tracking-widest text-[10px] font-bold">
                ลงชื่อสตรีมเมอร์เจ้าของสิทธิ์รับรองคุณวุฒิ
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
