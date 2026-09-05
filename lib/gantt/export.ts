/**
 * Getting the chart out of the app.
 *
 * A Gantt's whole job in an organisation is to be shown to people who are not
 * looking at your screen - a client, a contractor, a lender - and this one had
 * no way out at all. No image, no PDF, no print, no spreadsheet.
 *
 * Everything here redraws the chart from the row model rather than screenshotting
 * the DOM, which matters for two reasons: the on-screen chart only ever mounts
 * the rows in the viewport, so a capture of it would be mostly blank; and a
 * vector redraw stays sharp at whatever size the recipient prints it.
 */

import { format } from "date-fns";
import type { GanttScale } from "./scale";
import type { GanttRow, GanttItemRow } from "./rows";
import type { GanttDependency } from "./dependencies";
import type { TaskSchedule } from "./schedule";
import { daysBetween } from "./dates";

export interface GanttExportInput {
  rows: GanttRow[];
  dependencies: GanttDependency[];
  scale: GanttScale;
  title: string;
  colorBy: "group" | "status";
  schedules: Map<string, TaskSchedule>;
  criticalIds: Set<string>;
  violatedDependencyIds: Set<string>;
  highlightCritical: boolean;
  taskColumnWidth?: number;
  /** Tighter rows and smaller bars, for output that will be printed. */
  compact?: boolean;
}

const HEADER_HEIGHT = 52;
const TITLE_HEIGHT = 44;

/**
 * Row heights for print.
 *
 * The on-screen heights are generous because a row is a drag target. On paper
 * nothing is dragged, and 60px a row turns a hundred-task plan into a stack of
 * mostly-white pages.
 */
const COMPACT_ROW_HEIGHTS: Record<GanttRow["kind"], number> = {
  project: 30,
  group: 26,
  item: 26,
};
const CRITICAL_COLOR = "#e2445c";
const INK = "#1f2937";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";
const BAND = "#f3f4f6";

/**
 * A colour that is safe to drop into an SVG attribute.
 *
 * Group colours are free text: the colour picker's hex field writes whatever is
 * typed straight to the database with no validation, and an import or a direct
 * API call is not even bound by its maxLength. printGanttSvg writes this markup
 * into a new window, so an unvalidated value can close the attribute and inject
 * its own markup. Anything that is not a plain hex or a bare colour keyword is
 * replaced rather than escaped, because a broken colour should still render.
 */
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,24}$/;
function safeColor(value: string | null | undefined, fallback: string = MUTED): string {
  return typeof value === "string" && SAFE_COLOR.test(value) ? value : fallback;
}

