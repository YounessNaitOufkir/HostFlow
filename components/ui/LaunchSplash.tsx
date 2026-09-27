import React from "react";
import { APP_NAME } from "@/lib/companyName";
import { useT } from "@/components/LanguageProvider";

// Kept with the component rather than in globals.css: this is the one screen
// that must look right before anything else has loaded.
const LAUNCH_CSS = `
@keyframes launchStep { 0%, 100% { transform: translateX(0) } 30% { transform: translateX(22px) } 60% { transform: translateX(0) } }
@keyframes launchFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes launchRun { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
.launch-step { transform-box: fill-box; animation: launchStep 1.6s cubic-bezier(.45,0,.25,1) .45s infinite both }
.launch-step-2 { animation-delay: .6s }
.launch-step-3 { animation-delay: .75s }
.launch-fade { animation: launchFade .4s ease-out .35s both }
.launch-run { animation: launchRun 1.1s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) {
  .launch-step, .launch-fade { animation: none }
  .launch-run { animation: none; transform: translateX(75%) }
}
`;

/**
 * The launch screen, while auth and the first board data load.
 *
 * On an installed phone app Android shows its own screen first, built from
 * the manifest (app/manifest.ts): brand navy, the bare mark in the middle, the
 * app's name at the bottom. It cannot be switched off. So this one starts as
 * an exact copy of it - same navy, the same mark at the same size and place,
 * the name where Android puts it - and the handover goes unnoticed: it reads
 * as one screen that starts to move. Then the bars step in turn, like rows
 * being planned, and a loading bar fades in underneath.
 *
 * Shown once per session: app/page.tsx swaps to the ordinary loading skeleton
 * the moment anything has rendered, and never comes back to this.
 */
export function LaunchSplash() {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[9999] bg-[#1A2C5B] text-white" role="status" aria-label={t("launch.loading")}>
      <style>{LAUNCH_CSS}</style>
      {/* Centred on the screen, as Android centres its icon. 128px is the
          size it draws the 512-unit icon at, so the bars line up exactly. */}
      <svg
        viewBox="0 0 512 512"
        width={128}
        height={128}
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <rect className="launch-step" x="104" y="130" width="184" height="68" rx="34" fill="#FFFFFF" />
        <rect className="launch-step launch-step-2" x="160" y="222" width="256" height="68" rx="34" fill="#F5A623" />
        <rect className="launch-step launch-step-3" x="224" y="314" width="160" height="68" rx="34" fill="#FFFFFF" />
      </svg>

      <div className="launch-fade absolute left-1/2 top-1/2 -translate-x-1/2 mt-[64px] flex flex-col items-center gap-3">
        <div className="w-28 h-[3px] rounded-full bg-white/15 overflow-hidden">
          <div className="h-full w-2/5 rounded-full bg-[#F5A623] launch-run" />
        </div>
        <p className="text-[13px] font-medium text-[#C9D3EC] whitespace-nowrap">{t("launch.loading")}</p>
      </div>

      {/* Where Android writes the name, in the phone's own font, so it stays put. */}
      <p className="absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] text-center text-[22px] font-normal tracking-tight [font-family:system-ui,Roboto,sans-serif]">
        {APP_NAME}
      </p>
    </div>
  );
}

export default LaunchSplash;
