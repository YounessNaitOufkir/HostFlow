"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

export interface FontOption {
  id: string;
  name: string;
  description: string;
  cssValue: string;
  sampleText: string;
  badge?: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "plus-jakarta",
    name: "Plus Jakarta Sans",
    description: "Modern UI default with clean, friendly SaaS geometry",
    cssValue: "var(--font-inter), 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
    badge: "Default",
  },
  {
    id: "roboto",
    name: "Roboto",
    description: "Classic Google design with natural reading rhythm",
    cssValue: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
  },
  {
    id: "atkinson",
    name: "Atkinson Hyperlegible",
    description: "Designed by the Braille Institute for maximum character distinction and legibility",
    cssValue: "'Atkinson Hyperlegible', -apple-system, BlinkMacSystemFont, sans-serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
    badge: "High Legibility",
  },
  {
    id: "shantell",
    name: "Shantell Sans",
    description: "Warm, playful handwriting marker font",
    cssValue: "'Shantell Sans', cursive, -apple-system, sans-serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
    badge: "Playful",
  },
  {
    id: "outfit",
    name: "Outfit",
    description: "Geometric sans-serif with friendly roundness",
    cssValue: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
    sampleText: "The quick brown fox jumps over the lazy dog",
  },
];

interface FontContextType {
  currentFont: string;
  setFont: (fontId: string) => void;
  fontOptions: FontOption[];
}

const FontContext = createContext<FontContextType>({
  currentFont: "plus-jakarta",
  setFont: () => {},
  fontOptions: FONT_OPTIONS,
});

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [currentFont, setCurrentFontState] = useState<string>("plus-jakarta");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hostflow_font");
      // If user had 'inter' saved, upgrade them to 'plus-jakarta'
      if (saved === "inter") {
        applyFont("plus-jakarta", false);
      } else if (saved && FONT_OPTIONS.some((f) => f.id === saved)) {
        applyFont(saved, false);
      } else {
        applyFont("plus-jakarta", false);
      }
    } catch {
      applyFont("plus-jakarta", false);
    }
  }, []);

  const applyFont = (fontId: string, showToast = true) => {
    const option = FONT_OPTIONS.find((f) => f.id === fontId) || FONT_OPTIONS[0];
    setCurrentFontState(option.id);

    try {
      localStorage.setItem("hostflow_font", option.id);
    } catch (e) {
      // Ignore storage errors
    }

    if (typeof document !== "undefined") {
      document.body.style.fontFamily = option.cssValue;
      document.documentElement.style.setProperty("--app-font", option.cssValue);
      document.documentElement.setAttribute("data-font", option.id);
    }

    if (showToast) {
      toast.success(`Font updated to ${option.name}`, {
        description: option.description,
      });
    }
  };

  const setFont = (fontId: string) => {
    applyFont(fontId, true);
  };

  return (
    <FontContext.Provider
      value={{
        currentFont,
        setFont,
        fontOptions: FONT_OPTIONS,
      }}
    >
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  return useContext(FontContext);
}