/** Printed output is always light: it ends up on paper or in someone else's deck. */
export function renderGanttSvg({
  rows,
  dependencies,
  scale,
  title,
  colorBy,
  schedules,
  criticalIds,
  violatedDependencyIds,
  highlightCritical,
  taskColumnWidth = 300,
  compact = false,
}: GanttExportInput): string {
  // Laid out here rather than reusing the rows' own y, so print can tighten the
  // spacing without the chart on screen having to change.
  const layout = new Map<string, { y: number; height: number }>();
  let cursor = 0;
  for (const row of rows) {
    const height = compact ? COMPACT_ROW_HEIGHTS[row.kind] : row.height;
    layout.set(row.id, { y: cursor, height });
    cursor += height;
  }
  const barHeight = compact ? 14 : 18;

  const bodyHeight = cursor;
  const width = taskColumnWidth + scale.width;
  const height = TITLE_HEIGHT + HEADER_HEIGHT + bodyHeight;
  const top = TITLE_HEIGHT + HEADER_HEIGHT;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

  // A label longer than its bar used to spill past the end and carry on in
  // white text over the white background, where it read as a smear of nothing.
  // Clipping each label to its own bar is the only reliable fix: text metrics
  // are not knowable here, so no character estimate can be trusted.
  const clips: string[] = [];
  // Reserved slot: clip paths have to be defined before the elements that
  // reference them, but they are only known once every row has been laid out.
  const CLIPS_SLOT = "<!--clips-->";
  parts.push(CLIPS_SLOT);

  // ---- title
  parts.push(
    `<text x="16" y="28" font-size="16" font-weight="700" fill="${INK}">${escapeXml(title)}</text>`
  );
  parts.push(
    `<text x="${width - 16}" y="28" font-size="11" fill="${MUTED}" text-anchor="end">` +
      `${escapeXml(format(new Date(), "d MMM yyyy"))}</text>`
  );

  // ---- time axis, both bands
  parts.push(`<g transform="translate(${taskColumnWidth},${TITLE_HEIGHT})">`);
  for (const tick of scale.majorTicks()) {
    parts.push(
      `<rect x="${tick.x}" y="0" width="${tick.width}" height="24" fill="${BAND}" stroke="${RULE}"/>`,
      `<text x="${tick.x + 6}" y="16" font-size="10" font-weight="700" fill="${MUTED}">${escapeXml(tick.label)}</text>`
    );
  }
  for (const tick of scale.minorTicks()) {
    parts.push(
      `<rect x="${tick.x}" y="24" width="${tick.width}" height="${HEADER_HEIGHT - 24}" fill="#ffffff" stroke="${RULE}"/>`,
      `<text x="${tick.x + tick.width / 2}" y="42" font-size="9" fill="${MUTED}" text-anchor="middle">${escapeXml(tick.label)}</text>`
    );
  }
  parts.push(`</g>`);

  // ---- vertical rules behind everything
  parts.push(`<g transform="translate(${taskColumnWidth},${top})">`);
  for (const tick of scale.minorTicks()) {
    parts.push(
      `<line x1="${tick.x}" y1="0" x2="${tick.x}" y2="${bodyHeight}" stroke="${RULE}" stroke-width="1"/>`
    );
  }
  parts.push(`</g>`);

  // ---- rows
  for (const row of rows) {
    const place = layout.get(row.id)!;
    const y = top + place.y;
    const isSummary = row.kind !== "item";

    if (isSummary) {
      parts.push(
        `<rect x="0" y="${y}" width="${width}" height="${place.height}" fill="${BAND}" stroke="${RULE}"/>`
      );
    } else {
      parts.push(
        `<line x1="0" y1="${y + place.height}" x2="${width}" y2="${y + place.height}" stroke="${RULE}"/>`
      );
    }

    // Task column
    const indent = 10 + row.depth * 12;
    const label =
      row.kind === "project" && row.workspaceName
        ? `${row.workspaceName} › ${row.label}`
        : row.label;
    const nameClipId = `name-clip-${clips.length}`;
    clips.push(
      `<clipPath id="${nameClipId}">` +
        `<rect x="${indent}" y="${y}" width="${Math.max(0, taskColumnWidth - indent - 72)}" height="${place.height}"/>` +
        `</clipPath>`
    );
    parts.push(
      `<text x="${indent}" y="${y + place.height / 2 + 4}" font-size="${isSummary ? 11 : 10}" ` +
        `font-weight="${isSummary ? 700 : 400}" fill="${INK}" clip-path="url(#${nameClipId})">` +
        `${escapeXml(label)}</text>`
    );
    parts.push(
      `<text x="${taskColumnWidth - 8}" y="${y + place.height / 2 + 4}" font-size="9" fill="${MUTED}" text-anchor="end">` +
        `${escapeXml(spanLabel(row.start, row.end))}</text>`
    );

    // Bar
    const x = taskColumnWidth + scale.xOf(row.start);
    const w = scale.widthOf(row.start, row.end);
    const centerY = y + place.height / 2;

    if (isSummary) {
      parts.push(
        `<rect x="${x}" y="${centerY - 4}" width="${w}" height="5" fill="${safeColor(row.color)}"/>`,
        `<rect x="${x}" y="${centerY - 4}" width="3" height="9" fill="${safeColor(row.color)}"/>`,
        `<rect x="${x + w - 3}" y="${centerY - 4}" width="3" height="9" fill="${safeColor(row.color)}"/>`
      );
      continue;
    }

    const item = row as GanttItemRow;
    const critical = highlightCritical && criticalIds.has(item.item.id);
    const color = critical
      ? CRITICAL_COLOR
      : colorBy === "status"
        ? item.statusColor
        : item.groupColor;

    if (item.isMilestone) {
      const s = 7;
      parts.push(
        `<polygon points="${x},${centerY - s} ${x + s},${centerY} ${x},${centerY + s} ${x - s},${centerY}" fill="${safeColor(color)}"/>`,
        `<text x="${x + s + 4}" y="${centerY + 4}" font-size="9" font-weight="600" fill="${INK}">${escapeXml(item.label)}</text>`
      );
    } else {
      parts.push(
        `<rect x="${x}" y="${centerY - barHeight / 2}" width="${w}" height="${barHeight}" rx="3" fill="${safeColor(color)}"/>`
      );
      // Only label the bar when the text has somewhere to sit.
      if (w > 34) {
        const clipId = `bar-clip-${clips.length}`;
        clips.push(
          `<clipPath id="${clipId}"><rect x="${x}" y="${centerY - barHeight / 2}" width="${w}" height="${barHeight}"/></clipPath>`
        );
        parts.push(
          `<text x="${x + 5}" y="${centerY + 4}" font-size="9" font-weight="700" fill="#ffffff" ` +
            `clip-path="url(#${clipId})">${escapeXml(item.label)}</text>`
        );
      }
      const schedule = schedules.get(item.item.id);
      if (schedule && schedule.totalFloat > 0) {
        parts.push(
          // Past x+10, where an outgoing dependency arrow makes its turn -
          // any closer and the slack figure sits under the arrowhead.
          `<text x="${x + w + 16}" y="${centerY + 3}" font-size="8" fill="${MUTED}">${schedule.totalFloat}d</text>`
        );
      }
    }
  }

  // ---- dependency arrows
  const centerOf = (row: GanttRow) => {
    const place = layout.get(row.id)!;
    return place.y + place.height / 2;
  };
  const positioned = new Map(
    rows.filter((r): r is GanttItemRow => r.kind === "item").map((r) => [r.item.id, r])
  );
  parts.push(`<g transform="translate(${taskColumnWidth},${top})" fill="none" stroke-width="1.5">`);
  for (const dependency of dependencies) {
    const source = positioned.get(dependency.sourceId);
    const target = positioned.get(dependency.targetId);
    if (!source || !target) continue;

    const stroke = violatedDependencyIds.has(dependency.id) ? CRITICAL_COLOR : "#94a3b8";
    const x1 = scale.xOf(source.start) + scale.widthOf(source.start, source.end);
    const x2 = scale.xOf(target.start);
    const y1 = centerOf(source);
    const y2 = centerOf(target);
    const mid = x1 + 10;

    parts.push(
      `<path d="M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2 - 4} ${y2}" stroke="${stroke}"/>`,
      `<polygon points="${x2 - 4},${y2 - 3} ${x2},${y2} ${x2 - 4},${y2 + 3}" fill="${stroke}" stroke="none"/>`
    );
  }
  parts.push(`</g>`);

  // ---- frame and the divider between the table and the timeline
  parts.push(
    `<line x1="${taskColumnWidth}" y1="${TITLE_HEIGHT}" x2="${taskColumnWidth}" y2="${height}" stroke="#9ca3af"/>`,
    `<rect x="0.5" y="${TITLE_HEIGHT + 0.5}" width="${width - 1}" height="${height - TITLE_HEIGHT - 1}" fill="none" stroke="#9ca3af"/>`
  );
  parts.push(`</svg>`);

  return parts.join("").replace(CLIPS_SLOT, `<defs>${clips.join("")}</defs>`);
}

