"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if already dismissed in localStorage
    const isDismissed = localStorage.getItem("pwa_install_dismissed");
    if (isDismissed) return;

    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    if (isStandalone) return;

    // Check if iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !/windows phone/.test(userAgent);
    if (isIOSDevice) {
      setIsIOS(true);
      // Show iOS prompt after 3 seconds on mobile
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Capture beforeinstallprompt on Chrome / Android / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa_install_dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[120] animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/80 rounded-2xl shadow-2xl p-4 text-left">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold shadow-md shrink-0">
              H
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                Install Host&apos;Lik PM
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Add to your home screen for instant access and full-screen mode.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {showIOSInstructions ? (
          <div className="mt-3.5 pt-3 border-t border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-gray-300 space-y-2">
            <p className="font-semibold text-gray-800 dark:text-gray-100">
              How to install on iOS Safari:
            </p>
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center font-bold text-gray-700 dark:text-gray-300 shrink-0">
                1
              </span>
              <span>
                Tap the <Share size={13} className="inline mx-0.5 text-blue-500" /> <b>Share</b> button in Safari&apos;s bottom bar.
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center font-bold text-gray-700 dark:text-gray-300 shrink-0">
                2
              </span>
              <span>
                Scroll down and select <PlusSquare size={13} className="inline mx-0.5 text-gray-600 dark:text-gray-300" /> <b>Add to Home Screen</b>.
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3.5 flex items-center justify-end space-x-2">
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              Not Now
            </button>
            <button
              onClick={handleInstallClick}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-all shadow-sm flex items-center space-x-1.5"
            >
              <Download size={13} />
              <span>{isIOS ? "Install App" : "Add to Home Screen"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
