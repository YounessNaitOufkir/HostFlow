"use client";

import React, { useMemo } from "react";
import type { GanttScale } from "@/lib/gantt/scale";
import type { GanttItemRow } from "@/lib/gantt/rows";
import { rowCenterY } from "@/lib/gantt/rows";
import type { GanttDependency } from "@/lib/gantt/dependencies";

/** Drawn in red so a broken link reads as broken rather than as an odd-looking arrow. */
const VIOLATION_COLOR = "#e2445c";
const CRITICAL_COLOR = "#e2445c";

interface GanttLinksProps {
  itemRows: GanttItemRow[];
  dependencies: GanttDependency[];
  scale: GanttScale;
  totalHeight: number;
  criticalDependencyIds: Set<string>;
  violatedDependencyIds: Set<string>;
  highlightCritical: boolean;
  /** Vertical and horizontal slice on screen, so a portfolio only routes what is visible. */
  viewport: { top: number; bottom: number; left: number; right: number };
  /** Opens the editor for one arrow. Absent, arrows stay decorative. */
  onSelectDependency?: (
    dependency: GanttDependency,
    at: { x: number; y: number }
  ) => void;
  selectedDependencyId?: string | null;
}

interface Edge {
  dependency: GanttDependency;
  source: GanttItemRow;
  target: GanttItemRow;
  color: string;
  emphasis: boolean;
}

/**
 * Dependency arrows.
 *
 * Coordinates come from the same `scale.xOf` the bars use and from the `y` the
 * row model already computed. The old version measured x in raw 50px days while
 * the bars measured in percentages, and re-derived every endpoint's y by summing
 * the heights of all the rows above it - so the arrows both landed in the wrong
 * place on a wide screen and cost O(n^2) to draw.
 *
 * Each end also attaches to the edge its link type actually refers to: a
 * start-to-start line leaves the predecessor's left edge, not its right.
 */