// ---------------------------------------------------------------- raster

/**
 * Paint the SVG onto a canvas.
 *
 * The SVG references nothing outside itself, so the canvas stays untainted and
 * `toBlob` works - which is the only reason a PNG is possible without pulling in
 * a DOM-capture library.
 */
export function svgToCanvas(svg: string, pixelRatio = 2): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const { width, height } = svgSize(svg);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not get a 2D drawing context"));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterise the chart"));
    };
    image.src = url;
  });
}

function svgSize(svg: string): { width: number; height: number } {
  const width = /width="(\d+(?:\.\d+)?)"/.exec(svg);
  const height = /height="(\d+(?:\.\d+)?)"/.exec(svg);
  return {
    width: width ? Number(width[1]) : 1200,
    height: height ? Number(height[1]) : 800,
  };
}

export async function svgToPngBlob(svg: string, pixelRatio = 2): Promise<Blob> {
  const canvas = await svgToCanvas(svg, pixelRatio);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the PNG"))),
      "image/png"
    );
  });
}

/**
 * The page a PDF is laid out on: A3 landscape, 24pt margins, plus a strip at the
 * foot for the page number.
 *
 * Exposed in logical chart pixels so the caller can build an SVG that already
 * fits the width, rather than having one shrunk to fit after the fact.
 */
