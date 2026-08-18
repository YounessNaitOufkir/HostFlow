"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
// Deliberately does not import the icon-rail tooltip surface: the two styles are
// intentionally different and must not be re-unified.

type Side = "top" | "bottom";

interface Coords {
  top: number;
  left: number;
  placement: Side;
}

/**
 * Reveals the full value of clipped text on hover, using the app's standard
 * tooltip surface.
 *
 * Returns a ref to attach to the element that does the clipping, the hover
 * handlers, and the tooltip node to render. Two deliberate choices:
 *
 * 1. No wrapper element is introduced. Wrapping clipped text in an extra
 *    flex/inline-flex box removes the width constraint that CSS ellipsis
 *    depends on, so columns stop truncating and start stretching instead.
 * 2. The tooltip is portalled to document.body and positioned fixed. Table
 *    cells and chips sit inside `overflow-hidden` containers that would
 *    otherwise clip an absolutely positioned tooltip.
 *
 * Clipping is measured at hover rather than on mount, so it stays correct as
 * columns are resized.
 */
export function useTruncationTooltip<T extends HTMLElement>(
  content: React.ReactNode,
  side: Side = "top"
) {
  const ref = useRef<T | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Horizontal clipping comes from `truncate` and from inputs overflowing
    // their box; vertical clipping comes from `line-clamp`.
    const isClipped =
      el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (!isClipped) return;

    const rect = el.getBoundingClientRect();
    const placement: Side = side === "top" && rect.top < 80 ? "bottom" : side;

    setCoords({
      top: placement === "top" ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(Math.max(rect.left + rect.width / 2, 8), window.innerWidth - 8),
      placement,
    });
  }, [side]);

  const hide = useCallback(() => setCoords(null), []);

  // Scrolling or resizing invalidates the measured position
  useEffect(() => {
    if (!coords) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [coords, hide]);

  const tooltip =
    mounted && coords && content
      ? createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                transform: `translate(-50%, ${coords.placement === "top" ? "-100%" : "0"})`,
                maxWidth: "min(28rem, calc(100vw - 2rem))",
              }}
              // Its own surface, not the icon-rail one: a charcoal card with a
              // pointer, sized for reading a full value rather than a two-word
              // hint. Long values wrap instead of running off-screen.
              className={
                "relative z-[100] px-3 py-1.5 rounded text-[13px] font-medium leading-relaxed " +
                "shadow-lg pointer-events-none whitespace-pre-wrap break-words " +
                "bg-[#323338] text-white dark:bg-white dark:text-[#323338]"
              }
            >
              {content}
              {/* Arrow pointing at the element the text belongs to */}
              <span
                aria-hidden="true"
                className={
                  "absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 z-[-1] " +
                  "bg-[#323338] dark:bg-white " +
                  (coords.placement === "top" ? "-bottom-[4px]" : "-top-[4px]")
                }
              />
            </motion.div>
          </AnimatePresence>,
          document.body
        )
      : null;

  return {
    ref,
    tooltip,
    handlers: {
      onMouseEnter: show,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
    },
  };
}

export interface TruncatedTextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "children" | "title"> {
  /**
   * Rendered content. When it is a plain string it doubles as the tooltip text.
   * Optional so callers can supply `dangerouslySetInnerHTML` instead, in which
   * case `tooltip` must carry the plain-text form.
   */
  children?: React.ReactNode;
  /** Tooltip content, when it should differ from what is rendered. */
  tooltip?: React.ReactNode;
  /** Element to render. Defaults to a span so inline layouts are unaffected. */
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4";
  /** Preferred side. Flips automatically when there is not enough room above. */
  side?: Side;
  className?: string;
}

/**
 * Text that may be clipped by `truncate` or `line-clamp`, showing its full
 * value on hover. See {@link useTruncationTooltip} for the mechanics.
 */
export function TruncatedText({
  children,
  tooltip,
  as = "span",
  side = "top",
  className = "",
  ...rest
}: TruncatedTextProps) {
  const { ref, tooltip: tooltipNode, handlers } = useTruncationTooltip<HTMLElement>(
    tooltip ?? children,
    side
  );

  const Element = as as React.ElementType;

  return (
    <>
      <Element ref={ref as React.Ref<never>} className={className} {...handlers} {...rest}>
        {children}
      </Element>
      {tooltipNode}
    </>
  );
}

export default TruncatedText;