export function GanttLinks({
  itemRows,
  dependencies,
  scale,
  totalHeight,
  criticalDependencyIds,
  violatedDependencyIds,
  highlightCritical,
  viewport,
  onSelectDependency,
  selectedDependencyId,
}: GanttLinksProps) {
  const edges = useMemo(() => {
    // Only rows that are actually rendered can be joined: an item inside a
    // collapsed group has no position on screen to draw to.
    const rendered = new Map(itemRows.map((row) => [row.item.id, row]));
    const out: Edge[] = [];

    for (const dependency of dependencies) {
      const source = rendered.get(dependency.sourceId);
      const target = rendered.get(dependency.targetId);
      if (!source || !target) continue;

      const violated = violatedDependencyIds.has(dependency.id);
      const critical = highlightCritical && criticalDependencyIds.has(dependency.id);

      out.push({
        dependency,
        source,
        target,
        color: violated ? VIOLATION_COLOR : critical ? CRITICAL_COLOR : source.color,
        emphasis: violated || critical,
      });
    }

    return out;
  }, [
    itemRows,
    dependencies,
    criticalDependencyIds,
    violatedDependencyIds,
    highlightCritical,
  ]);

  const visible = useMemo(
    () =>
      edges.filter(({ source, target }) => {
        const top = Math.min(rowCenterY(source), rowCenterY(target));
        const bottom = Math.max(rowCenterY(source), rowCenterY(target));
        if (bottom < viewport.top || top > viewport.bottom) return false;

        const xs = [
          scale.xOf(source.start),
          scale.xOf(source.start) + scale.widthOf(source.start, source.end),
          scale.xOf(target.start),
          scale.xOf(target.start) + scale.widthOf(target.start, target.end),
        ];
        return Math.max(...xs) >= viewport.left && Math.min(...xs) <= viewport.right;
      }),
    [edges, scale, viewport]
  );

  if (visible.length === 0) return null;

  const colors = Array.from(
    new Set([...visible.map((e) => e.color), "#0073ea"])
  );

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-20"
      width={scale.width}
      height={totalHeight}
      aria-hidden="true"
    >
      <defs>
        {/* One marker per colour rather than per link: the old chart emitted a
            <defs> block for every arrow, which on a large board is thousands of
            identical definitions. */}
        {colors.map((color) => (
          <marker
            key={color}
            id={`gantt-arrow-${cssId(color)}`}
            markerWidth="8"
            markerHeight="8"
            refX="8"
            refY="4"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
          </marker>
        ))}
      </defs>

      {visible.map(({ dependency, source, target, color, emphasis }) => {
        const [x1, x2] = anchors(dependency.type, source, target, scale);
        const y1 = rowCenterY(source);
        const y2 = rowCenterY(target);
        const path = orthogonalPath(x1, y1, x2, y2);
        const selected = selectedDependencyId === dependency.id;

        return (
          <g key={dependency.id}>
            {/* A 2px line is close to unclickable. This invisible one is wide
                enough to hit and carries the pointer events for the pair. */}
            {onSelectDependency && (
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDependency(dependency, { x: e.clientX, y: e.clientY });
                }}
              />
            )}
            <path
              d={path}
              fill="none"
              stroke={selected ? "#0073ea" : color}
              strokeWidth={selected || emphasis ? 2.5 : 2}
              strokeLinejoin="round"
              markerEnd={`url(#gantt-arrow-${cssId(selected ? "#0073ea" : color)})`}
              opacity={selected || emphasis ? 1 : 0.8}
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The x of each end, chosen by what the link type is actually about.
 *
 * Drawing every dependency finish-to-start, as the chart used to, makes a
 * start-to-start pair look like a sequence when the whole point of the link is
 * that the two run together.
 */
function anchors(
  type: GanttDependency["type"],
  source: GanttItemRow,
  target: GanttItemRow,
  scale: GanttScale
): [number, number] {
  const sourceStart = scale.xOf(source.start);
  const sourceEnd = sourceStart + scale.widthOf(source.start, source.end);
  const targetStart = scale.xOf(target.start);
  const targetEnd = targetStart + scale.widthOf(target.start, target.end);

  switch (type) {
    case "FS":
      return [sourceEnd, targetStart];
    case "SS":
      return [sourceStart, targetStart];
    case "FF":
      return [sourceEnd, targetEnd];
    case "SF":
      return [sourceStart, targetEnd];
  }
}

/** Hex colours are not valid in an id fragment reference. */
function cssId(color: string): string {
  return color.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * A right-angled route from one bar to the next, with rounded corners.
 *
 * When the successor starts comfortably to the right it is a simple dog-leg.
 * When it starts at or behind the predecessor's finish - which is what a
 * dependency violation looks like - the route has to double back, so it drops
 * to the midpoint between the rows and crosses there.
 */
function orthogonalPath(x1: number, y1: number, x2: number, y2: number): string {
  const margin = 12;
  const r = 5;

  if (x2 > x1 + margin * 2) {
    const midX = x1 + margin;
    const dirY = y2 > y1 ? 1 : -1;

    if (Math.abs(y2 - y1) < 2 * r) {
      return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 - 2} ${y2}`;
    }
    return (
      `M ${x1} ${y1} L ${midX - r} ${y1} Q ${midX} ${y1}, ${midX} ${y1 + dirY * r} ` +
      `L ${midX} ${y2 - dirY * r} Q ${midX} ${y2}, ${midX + r} ${y2} L ${x2 - 2} ${y2}`
    );
  }

  const midX1 = x1 + margin;
  const midX2 = x2 - margin;
  const midY = (y1 + y2) / 2;
  const dirY1 = midY > y1 ? 1 : -1;
  const dirY2 = y2 > midY ? 1 : -1;

  if (Math.abs(midY - y1) < 2 * r || Math.abs(midX1 - midX2) < 2 * r) {
    return (
      `M ${x1} ${y1} L ${midX1} ${y1} L ${midX1} ${midY} ` +
      `L ${midX2} ${midY} L ${midX2} ${y2} L ${x2 - 2} ${y2}`
    );
  }

  return (
    `M ${x1} ${y1} L ${midX1 - r} ${y1} Q ${midX1} ${y1}, ${midX1} ${y1 + dirY1 * r} ` +
    `L ${midX1} ${midY - dirY1 * r} Q ${midX1} ${midY}, ${midX1 - r} ${midY} ` +
    `L ${midX2 + r} ${midY} Q ${midX2} ${midY}, ${midX2} ${midY + dirY2 * r} ` +
    `L ${midX2} ${y2 - dirY2 * r} Q ${midX2} ${y2}, ${midX2 + r} ${y2} L ${x2 - 2} ${y2}`
  );
}
