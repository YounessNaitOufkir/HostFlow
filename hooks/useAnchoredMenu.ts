"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type Align = "left" | "right" | "center";

/**
 * Positions a dropdown so the whole of it stays on screen.
 *
 * Menus used to be absolutely positioned with `top-full`, which always opens
 * downwards from the anchor. A row near the bottom of the board therefore
 * opened its menu below the fold and you had to scroll the page to reach the
 * options — and a menu taller than the window could not be fully reached at all.
 *
 * This measures both the anchor and the menu, prefers below, flips above when
 * below does not fit, clamps into the viewport either way, and caps the height
 * so a long list scrolls inside itself rather than off the screen.
 *
 * Returns fixed coordinates, so the menu also escapes any `overflow: hidden`
 * ancestor — which is why board cells could clip their own dropdowns.
 *
 * @example
 * const { anchorRef, menuRef, menuStyle } = useAnchoredMenu(isOpen, { align: "left" });
 * <div ref={anchorRef}>
 *   {isOpen && <div ref={menuRef} style={menuStyle} className="dropdown-menu">…</div>}
 * </div>
 */
export function useAnchoredMenu(
  isOpen: boolean,
  options?: { align?: Align; gap?: number }
) {
  const align: Align = options?.align ?? "left";
  const gap = options?.gap ?? 4;

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Hidden for the first paint only, while it is measured. Without this the
  // menu would flash at 0,0 before landing in place.
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    visibility: "hidden",
  });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const a = anchor.getBoundingClientRect();
    // offsetWidth/Height, not getBoundingClientRect: these menus animate in
    // with a zoom-in-95 transform, and the rect reports the SCALED box. Placing
    // against 95% of the real width clamps against the wrong number and leaves
    // the settled menu hanging over the edge.
    const m = { width: menu.offsetWidth, height: menu.offsetHeight };
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - a.bottom - gap;
    const spaceAbove = a.top - gap;

    // Prefer below; flip above only when below cannot hold it and above can do
    // better. Whichever side wins, the height is capped to what is available.
    const openAbove = m.height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.floor(openAbove ? spaceAbove : spaceBelow));

    let top = openAbove
      ? a.top - Math.min(m.height, maxHeight) - gap
      : a.bottom + gap;
    top = Math.max(gap, Math.min(top, vh - Math.min(m.height, maxHeight) - gap));

    let left =
      align === "right"
        ? a.right - m.width
        : align === "center"
          ? a.left + a.width / 2 - m.width / 2
          : a.left;
    left = Math.max(gap, Math.min(left, vw - m.width - gap));

    // A transformed ancestor becomes the containing block for a fixed child, so
    // the coordinates stop being viewport coordinates - the sidebar animates
    // with framer-motion, and its menu landed exactly one icon-rail to the
    // right. Rather than portalling (which would put the menu outside the
    // element every outside-click handler tests against), find that ancestor
    // and subtract its origin.
    //
    // Measured from the ancestor, not from the menu's own applied position: the
    // menu animates in with a scale, which would skew a self-measurement.
    let offsetX = 0;
    let offsetY = 0;
    for (let el = menu.parentElement; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      // Everything that makes an element the containing block of a fixed
      // descendant. backdrop-filter is the one that caught us out: the sidebar
      // is a glass panel, and that alone re-bases its menu.
      const containsFixed =
        cs.transform !== "none" ||
        cs.perspective !== "none" ||
        cs.filter !== "none" ||
        (cs.backdropFilter && cs.backdropFilter !== "none") ||
        cs.willChange.includes("transform") ||
        cs.willChange.includes("filter") ||
        cs.contain.includes("paint") ||
        cs.contain.includes("layout") ||
        cs.contain.includes("strict") ||
        cs.contain.includes("content");
      if (containsFixed) {
        const r = el.getBoundingClientRect();
        offsetX = r.left + (parseFloat(cs.borderLeftWidth) || 0);
        offsetY = r.top + (parseFloat(cs.borderTopWidth) || 0);
        break;
      }
    }

    setMenuStyle({
      position: "fixed",
      top: top - offsetY,
      left: left - offsetX,
      maxHeight,
      overflowY: "auto",
      visibility: "visible",
    });
  }, [align, gap]);

  useLayoutEffect(() => {
    if (!isOpen) {
      // Reset so the next open measures from a known origin rather than the
      // last position, which is what the containing-block correction reads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMenuStyle({ position: "fixed", top: 0, left: 0, visibility: "hidden" });
      return;
    }
    // Measure-then-position has to write the result to state, and runs before
    // paint so nothing flickers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    place();
    // A second pass once the browser has laid the menu out at its real size.
    // The first measurement can read a width the element had while it was still
    // in the document flow, which then clamps it against the wrong number and
    // leaves it hanging over the edge.
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    // The first measurement can be taken before the menu has settled - a list
    // that filters as you type, or content that arrives a tick later, changes
    // its size after placement and would then hang off the edge.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
    if (ro && menuRef.current) ro.observe(menuRef.current);

    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [isOpen, place]);

  return { anchorRef, menuRef, menuStyle };
}
