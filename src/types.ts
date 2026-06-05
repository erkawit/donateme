export interface StreamerProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  coverURL?: string;
  promptpayId: string; // phone or citizen ID
  promptpayName: string; // account name
  truemoneyPhone?: string; // TrueMoney Wallet phone number
  truemoneyName?: string; // TrueMoney account name
  bio?: string;
  overlaySound: string; // "mario", "anime", "bell", "retro" or url
  overlayGif: string; // gif key or url
  minDonationAlert: number;
  ttsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  overlayAspectFormat?: "16:9" | "9:16";
  overlayPositionX?: number; // percent left
  overlayPositionY?: number; // percent top
  overlayScale?: number; // scaling multiplier
}

export interface DonationRecord {
  id: string;
  streamerId: string;
  donorName: string;
  amount: number;
  message: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  triggered: boolean;
  slipVerified: boolean;
  paymentMethod?: "promptpay" | "truemoney";
  isTest?: boolean;
  slipParsed?: {
    senderName?: string;
    receivingName?: string;
    receivingPromptPayId?: string;
    receivingTruemoneyPhone?: string;
    amount?: number;
    datetime?: string;
    transactionId?: string;
    confidenceScore?: number;
    isValidPromptPaySlip?: boolean;
    isValidTruemoneySlip?: boolean;
    paymentMethod?: "promptpay" | "truemoney";
  };
}

export interface AlertData {
  donorName: string;
  amount: number;
  message: string;
  overlaySound: string;
  overlayGif: string;
  ttsEnabled: boolean;
}
