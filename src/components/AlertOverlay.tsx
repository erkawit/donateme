import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { doc, getDoc, collection, onSnapshot, updateDoc, db } from "../firebase";
import { playAlertSound, playTTSAlert, formatCurrency } from "../utils";
import { DonationRecord, StreamerProfile } from "../types";

interface AlertOverlayProps {
  streamerId: string;
}

export default function AlertOverlay({ streamerId }: AlertOverlayProps) {
  const [streamer, setStreamer] = useState<StreamerProfile | null>(null);
  const [queue, setQueue] = useState<DonationRecord[]>([]);
  const [currentAlert, setCurrentAlert] = useState<DonationRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioContextLocked, setAudioContextLocked] = useState(true);
  const processedIdsRef = useRef<Set<string>>(new Set());

  // persistent played list record to prevent double notifications or re-triggering on coordinates settings update
  const playedIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Initialize synchronously on render/mount
  if (streamerId && playedIdsRef.current.size === 0) {
    try {
      const stored = localStorage.getItem(`alert_played_history_${streamerId}`);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          playedIdsRef.current = new Set(arr);
        }
      }
    } catch (e) {
      console.error("Error reading alert history from localStorage:", e);
    }
  }

  const markAsPlayedInHistory = (id: string) => {
    playedIdsRef.current.add(id);
    try {
      localStorage.setItem(`alert_played_history_${streamerId}`, JSON.stringify(Array.from(playedIdsRef.current)));
    } catch (e) {
      console.error("Error saving alert history to localStorage:", e);
    }
  };

  // Add global screen click trigger to unlock browser audio autoplay seamlessly and invisibly
  useEffect(() => {
    const handleGlobalUnlock = () => {
      setAudioContextLocked(false);
      playAlertSound("bell");
      window.removeEventListener("click", handleGlobalUnlock);
    };
    window.addEventListener("click", handleGlobalUnlock);
    return () => window.removeEventListener("click", handleGlobalUnlock);
  }, []);

  // Default Fallbacks
  const defaultGifs: Record<string, string> = {
    cute_cat: "https://media.giphy.com/media/MWSR5TGOuXY9G/giphy.gif",
    pikachu: "https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif",
    coin: "https://media.giphy.com/media/Y8S9xo9OnonS5Z7K4Z/giphy.gif",
    heart: "https://media.giphy.com/media/8byZThhLaUms4bM3g3/giphy.gif"
  };

  // 1. Fetch Streamer Configuration Profile
  useEffect(() => {
    if (!streamerId) return;
    const docRef = doc(db, "streamers", streamerId);
    
    const unsubscribeProfile = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setStreamer(snapshot.data() as StreamerProfile);
      }
    });

    return () => unsubscribeProfile();
  }, [streamerId]);

  // 2. Real-time Subscription to Successful Donations (Untriggered)
  useEffect(() => {
    if (!streamerId) return;

    const donationsRef = collection(db, "streamers", streamerId, "donations");
    
    // Listen for any completed transactions that have not yet triggered the OBS animation
    const unsubscribeDonations = onSnapshot(donationsRef, {
      next: (snapshot) => {
        if (isInitialLoadRef.current) {
          snapshot.docs.forEach((doc) => {
            const data = doc.data() as DonationRecord;
            if (data.status === "completed") {
              processedIdsRef.current.add(doc.id);
              playedIdsRef.current.add(doc.id);
            }
          });
          isInitialLoadRef.current = false;
          return;
        }

        const newDonations: DonationRecord[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data() as DonationRecord;
            const docId = change.doc.id;
            // Only add if it is completed and has not been triggered on OBS yet and not already processed/queueing and not already played!
            if (
              data.status === "completed" && 
              !data.triggered && 
              !processedIdsRef.current.has(docId) &&
              !playedIdsRef.current.has(docId)
            ) {
              newDonations.push({ ...data, id: docId });
            }
          }
        });

        if (newDonations.length > 0) {
          // Add newly completed donations to the queue
          setQueue((prev) => {
            // Filter duplicates to prevent double-firing
            const existingIds = prev.map((q) => q.id);
            const verifiedUnique = newDonations.filter((d) => !existingIds.includes(d.id));
            
            // Mark as processed immediately so subsequent modification events skip them
            verifiedUnique.forEach((d) => {
              processedIdsRef.current.add(d.id);
            });
            
            return [...prev, ...verifiedUnique];
          });
        }
      },
      error: (error) => {
        console.error("Alert Overlay Firestore Sync Error:", error);
      }
    });

    return () => unsubscribeDonations();
  }, [streamerId]);

  // 3. Alert Queue Processor
  useEffect(() => {
    if (queue.length > 0 && !isProcessing) {
      processNextAlert();
    }
  }, [queue, isProcessing]);

  const processNextAlert = async () => {
    setIsProcessing(true);
    const nextItem = queue[0];
    if (!nextItem) {
      setIsProcessing(false);
      return;
    }
    setCurrentAlert(nextItem);
    
    // Remove from active state queue immediately
    setQueue((prev) => prev.slice(1));

    // CONSUME IMMEDIATELY on Firestore and localStorage alert history!
    markAsPlayedInHistory(nextItem.id);

    try {
      const docRef = doc(db, "streamers", streamerId, "donations", nextItem.id);
      await updateDoc(docRef, { triggered: true });
    } catch (e) {
      console.error("Failed to update trigger consumption state on Firestore immediately:", e);
    }

    // Wait! Check minimum threshold limit for this streamer
    const minThreshold = streamer?.minDonationAlert ?? 0;
    if (nextItem.amount >= minThreshold) {
      // A. Play Alert Payout sound (e.g. Anime / Retro / Bell / Mario)
      const soundKey = streamer?.overlaySound || "retro";
      playAlertSound(soundKey);

      // B. Play Text-to-Speech Thai reader after sound starts
      const shouldReadTTS = streamer?.ttsEnabled ?? true;
      if (shouldReadTTS) {
        setTimeout(() => {
          const channelName = nextItem.paymentMethod === "truemoney" ? "ทรูมันนี่ วอลเล็ท" : "พร้อมเพย์";
          const ttsMessage = `${nextItem.donorName || "ผู้ไม่ประสงค์ออกนาม"} ได้โอนเงินสนับสนุนผ่าน${channelName}จำนวน ${nextItem.amount} บาท พร้อมข้อความว่า: ${nextItem.message || "ขอบคุณสำหรับการสตรีม"}`;
          playTTSAlert(ttsMessage);
        }, 1200);
      }

      // C. Wait for animation duration (8 seconds) to let animation finish beautifully
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    setCurrentAlert(null);
    setIsProcessing(false);
  };

  const getAlertGifUrl = () => {
    const gifKey = streamer?.overlayGif || "pikachu";
    if (gifKey === "profile_photo") {
      return streamer?.photoURL || "https://media.giphy.com/media/vSy0gPAHCfJK0/giphy.gif";
    }
    return defaultGifs[gifKey] || gifKey;
  };

  return (
    <div id="alert-overlay-container" className="fixed inset-0 flex items-center justify-center pointer-events-auto overflow-hidden bg-transparent">
      {/* OBS Animations Container */}
      <AnimatePresence mode="wait">
        {currentAlert && (
          <motion.div
            key={currentAlert.id}
            initial={{ opacity: 0, scale: 0.6, y: 150 }}
            animate={{ opacity: 1, scale: streamer?.overlayScale !== undefined ? streamer.overlayScale : 1.0, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -150 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            style={{
              position: "absolute",
              left: streamer?.overlayPositionX !== undefined ? `${streamer.overlayPositionX}%` : "50%",
              top: streamer?.overlayPositionY !== undefined ? `${streamer.overlayPositionY}%` : "50%",
              transform: "translate(-50%, -50%)",
              transformOrigin: "center center",
              pointerEvents: "auto"
            }}
            className="flex flex-col items-center justify-center max-w-xl text-center bg-[#FCFAF7] rounded-3xl p-8 border-4 border-pink-600/30 backdrop-blur-md shadow-[0_20px_50px_rgba(219,39,119,0.25)]"
          >
            {/* Overlay GIF Anchor */}
            <div className="relative w-44 h-44 mb-6">
              <img
                src={getAlertGifUrl()}
                alt="Alert GIF animation"
                className="w-full h-full object-contain drop-shadow-[0_12px_24px_rgba(219,39,119,0.35)]"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Donor Display Callout */}
            <h1 className="text-4xl font-extrabold uppercase tracking-tight text-stone-900 mb-2 font-sans font-black">
              <span className="text-pink-650 drop-shadow-sm">{currentAlert.donorName || "ผู้สนับสนุนใจดี"}</span>
            </h1>

            {/* Donation sum Badge */}
            <div className="inline-flex items-center px-8 py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black text-2xl mb-4 shadow-lg shadow-pink-600/30 animate-bounce font-sans">
              โอนเเล้ว {formatCurrency(currentAlert.amount)}
            </div>

            {/* Donation Text Message */}
            {currentAlert.message && (
              <p className="text-lg md:text-xl text-stone-800 font-bold overflow-hidden text-ellipsis line-clamp-3 bg-white/90 py-4 px-8 rounded-2xl border border-pink-200 max-w-full font-sans shadow-sm">
                "{currentAlert.message}"
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