const PT_PER_PX = 0.75;
const PDF_MARGIN = 24;
const PDF_FOOTER = 18;

/** A3 landscape at 0.75pt per logical pixel, less the margins. */
export const PDF_CONTENT_WIDTH_PX = Math.floor((841.89 * 2 ** 0.5 - PDF_MARGIN * 2) / PT_PER_PX);

/**
 * A paginated PDF.
 *
 * Pages stack downwards only. The previous version also tiled sideways whenever
 * the timeline was wider than a page, which at day zoom is almost always: a
 * six-month plan came out as a grid of pages nobody could reassemble, and each
 * one held a fortnight of bars. Now the whole timeline is fitted to the page
 * width by the caller, so a page is a horizontal slice of the plan - the task
 * table and the date header repeat down every one of them.
 */
export async function svgToPdfBlob(
  svg: string,
  options: { headerHeight: number; title: string }
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");

  const pixelRatio = 2;
  const source = await svgToCanvas(svg, pixelRatio);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });

  const sheetWidth = doc.internal.pageSize.getWidth();
  const sheetHeight = doc.internal.pageSize.getHeight();
  const pageWidth = sheetWidth - PDF_MARGIN * 2;
  const pageHeight = sheetHeight - PDF_MARGIN * 2 - PDF_FOOTER;

  const chartWidth = source.width / pixelRatio;
  const chartHeight = source.height / pixelRatio;
  const header = options.headerHeight;

  // Points per logical pixel. The caller sizes the chart to the page, so this
  // lands near PT_PER_PX; it still fits anything wider rather than tiling.
  const k = pageWidth / chartWidth;
  const bodyPerPage = Math.max(80, pageHeight / k - header);
  const bodyTotal = Math.max(1, chartHeight - header);
  const pages = Math.max(1, Math.ceil(bodyTotal / bodyPerPage));

  for (let i = 0; i < pages; i++) {
    if (i > 0) doc.addPage();

    const sy = header + i * bodyPerPage;
    const sh = Math.min(bodyPerPage, chartHeight - sy);

    const page = document.createElement("canvas");
    page.width = Math.round(chartWidth * pixelRatio);
    page.height = Math.round((header + sh) * pixelRatio);
    const context = page.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, page.width, page.height);

    // Title and date bands, repeated: without them page three is a field of
    // anonymous bars against no dates.
    context.drawImage(
      source,
      0, 0, chartWidth * pixelRatio, header * pixelRatio,
      0, 0, chartWidth * pixelRatio, header * pixelRatio
    );
    context.drawImage(
      source,
      0, sy * pixelRatio, chartWidth * pixelRatio, sh * pixelRatio,
      0, header * pixelRatio, chartWidth * pixelRatio, sh * pixelRatio
    );

    doc.addImage(
      page.toDataURL("image/png"),
      "PNG",
      PDF_MARGIN,
      PDF_MARGIN,
      chartWidth * k,
      (header + sh) * k
    );

    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `${options.title} — page ${i + 1} of ${pages}`,
      PDF_MARGIN,
      sheetHeight - PDF_MARGIN / 2
    );
  }

  return doc.output("blob");
}

