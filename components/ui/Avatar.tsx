"use client";

import React, { useState } from "react";

/**
 * Somebody's face, or their initials, or something.
 *
 * Four places drew an avatar as a coloured circle containing
 * `profile.avatar_initials` and nothing else - never looking at
 * `avatar_url`. That was invisible while every account had initials and no
 * photograph. The owner's row has the opposite: a photograph, and
 * `avatar_initials` of NULL. The circle rendered empty, in the admin lists,
 * the members dialog and search results alike.
 *
 * So this always has something to show:
 *
 *   1. the picture, when there is one and it loads;
 *   2. the stored initials;
 *   3. initials worked out from the name, for rows that never got any;
 *   4. a dash, rather than an empty disc.
 *
 * Step 1 falling through to step 2 is the part that needs the state below: an
 * <img> whose src 404s leaves a blank box and reports nothing, so the error
 * has to be caught and the initials drawn instead. Storage URLs do rot.
 */

/** "Youness Nait Oufkir" -> "YN". Accent-safe, and copes with one name. */
export function initialsFrom(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

interface Props {
  name?: string | null;
  initials?: string | null;
  url?: string | null;
  color?: string | null;
  /** Rendered size in pixels. Text scales with it. */
  size?: number;
  className?: string;
  title?: string;
}

export function Avatar({
  name,
  initials,
  url,
  color,
  size = 32,
  className = "",
  title,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);

  const text = (initials?.trim() || initialsFrom(name) || "–").slice(0, 3);
  const label = title ?? name ?? undefined;

  const style: React.CSSProperties = {
    width: size,
    height: size,
    // Reserved even when a picture is showing: it is what is behind a
    // transparent PNG, and what is left when one fails to load.
    backgroundColor: color || "#94a3b8",
    fontSize: Math.max(9, Math.round(size * 0.38)),
  };

  return (
    <span
      title={label}
      style={style}
      className={`rounded-full inline-flex items-center justify-center overflow-hidden text-white font-bold shrink-0 select-none ${className}`}
    >
      {url && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label ?? ""}
          onError={() => setImageFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        text
      )}
    </span>
  );
}

export default Avatar;
