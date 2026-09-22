import { useState, useEffect } from "react";

export interface GymSettings {
  name: string;
  icon: string;
  logoImage: string; // base64 encoded image
  heroImage: string; // base64 encoded image
  accentColor: string;
  cropScale: number;
}

const DEFAULT_SETTINGS: GymSettings = {
  name: "",
  icon: "🏋️",
  logoImage: "",
  heroImage: "",
  accentColor: "#3b82f6",
  cropScale: 1,
};

const STORAGE_KEY = "gymdesk_settings";

export function useGymSettings() {
  const [settings, setSettings] = useState<GymSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (e) {
        setSettings(DEFAULT_SETTINGS);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever settings change
  const updateSettings = (newSettings: Partial<GymSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
