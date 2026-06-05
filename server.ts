import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

import Stripe from "stripe";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limits to allow base64 uploaded slip screenshots
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Simple request logging for diagnosis of query URLs (like ?overlay= or ?donate=)
app.use((req, res, next) => {
  console.log(`[Express Router] ${req.method} ${req.originalUrl}`);
  next();
});

// Lazy initialize Stripe
let stripeClient: Stripe | null = null;
function getStripeClient(): Stripe | null {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey || apiKey === "MY_STRIPE_SECRET_KEY" || apiKey.trim() === "") {
    return null;
  }
  if (!stripeClient) {
    try {
      stripeClient = new Stripe(apiKey, {
        apiVersion: "2023-10-16" as any,
      });
    } catch (e) {
      console.error("Initializing Stripe SDK failed:", e);
    }
  }
  return stripeClient;
}

// API endpoint to create a Stripe checkout session for donation
app.post("/api/create-stripe-checkout", async (req, res) => {
  try {
    const { streamerId, donorName, amount, message, streamerName } = req.body;

    if (!streamerId || !amount || amount <= 0) {
      return res.status(400).json({ error: "ข้อมูลสนับสนุนไม่ครบถ้วนหรือไม่ถูกต้อง" });
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (apiKey && apiKey.trim().startsWith("pk_")) {
      return res.status(400).json({
        error: "❌ คุณตั้งค่าระบบชำระเงินผิดประเภท! คีย์ที่คุณกรอกในแถบความลับ AI Studio เริ่มต้นด้วย 'pk_' (Publishable Key) แต่หลังบ้านของเว็บแอปพลิเคชันจำเป็นต้องใช้ 'sk_...' (Secret Key) หรือ 'rk_...' (Restricted Key) ของ Stripe ในการทำธุรกรรมความปลอดภัย กรุณานำ Secret Key หรือ Restricted Key มาใส่แก้ไข"
      });
    }

    const stripe = getStripeClient();
    const appUrl = process.env.APP_URL || req.headers.origin || "http://localhost:3000";
    const successUrl = `${appUrl}/?donate=${streamerId}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/?donate=${streamerId}&donation_cancel=true`;

    if (!stripe) {
      // Stripe Developer Sandbox Mock mode: Create simulation URL to let user test without actual key
      console.warn("⚠️ [Stripe Sandbox] STRIPE_SECRET_KEY is empty/placeholder. Generating sandbox simulation redirect.");
      
      const mockSessionId = `mock_session_${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
      const mockCheckoutUrl = `${appUrl}/?donate=${streamerId}&session_id=${mockSessionId}&mock_amount=${amount}&mock_donorName=${encodeURIComponent(donorName)}&mock_message=${encodeURIComponent(message)}&is_mock=true`;
      
      return res.json({
        url: mockCheckoutUrl,
        isMock: true,
        message: "Stripe Sandbox mode simulation"
      });
    }

    // Real production checkout session creation
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "promptpay"],
      line_items: [
        {
          price_data: {
            currency: "thb",
            product_data: {
              name: `สนับสนุนคุณ ${streamerName || "Streamer"}`,
              description: message ? `ข้อความถึงสตรีมเมอร์: "${message}"` : "โอนเงินสนับสนุนผ่านบัตรเครดิต/เดบิต หรือสแกน PromptPay ด่วน",
            },
            unit_amount: Math.round(Number(amount) * 100), // 100 Satangs = 1 Baht (standard Stripe unit sizing)
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        streamerId,
        donorName,
        message,
        amount: String(amount),
      },
    });

    return res.json({ url: session.url, id: session.id, isMock: false });
  } catch (error: any) {
    console.error("Stripe Checkout Session construction failure:", error);
    // Return status 400 to prevent proxy intercepting 5xx and replacing with HTML
    return res.status(400).json({ error: error.message || "ระบบเชื่อมต่อ Stripe เกิดข้อยกเว้นภายใน เซิร์ฟเวอร์ไม่สามารถตอบรับสลิปได้" });
  }
});

// API endpoint to verify Stripe payment state
app.get("/api/verify-stripe-session", async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "ข้อมูลตรวจสอบบิลเซสชันไม่ครบถ้วน" });
    }

    const sessionIdString = String(session_id);

    // Sandbox simulated verification
    if (sessionIdString.startsWith("mock_session_")) {
      const { mock_amount, mock_donorName, mock_message } = req.query;
      return res.json({
        success: true,
        isMock: true,
        amount: mock_amount ? Number(mock_amount) : 50,
        metadata: {
          streamerId: String(req.query.streamerId || ""),
          donorName: String(mock_donorName || "ผู้สนับสนุนระบบจำลอง"),
          message: String(mock_message || "ข้อความจำลองจากแดชบอร์ด"),
          amount: String(mock_amount || "50")
        },
        message: "จำลองขั้นตอนการสแกนบัตรโหมด Sandbox สำเร็จเรียบร้อย!"
      });
    }

    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (apiKey && apiKey.trim().startsWith("pk_")) {
      return res.status(400).json({
        error: "คุณตั้งค่าระบบชำระเงินผิดประเภท! รหัสเป็น Publishable Key 'pk_' ทั้งที่ระบบหลังบ้านต้องใช้งานแอปคีย์ลับ 'sk_'"
      });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.json({
        success: true,
        isMock: true,
        amount: 50,
        metadata: {
          streamerId: "",
          donorName: "ผู้สนับสนุนระบบจำลอง (Fallback)",
          message: "ระบบจำลองเนื่องจากคีย์ไม่สมบูรณ์"
        },
        message: "ไม่มี Stripe credentials ตรวจสอบจำลองผ่าน Sandbox"
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionIdString);

    if (session.payment_status === "paid") {
      return res.json({
        success: true,
        isMock: false,
        amount: session.amount_total ? session.amount_total / 100 : null,
        currency: session.currency,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        customerDetails: session.customer_details,
        metadata: session.metadata,
      });
    } else {
      return res.json({
        success: false,
        paymentStatus: session.payment_status,
        message: "ตรวจพบบิลค้างชำระกรุณารอหรือติดต่อธนาคารต้นทาง"
      });
    }
  } catch (error: any) {
    console.error("Stripe verification fails:", error);
    // Return status 400 to prevent proxy intercepting 5xx and replacing with HTML
    return res.status(400).json({ error: error.message || "ขัดข้องขณะตรวจสอบยืนยันสเตตัสบิล Stripe" });
  }
});

// Serve Vite dev server in development, serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"), (err) => {
        if (err) {
          console.error("[Express Server] Error sending production index.html:", err);
          res.status(500).send("Built index.html was not found in the distribution bundle.");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