// ---------------------------------------------------------------- table

export const GANTT_TABLE_HEADERS = [
  "Level",
  "Workspace",
  "Board",
  "Group",
  "Task",
  "Start",
  "Finish",
  "Duration (days)",
  "Milestone",
  "Assignees",
  "Float (days)",
  "Critical",
  "Predecessors",
];

/** The chart as a table, for anyone who would rather have it in a spreadsheet. */
export function ganttToTable(
  rows: GanttRow[],
  dependencies: GanttDependency[],
  schedules: Map<string, TaskSchedule>
): (string | number)[][] {
  const nameById = new Map(
    rows.filter((r): r is GanttItemRow => r.kind === "item").map((r) => [r.item.id, r.label])
  );

  const predecessorsOf = (id: string) =>
    dependencies
      .filter((d) => d.targetId === id)
      .map((d) => {
        const name = nameById.get(d.sourceId) ?? d.sourceId;
        const lag = d.lag === 0 ? "" : d.lag > 0 ? `+${d.lag}d` : `${d.lag}d`;
        return `${name} (${d.type}${lag})`;
      })
      .join("; ");

  return rows.map((row) => {
    const common = [
      row.kind,
      row.kind === "project" ? (row.workspaceName ?? "") : "",
      row.kind === "item" ? row.board.name : row.kind === "group" ? row.board.name : row.label,
      row.kind === "item" ? row.group.title : row.kind === "group" ? row.label : "",
      row.kind === "item" ? row.label : "",
      format(row.start, "yyyy-MM-dd"),
      format(row.end, "yyyy-MM-dd"),
      daysBetween(row.start, row.end) + 1,
    ];

    if (row.kind !== "item") {
      return [...common, "", "", "", "", ""];
    }

    const schedule = schedules.get(row.item.id);
    return [
      ...common,
      row.isMilestone ? "yes" : "",
      row.assigneeNames,
      schedule ? schedule.totalFloat : "",
      schedule?.isCritical ? "yes" : "",
      predecessorsOf(row.item.id),
    ];
  });
}

// ---------------------------------------------------------------- delivery

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can beat the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Print the redrawn chart rather than the page.
 *
 * The on-screen chart lives inside nested scroll containers and only mounts the
 * rows in view, so printing the document would produce one clipped screenful.
 */
export function printGanttSvg(svg: string, title: string) {
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return false;

  win.document.write(
    `<!doctype html><html><head><title>${escapeXml(title)}</title>` +
      `<style>@page{size:A3 landscape;margin:10mm}` +
      `html,body{margin:0;padding:0;background:#fff}` +
      `svg{width:100%;height:auto}</style></head>` +
      `<body>${svg}</body></html>`
  );
  win.document.close();
  win.focus();
  // Give the SVG a frame to lay out before the print dialog measures it.
  win.setTimeout(() => {
    win.print();
    win.close();
  }, 250);
  return true;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      // Combining marks, so "Résidence" becomes "residence" rather than "r-sidence".
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "gantt"
  );
}

function spanLabel(start: Date, end: Date): string {
  if (daysBetween(start, end) === 0) return format(start, "d MMM");
  return `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
