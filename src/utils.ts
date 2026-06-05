// CRC16 Checksum for EMVCo
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Generate EMVCo standard payload for Thai PromptPay QR Code
export function generatePromptPayPayload(target: string, amount?: number): string {
  const sanitized = target.replace(/\D/g, "");

  let formattedTarget = "";
  if (sanitized.length === 10 || sanitized.length === 9) {
    // Phone number prefix with 66 and pad
    const phone = sanitized.length === 10 ? sanitized.substring(1) : sanitized;
    formattedTarget = `0066${phone}`.padStart(13, "0");
  } else if (sanitized.length === 13) {
    // ID card number
    formattedTarget = sanitized;
  } else {
    formattedTarget = sanitized;
  }

  // Merchant Account Info Segment - promptpay ID is AID 00
  const fieldType = sanitized.length === 13 ? "02" : "01";
  const promptPaySub = `0016A000000677010111${fieldType}${String(formattedTarget.length).padStart(2, "0")}${formattedTarget}`;
  let payload = `00020101021130${String(promptPaySub.length).padStart(2, "0")}${promptPaySub}`;

  // Country (TH)
  payload += "5802TH";

  // Currency (764 - THB)
  payload += "5303764";

  // Amount
  if (amount !== undefined && amount > 0) {
    const amountStr = amount.toFixed(2);
    payload += `54${String(amountStr.length).padStart(2, "0")}${amountStr}`;
  }

  // Checksum segment ID 63, length 04
  payload += "6304";
  const checksum = crc16(payload);
  return payload + checksum;
}

// Quick QR Image URL builder using a free, fast, and secure API
export function getPromptPayQRUrl(target: string, amount?: number): string {
  const payload = generatePromptPayPayload(target, amount);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=15&data=${encodeURIComponent(payload)}`;
}

// Play Audio Notification Sounds
export function playAlertSound(soundKey: string) {
  try {
    const soundMap: Record<string, string> = {
      bell: "https://assets.mixkit.co/active_storage/sfx/2013/2013-84.wav",
      mario: "https://assets.mixkit.co/active_storage/sfx/911/911-84.wav",
      anime: "https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav",
      retro: "https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav",
    };

    const url = soundMap[soundKey];

    // Synthesize using Web Audio API as a robust zero-network absolute fallback or primary
    const playSynths = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const now = ctx.currentTime;

        if (soundKey === "bell") {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(880, now); // A5
          osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(1760, now); // A6

          gainNode.gain.setValueAtTime(0.25, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.75);
          osc2.stop(now + 0.75);
        } else if (soundKey === "mario") {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc.type = "square";
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);
          osc.frequency.setValueAtTime(800, now + 0.12);
          osc.frequency.exponentialRampToValueAtTime(1400, now + 0.3);

          gainNode.gain.setValueAtTime(0.12, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

          osc.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.38);
        } else if (soundKey === "anime") {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(523.25, now); // C5
          osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18);

          osc2.type = "sine";
          osc2.frequency.setValueAtTime(659.25, now); // E5
          osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.18);

          gainNode.gain.setValueAtTime(0.15, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.45);
          osc2.stop(now + 0.45);
        } else {
          // Retro chimes arpeggio
          const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
          const duration = 0.07;
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now + idx * duration);

            gainNode.gain.setValueAtTime(0.12, now + idx * duration);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * duration + 0.14);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start(now + idx * duration);
            osc.stop(now + idx * duration + 0.18);
          });
        }
      } catch (e) {
        console.warn("Synth alert playback failed:", e);
      }
    };

    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.8;
      audio.play().catch((err) => {
        console.warn("Audio file blocked or unsupported, falling back to Web Audio synthesis:", err);
        playSynths();
      });
    } else {
      playSynths();
    }
  } catch (error) {
    console.warn("Audio play failed, playing synthesis fallback:", error);
  }
}

// Speak alert text aloud (Text-To-Speech) in Thai with a sweet, female AI assistant tone
export function playTTSAlert(text: string) {
  if (!("speechSynthesis" in window)) {
    console.warn("TTS not supported by this browser.");
    return;
  }

  // Cancel any ongoing speaking
  window.speechSynthesis.cancel();

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "th-TH";
    
    // Set pitch slightly higher (1.15 to 1.25) to simulate a sweet, natural female AI voice
    utterance.pitch = 1.2;
    utterance.rate = 0.98; // natural, clear sweet read rate
    utterance.volume = 1.0;

    // Retrieve active voices of the host machine
    const voices = window.speechSynthesis.getVoices();
    
    // Filter voices that support Thai language
    const thVoices = voices.filter((v) => {
      const l = v.lang.toLowerCase();
      return l.includes("th-th") || l.includes("th_th") || l.startsWith("th") || l === "th";
    });

    if (thVoices.length > 0) {
      // Prioritize high-quality female/sweet Thai voices
      const femaleKeywords = ["premwadee", "kanya", "narisa", "google", "achara", "female", "หญิง", "สาว"];
      let chosenVoice = thVoices[0];

      // Find the first voice name matching our priority order
      for (const keyword of femaleKeywords) {
        const found = thVoices.find((v) => v.name.toLowerCase().includes(keyword));
        if (found) {
          chosenVoice = found;
          break;
        }
      }

      utterance.voice = chosenVoice;
    }

    window.speechSynthesis.speak(utterance);
  };

  // If voices are already loaded, speak immediately
  if (window.speechSynthesis.getVoices().length > 0) {
    speak();
  } else {
    // Wait for voices to load asynchronously (standard behavior in Chrome/OBS)
    window.speechSynthesis.onvoiceschanged = () => {
      speak();
      // Unregister handler to avoid memory leak
      window.speechSynthesis.onvoiceschanged = null;
    };
  }
}

// Format numbers as currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(amount);
}

// Format dates
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
