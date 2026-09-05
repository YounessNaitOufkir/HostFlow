import React from "react";

/**
 * The HostFlow mark — three staggered rounded bars, i.e. board rows stepping
 * forward.
 *
 * The geometry is copied exactly from `public/icon.svg`, which is simultaneously
 * the favicon, the PWA icon and the iOS home-screen icon. Keeping one set of
 * coordinates here means the in-app mark and the installed icon cannot drift
 * apart. If the bars ever move they must move in `public/icon.svg` **and**
 * `app/apple-icon.png` at the same time — the PNG is a raster of the same mark
 * and will silently fall out of sync otherwise.
 *
 * The mark is deliberately abstract rather than a letterform: it survives a
 * rename of the app, which a monogram would not.
 */

const NAVY = "#1A2C5B";
const AMBER = "#F5A623";
const WHITE = "#FFFFFF";

export type LogoVariant = "tile" | "bare";
export type LogoTone = "navy" | "amber" | "light";

interface ToneSpec {
  /** Tile background. null means this tone is only ever drawn bare. */
  ground: string | null;
  bar: string;
  accent: string;
}

const TONES: Record<LogoTone, ToneSpec> = {
  // Matches public/icon.svg exactly: navy ground, white bars, amber middle.
  navy: { ground: NAVY, bar: WHITE, accent: AMBER },
  // On an amber tile an amber accent bar would disappear, so the tile itself
  // carries the brand colour and every bar goes white.
  amber: { ground: AMBER, bar: WHITE, accent: WHITE },
  // For light surfaces: navy bars, amber middle, no ground.
  light: { ground: null, bar: NAVY, accent: AMBER },
};

interface LogoProps {
  variant?: LogoVariant;
  tone?: LogoTone;
  size?: number;
  className?: string;
  /**
   * Accessible name. Set it when the mark stands alone; leave it off when a
   * visible wordmark already names the product, so screen readers don't hear
   * "HostFlow" twice.
   */
  title?: string;
}

export function Logo({
  variant = "tile",
  tone = "navy",
  size = 32,
  className = "",
  title,
}: LogoProps) {
  const { ground, bar, accent } = TONES[tone];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* Rounded here, unlike public/icon.svg, which is full-bleed on purpose
          because it is declared maskable and the OS applies its own rounding. */}
      {variant === "tile" && ground ? (
        <rect width="512" height="512" rx="112" fill={ground} />
      ) : null}
      <rect x="104" y="130" width="184" height="68" rx="34" fill={bar} />
      <rect x="160" y="222" width="256" height="68" rx="34" fill={accent} />
      <rect x="224" y="314" width="160" height="68" rx="34" fill={bar} />
    </svg>
  );
}

export default Logo;
