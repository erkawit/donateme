import { useState, useEffect } from "react";
import AlertOverlay from "./components/AlertOverlay";
import DonationPage from "./components/DonationPage";
import StreamerDashboard from "./components/StreamerDashboard";

export default function App() {
  const [view, setView] = useState<{ type: "dashboard" | "overlay" | "donate"; id?: string }>({
    type: "dashboard"
  });

  useEffect(() => {
    // Elegant URL hash and search query state router
    const handleNavigation = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const overlayId = searchParams.get("overlay");
      const donateId = searchParams.get("donate");

      if (overlayId) {
        setView({ type: "overlay", id: overlayId });
      } else if (donateId) {
        setView({ type: "donate", id: donateId });
      } else {
        setView({ type: "dashboard" });
      }
    };

    // Watch navigation load
    handleNavigation();

    // Listen to history popstates or manual query edits
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  // Structural views selection
  switch (view.type) {
    case "overlay":
      return <AlertOverlay streamerId={view.id || ""} />;
    case "donate":
      return <DonationPage streamerId={view.id || ""} />;
    case "dashboard":
    default:
      return <StreamerDashboard />;
  }
}
