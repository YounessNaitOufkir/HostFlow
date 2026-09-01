"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CellValue, DependencyType, Item, ItemLink, Profile } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { useLanguage } from "@/components/LanguageProvider";
import type { TranslateVars, TranslationKey } from "@/lib/i18n";
import {
  createGanttScale,
  ganttBounds,
  PX_PER_DAY,
  GANTT_ZOOMS,
  type GanttZoom,
} from "@/lib/gantt/scale";
import {
  buildGanttRows,
  projectRowId,
  type GanttBoardContext,
  type GanttItemRow,
  type GanttRow,
} from "@/lib/gantt/rows";
import { addDaysOnly, today, toDateOnly, daysBetween, dayIndex } from "@/lib/gantt/dates";
import { visibleRowRange, visiblePxWindow } from "@/lib/gantt/virtual";
import {
  GANTT_FIELDS,
  DEFAULT_GANTT_FIELDS,
  normalizeFields,
  fieldsWidth,
  minPaneWidth,
  type GanttFieldContext,
  type GanttFieldKey,
} from "@/lib/gantt/taskFields";
import { collectDependencies } from "@/lib/gantt/dependencies";
import { computeSchedule, type TaskSchedule } from "@/lib/gantt/schedule";
import { rescheduleFrom } from "@/lib/gantt/reschedule";
import {
  inferDependencyType,
  validateNewLink,
  type BarEdge,
} from "@/lib/gantt/linking";
import { GanttHeader, GANTT_HEADER_HEIGHT } from "./GanttHeader";
import { GanttLinks } from "./GanttLinks";
import { GanttToolbar, type GanttColorBy } from "./GanttToolbar";
import { GanttLinkEditor } from "./GanttLinkEditor";
import type { GanttDependency } from "@/lib/gantt/dependencies";
import type { GanttExportKind } from "./GanttExportMenu";
import {
  renderGanttSvg,
  svgToPngBlob,
  svgToPdfBlob,
  printGanttSvg,
  ganttToTable,
  GANTT_TABLE_HEADERS,
  downloadBlob,
  slugify,
  PDF_CONTENT_WIDTH_PX,
} from "@/lib/gantt/export";
import { GANTT_HEADER_HEIGHT as HEADER_H } from "./GanttHeader";

export interface GanttChartProps {
  contexts: GanttBoardContext[];
  itemLinks?: ItemLink[];
  profiles?: Profile[];
  /** Master Gantt: one swimlane per board, so a row's project is never in doubt. */
  showProjectRows?: boolean;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  onUpdateItem?: (itemId: string, columnId: string, value: CellValue) => void;
  /**
   * Applies a whole reschedule as one undoable change. Without it a drag moves
   * only the task that was dragged, and the arrows stop meaning anything.
   */
  onRescheduleItems?: (
    changes: { itemId: string; columnId: string; value: CellValue }[],
    summary: { movedCount: number; cycleDetected: boolean }
  ) => void;
  /** Freezes today's dates as the agreed plan, so drift from it becomes visible. */
  onCaptureBaseline?: (
    baselines: { itemId: string; start: string; end: string }[]
  ) => void;
  /** Creates a dependency drawn between two bars. */
  onCreateLink?: (link: {
    sourceId: string;
    targetId: string;
    type: DependencyType;
  }) => void;
  onUpdateLink?: (
    linkId: string,
    changes: { type?: DependencyType; lag?: number }
  ) => void;
  onDeleteLink?: (linkId: string) => void;
  onMoveItem?: (sourceId: string, targetId: string) => void;
  onSelectItem?: (item: Item) => void;
  /** Distinguishes each chart's saved zoom and pane width in localStorage. */
  storageKey: string;
  /** Names the exported file and titles the printed sheet. */
  exportTitle?: string;
  readOnlyReason?: string;
  emptyMessage?: React.ReactNode;
  toolbarExtras?: React.ReactNode;
}

/** The critical chain, in the same red the rest of the product uses for trouble. */
const CRITICAL_COLOR = "#e2445c";

const MIN_LEFT_WIDTH = 180;
const MAX_LEFT_WIDTH = 900;
const DEFAULT_LEFT_WIDTH = 420;
/** Pointer travel, in px, that turns a click on a bar into a drag. */
const DRAG_THRESHOLD = 4;

/**
 * Keeps a gesture with the element it started on.
 *
 * Without capture a drag ends the moment the pointer leaves the bar, which for
 * a finger crossing the chart is immediately.
 */
function capturePointer(e: React.PointerEvent) {
  try {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  } catch {
    /* not supported here; the window listeners still carry the gesture */
  }
}

export default function GanttChart({
  contexts,
  itemLinks = [],
  profiles,
  showProjectRows = false,
  collapsed,
  onToggleCollapse,
  onUpdateItem,
  onRescheduleItems,
  onCaptureBaseline,
  onCreateLink,
  onUpdateLink,
  onDeleteLink,
  onMoveItem,
  onSelectItem,
  storageKey,
  exportTitle = "Gantt chart",
  readOnlyReason,
  emptyMessage,
  toolbarExtras,
}: GanttChartProps) {
  const { t, dateLocale } = useLanguage();
  const editable = Boolean(onUpdateItem);

  const [zoom, setZoom] = useState<GanttZoom>("day");
  /** Set by Fit; cleared whenever the zoom is chosen explicitly. */
  const [fitPxPerDay, setFitPxPerDay] = useState<number | null>(null);
  const [colorBy, setColorBy] = useState<GanttColorBy>("group");
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [fields, setFields] = useState<GanttFieldKey[]>(DEFAULT_GANTT_FIELDS);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const leftTrackRef = useRef<HTMLDivElement>(null);

  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  // ---------------------------------------------------------------- preferences

  // Preferences are read after mount rather than in a lazy initialiser: this
  // component is prerendered on the server, where localStorage does not exist,
  // and starting from a different value there is a hydration mismatch. That
  // makes the setState below deliberate, hence the suppressions.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let storedZoom: GanttZoom | null = null;
    let storedWidth: number | null = null;
    let storedFields: GanttFieldKey[] | null = null;
    try {
      const zoomValue = localStorage.getItem(`hostflow_gantt_zoom_${storageKey}`);
      if (zoomValue && (GANTT_ZOOMS as string[]).includes(zoomValue)) {
        storedZoom = zoomValue as GanttZoom;
      }
      const widthValue = Number(
        localStorage.getItem(`hostflow_gantt_leftwidth_${storageKey}`)
      );
      if (widthValue >= MIN_LEFT_WIDTH && widthValue <= MAX_LEFT_WIDTH) {
        storedWidth = widthValue;
      }
      const fieldsValue = localStorage.getItem(`hostflow_gantt_fields_${storageKey}`);
      if (fieldsValue) storedFields = normalizeFields(JSON.parse(fieldsValue));
    } catch {
      /* a private window is not a reason to fail to render a chart */
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedZoom) setZoom(storedZoom);
    if (storedWidth) setLeftWidth(storedWidth);
    if (storedFields) setFields(storedFields);
  }, [storageKey]);

  const changeFields = useCallback(
    (next: GanttFieldKey[]) => {
      const normalized = normalizeFields(next);
      setFields(normalized);
      try {
        localStorage.setItem(
          `hostflow_gantt_fields_${storageKey}`,
          JSON.stringify(normalized)
        );
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const changeZoom = useCallback(
    (next: GanttZoom) => {
      setZoom(next);
      setFitPxPerDay(null);
      try {
        localStorage.setItem(`hostflow_gantt_zoom_${storageKey}`, next);
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  // ---------------------------------------------------------------- model

  const model = useMemo(
    () =>
      buildGanttRows({
        contexts,
        collapsed,
        profiles,
        showProjectRows,
      }),
    [contexts, collapsed, profiles, showProjectRows]
  );

  const { rows, itemRows, totalHeight, starts, ends } = model;

  const scale = useMemo(() => {
    const { chartStart, chartEnd } = ganttBounds(starts, ends, zoom);
    return createGanttScale({
      zoom,
      chartStart,
      chartEnd,
      pxPerDay: fitPxPerDay ?? undefined,
      dateLocale,
    });
  }, [starts, ends, zoom, fitPxPerDay, dateLocale]);

  // ---------------------------------------------------------------- schedule

  const dependencies = useMemo(() => {
    const boardsById = new Map(contexts.map((c) => [c.board.id, c.board]));
    return collectDependencies(
      contexts.flatMap((c) => c.items),
      boardsById,
      itemLinks
    );
  }, [contexts, itemLinks]);

  /**
   * Float and the critical path are computed over every plotted task, not just
   * the visible ones: collapsing a group must not change which chain drives the
   * finish date.
   */
  const schedule = useMemo(
    () =>
      computeSchedule(
        Array.from(model.byItemId.values()).map((row) => ({
          id: row.item.id,
          start: dayIndex(row.start),
          end: dayIndex(row.end),
        })),
        dependencies
      ),
    [model.byItemId, dependencies]
  );

  const violatedDependencyIds = useMemo(
    () => new Set(schedule.violations.map((v) => v.dependencyId)),
    [schedule.violations]
  );

  const baselineCount = useMemo(
    () =>
      Array.from(model.byItemId.values()).filter((r) => r.baseline !== null).length,
    [model.byItemId]
  );

  const captureBaseline = useCallback(() => {
    if (!onCaptureBaseline) return;
    onCaptureBaseline(
      Array.from(model.byItemId.values()).map((row) => ({
        itemId: row.item.id,
        start: toDateOnly(row.start),
        end: toDateOnly(row.end),
      }))
    );
    setShowBaseline(true);
  }, [onCaptureBaseline, model.byItemId]);

  const itemNames = useMemo(
    () =>
      new Map(
        Array.from(model.byItemId.values()).map((r) => [r.item.id, r.label])
      ),
    [model.byItemId]
  );

  // Turning on a column widens the pane rather than crushing the task names,
  // which the fixed-width columns would otherwise squeeze into an ellipsis.
  const paneContentWidth = Math.max(leftWidth, minPaneWidth(fields));
  /** Whatever the fixed columns do not use is the name column's to take. */
  const nameWidth =
    paneContentWidth - (fieldsWidth(fields) - GANTT_FIELDS.name.width);

  // ---------------------------------------------------------------- scrolling

  const rafRef = useRef<number | null>(null);

  const syncPanes = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Written straight to the DOM: the header and task pane have to track the
    // scroll every frame, and routing that through React state would re-render
    // the whole chart on each one.
    if (headerTrackRef.current) {
      headerTrackRef.current.style.transform = `translateX(${-el.scrollLeft}px)`;
    }
    if (leftTrackRef.current) {
      leftTrackRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
    }
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScroll({ left: el.scrollLeft, top: el.scrollTop });
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () =>
      setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToToday = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const x = scale.xOf(today());
    el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    syncPanes();
  }, [scale, syncPanes]);

  /**
   * Open on today rather than on the earliest task, which on a plan with any
   * history is a screen of finished work.
   */
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    if (openedAt.current === storageKey) return;
    if (viewport.width === 0 || rows.length === 0) return;
    openedAt.current = storageKey;

    const now = today();
    if (now >= scale.chartStart && now <= scale.chartEnd) scrollToToday();
  }, [storageKey, viewport.width, rows.length, scale, scrollToToday]);

  const fitToWindow = useCallback(() => {
    const el = bodyRef.current;
    if (!el || scale.totalDays === 0) return;
    const needed = el.clientWidth / scale.totalDays;

    // Keep the band structure sensible for the resulting density: a year fitted
    // into 1200px wants month bands, not 365 unreadable day columns.
    const best = GANTT_ZOOMS.reduce((a, b) =>
      Math.abs(PX_PER_DAY[b] - needed) < Math.abs(PX_PER_DAY[a] - needed) ? b : a
    );
    setZoom(best);
    setFitPxPerDay(needed);
    el.scrollLeft = 0;
    syncPanes();
  }, [scale.totalDays, syncPanes]);

  // ---------------------------------------------------------------- windowing

  const rowWindow = useMemo(
    () => visibleRowRange(rows, scroll.top, viewport.height),
    [rows, scroll.top, viewport.height]
  );
  const pxWindow = useMemo(
    () => visiblePxWindow(scroll.left, viewport.width, scale.width),
    [scroll.left, viewport.width, scale.width]
  );

  const visibleRows = useMemo(
    () => rows.slice(rowWindow.start, rowWindow.end),
    [rows, rowWindow.start, rowWindow.end]
  );

  const gridLines = useMemo(
    () => scale.minorTicks(pxWindow),
    [scale, pxWindow]
  );

  // ---------------------------------------------------------------- bar editing

  const [drag, setDrag] = useState<{
    id: string;
    startX: number;
    dx: number;
    moved: boolean;
  } | null>(null);
  const [resize, setResize] = useState<{
    id: string;
    edge: "left" | "right";
    startX: number;
    dx: number;
  } | null>(null);

  const rowsById = useMemo(
    () => new Map(itemRows.map((r) => [r.item.id, r])),
    [itemRows]
  );

  const cellValueFor = useCallback(
    (row: GanttItemRow, start: Date, end: Date): CellValue =>
      row.colType === "date"
        ? toDateOnly(start)
        : { start: toDateOnly(start), end: toDateOnly(end) },
    []
  );

  /**
   * Commit a drag or resize.
   *
   * When the chart has a reschedule path, the successors of the task that moved
   * are worked out here and written with it as one change - so an arrow on this
   * chart actually constrains the plan rather than just decorating it. Without
   * that path it falls back to moving the single task, as before.
   */
  const writeDates = useCallback(
    (row: GanttItemRow, start: Date, end: Date) => {
      if (!onUpdateItem && !onRescheduleItems) return;

      if (!onRescheduleItems) {
        onUpdateItem!(row.item.id, row.columnId, cellValueFor(row, start, end));
        return;
      }

      const positions = new Map(
        Array.from(model.byItemId.values()).map((r) => [
          r.item.id,
          { start: dayIndex(r.start), end: dayIndex(r.end) },
        ])
      );

      const { moves, cycleDetected } = rescheduleFrom({
        tasks: positions,
        dependencies,
        movedId: row.item.id,
        movedTo: { start: dayIndex(start), end: dayIndex(end) },
      });

      const changes = Array.from(moves.entries()).flatMap(([itemId, position]) => {
        const target = model.byItemId.get(itemId);
        if (!target) return [];
        const shift = position.start - dayIndex(target.start);
        const newStart = addDaysOnly(target.start, shift);
        const newEnd = addDaysOnly(
          target.end,
          position.end - dayIndex(target.end)
        );
        return [
          {
            itemId,
            columnId: target.columnId,
            value: cellValueFor(target, newStart, newEnd),
          },
        ];
      });

      if (changes.length === 0) return;
      onRescheduleItems(changes, {
        movedCount: changes.length - 1,
        cycleDetected,
      });
    },
    [onUpdateItem, onRescheduleItems, cellValueFor, model.byItemId, dependencies]
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      setDrag((d) =>
        d ? { ...d, dx, moved: d.moved || Math.abs(dx) > DRAG_THRESHOLD } : d
      );
    };

    const onUp = () => {
      const row = rowsById.get(drag.id);
      if (row) {
        if (!drag.moved) {
          // Below the threshold this was a click, and clicking a bar in every
          // other tool opens the task.
          onSelectItem?.(row.item);
        } else {
          const shift = scale.daysFromPx(drag.dx);
          if (shift !== 0) {
            writeDates(row, addDaysOnly(row.start, shift), addDaysOnly(row.end, shift));
          }
        }
      }
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, rowsById, scale, writeDates, onSelectItem]);

  useEffect(() => {
    if (!resize) return;

    const onMove = (e: PointerEvent) =>
      setResize((r) => (r ? { ...r, dx: e.clientX - r.startX } : r));

    const onUp = () => {
      const row = rowsById.get(resize.id);
      const shift = scale.daysFromPx(resize.dx);
      if (row && shift !== 0) {
        if (resize.edge === "left") {
          const start = addDaysOnly(row.start, shift);
          if (start <= row.end) writeDates(row, start, row.end);
        } else {
          const end = addDaysOnly(row.end, shift);
          if (end >= row.start) writeDates(row, row.start, end);
        }
      }
      setResize(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resize, rowsById, scale, writeDates]);

  /**
   * Keyboard editing.
   *
   * A bar was an undraggable div with no tab stop, so the chart was unusable
   * without a mouse and unreadable to a screen reader. Arrow keys nudge a task
   * by a day, Shift+arrows resize it from the finish, and both go through the
   * same reschedule path a drag does.
   */
  const handleBarKeyDown = useCallback(
    (e: React.KeyboardEvent, row: GanttItemRow) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectItem?.(row.item);
        return;
      }
      if (!editable) return;

      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();

      if (e.shiftKey) {
        // Resize from the finish; a task may not end before it starts.
        const end = addDaysOnly(row.end, step);
        if (end >= row.start) writeDates(row, row.start, end);
        return;
      }
      writeDates(row, addDaysOnly(row.start, step), addDaysOnly(row.end, step));
    },
    [editable, onSelectItem, writeDates]
  );

  // ---------------------------------------------------------------- linking

  /**
   * Drawing a dependency between two bars.
   *
   * The edge the drag leaves and the edge it lands on are the link type, so
   * there is nothing else to pick: out of a finish into a start is
   * finish-to-start, out of a start into a start is start-to-start.
   */
  const [linkDrag, setLinkDrag] = useState<{
    sourceId: string;
    fromEdge: BarEdge;
    x: number;
    y: number;
    hover: { targetId: string; edge: BarEdge } | null;
  } | null>(null);

  const linkable = Boolean(onCreateLink);

  /**
   * Which bar, and which end of it, sits under a point.
   *
   * Done geometrically rather than with mouseenter handlers on the bars: enter
   * and leave are unreliable while a button is held, and this needs no extra
   * elements in a chart that may already have thousands.
   */
  const hitTestBar = useCallback(
    (x: number, y: number, excludeId: string) => {
      const row = rows.find(
        (r) => r.kind === "item" && y >= r.y && y < r.y + r.height
      ) as GanttItemRow | undefined;
      if (!row || row.item.id === excludeId) return null;

      const left = scale.xOf(row.start);
      const width = scale.widthOf(row.start, row.end);
      // A little forgiveness either side, since a bar can be one pixel wide at
      // the coarser zooms.
      const pad = 8;
      if (x < left - pad || x > left + width + pad) return null;

      return {
        targetId: row.item.id,
        edge: (x < left + width / 2 ? "start" : "finish") as BarEdge,
      };
    },
    [rows, scale]
  );

  const startLink = useCallback(
    (e: React.PointerEvent, row: GanttItemRow, edge: BarEdge) => {
      if (!linkable) return;
      e.preventDefault();
      e.stopPropagation();
      capturePointer(e);
      const rect = bodyRef.current?.getBoundingClientRect();
      setLinkDrag({
        sourceId: row.item.id,
        fromEdge: edge,
        x: rect ? e.clientX - rect.left + (bodyRef.current?.scrollLeft ?? 0) : 0,
        y: rect ? e.clientY - rect.top + (bodyRef.current?.scrollTop ?? 0) : 0,
        hover: null,
      });
    },
    [linkable]
  );

  useEffect(() => {
    if (!linkDrag) return;

    const onMove = (e: PointerEvent) => {
      const el = bodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      const y = e.clientY - rect.top + el.scrollTop;
      setLinkDrag((d) => (d ? { ...d, x, y, hover: hitTestBar(x, y, d.sourceId) } : d));
    };

    const onUp = () => {
      const drag = linkDrag;
      setLinkDrag(null);
      if (!drag?.hover || !onCreateLink) return;

      const { targetId, edge } = drag.hover;
      const check = validateNewLink(dependencies, drag.sourceId, targetId);
      if (!check.ok) {
        // Refusing silently would look like the drag simply missed.
        toast.error(t(check.messageKey ?? "gantt.linkFailed"));
        return;
      }

      onCreateLink({
        sourceId: drag.sourceId,
        targetId,
        type: inferDependencyType(drag.fromEdge, edge),
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [linkDrag, dependencies, onCreateLink, hitTestBar, t]);

  /** The point the rubber band is tied to - the edge of the bar it left. */
  const linkAnchor = useMemo(() => {
    if (!linkDrag) return null;
    const row = model.byItemId.get(linkDrag.sourceId);
    if (!row) return null;
    const x =
      linkDrag.fromEdge === "finish"
        ? scale.xOf(row.start) + scale.widthOf(row.start, row.end)
        : scale.xOf(row.start);
    return { x, y: row.y + row.height / 2 };
  }, [linkDrag, model.byItemId, scale]);


  const [selectedLink, setSelectedLink] = useState<{
    dependency: GanttDependency;
    at: { x: number; y: number };
  } | null>(null);

  // Keep the open editor in step with the data behind it, and close it if the
  // link it describes is deleted from anywhere.
  const openLink = useMemo(() => {
    if (!selectedLink) return null;
    const current = dependencies.find((d) => d.id === selectedLink.dependency.id);
    return current ? { dependency: current, at: selectedLink.at } : null;
  }, [selectedLink, dependencies]);

  // ---------------------------------------------------------------- violations

  /**
   * Walking the broken links.
   *
   * The count on its own was a dead end: it said ten links were broken and gave
   * you no way to reach any of them. Each press takes the next one, opening its
   * group if it is shut, scrolling it into view and opening its editor - so the
   * fix is one click from the report.
   */
  const [violationCursor, setViolationCursor] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const goToNextViolation = useCallback(() => {
    const violations = schedule.violations;
    if (violations.length === 0) return;

    const violation = violations[violationCursor % violations.length];
    setViolationCursor((c) => (c + 1) % violations.length);

    const target = model.byItemId.get(violation.targetId);
    if (!target) return;

    // Reveal it first: a task inside a shut lane has nowhere on screen to be
    // scrolled to.
    if (collapsed.has(target.group.id)) onToggleCollapse(target.group.id);
    const lane = projectRowId(target.board.id);
    if (collapsed.has(lane)) onToggleCollapse(lane);

    setPendingFocus(violation.targetId);
  }, [schedule.violations, violationCursor, model.byItemId, collapsed, onToggleCollapse]);

  /**
   * Runs once the row it wants actually exists.
   *
   * Revealing a lane re-lays out the rows, so the scroll cannot happen in the
   * same tick as the request - the target has no position until then.
   */
  useEffect(() => {
    if (!pendingFocus) return;

    const row = rows.find(
      (r): r is GanttItemRow => r.kind === "item" && r.item.id === pendingFocus
    );
    const el = bodyRef.current;
    if (!row || !el) return;

    const left = Math.max(0, scale.xOf(row.start) - el.clientWidth / 3);
    const top = Math.max(0, row.y - el.clientHeight / 3);

    // Smooth where it exists, plain assignment where it does not - scrollTo is
    // absent in jsdom, and a missing convenience should not take the chart down.
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ left, top, behavior: "smooth" });
    } else {
      el.scrollLeft = left;
      el.scrollTop = top;
    }
    syncPanes();

    const dependency = dependencies.find(
      (d) => d.targetId === pendingFocus && violatedDependencyIds.has(d.id)
    );
    if (dependency && (onUpdateLink || onDeleteLink)) {
      // Anchored to the middle of the viewport rather than a click: there was no
      // click, and the bar's own position is still settling from the scroll.
      // Deliberate: this effect exists to act once the requested row finally
      // has a position, which is a render later than the request.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedLink({
        dependency,
        at: { x: window.innerWidth / 2 - 140, y: window.innerHeight / 3 },
      });
    }

    setPendingFocus(null);
  }, [
    pendingFocus,
    rows,
    scale,
    syncPanes,
    dependencies,
    violatedDependencyIds,
    onUpdateLink,
    onDeleteLink,
  ]);

  // ---------------------------------------------------------------- pane resize

  const [resizingPane, setResizingPane] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resizingPane) return;

    const onMove = (e: PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setLeftWidth(
        Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, e.clientX - rect.left))
      );
    };
    const onUp = () => {
      setResizingPane(false);
      setLeftWidth((w) => {
        try {
          localStorage.setItem(`hostflow_gantt_leftwidth_${storageKey}`, String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizingPane, storageKey]);

  // ---------------------------------------------------------------- reordering

  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // ---------------------------------------------------------------- export

  /**
   * Exports redraw the chart from the row model rather than capturing the DOM.
   * The on-screen chart only mounts the rows in the viewport, so a screenshot of
   * it would be mostly empty - and a redraw covers the whole plan at any size.
   */
  const buildSvg = useCallback(
    (page?: { widthPx: number }) => {
      const taskColumnWidth = page
        ? // Held back on paper so the timeline keeps most of the width; the
          // table is a reference column there, not the thing being read.
          Math.min(340, Math.max(240, paneContentWidth))
        : Math.max(240, paneContentWidth);

      let exportScale = scale;

      if (page) {
        // Fitted to the sheet rather than exported at the screen's zoom. At day
        // zoom a six-month plan is 9,000px wide, which is what turned a PDF into
        // a wall of pages - and shrinking those pixels alone would leave 180 day
        // columns nobody can read, so the band granularity is re-chosen too.
        const available = Math.max(200, page.widthPx - taskColumnWidth);
        const estimate = available / scale.totalDays;
        const zoomForPage = GANTT_ZOOMS.reduce((a, b) =>
          Math.abs(PX_PER_DAY[b] - estimate) < Math.abs(PX_PER_DAY[a] - estimate) ? b : a
        );
        const bounds = ganttBounds(starts, ends, zoomForPage);
        const days = Math.max(1, daysBetween(bounds.chartStart, bounds.chartEnd) + 1);
        exportScale = createGanttScale({
          zoom: zoomForPage,
          chartStart: bounds.chartStart,
          chartEnd: bounds.chartEnd,
          pxPerDay: available / days,
          dateLocale,
        });
      }

      return renderGanttSvg({
        rows,
        dependencies,
        scale: exportScale,
        title: exportTitle,
        colorBy,
        schedules: schedule.tasks,
        criticalIds: schedule.criticalIds,
        violatedDependencyIds,
        highlightCritical: showCriticalPath,
        taskColumnWidth,
        compact: Boolean(page),
      });
    },
    [
      rows,
      dependencies,
      scale,
      starts,
      ends,
      exportTitle,
      colorBy,
      schedule,
      violatedDependencyIds,
      showCriticalPath,
      paneContentWidth,
      dateLocale,
    ]
  );

  const handleExport = useCallback(
    async (kind: GanttExportKind) => {
      const name = slugify(exportTitle);
      try {
        if (kind === "csv" || kind === "xlsx") {
          const table = [
            GANTT_TABLE_HEADERS,
            ...ganttToTable(rows, dependencies, schedule.tasks),
          ];
          const XLSX = await import("xlsx");
          const sheet = XLSX.utils.aoa_to_sheet(table);

          if (kind === "csv") {
            downloadBlob(
              new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: "text/csv;charset=utf-8" }),
              `${name}.csv`
            );
          } else {
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, sheet, "Gantt");
            downloadBlob(
              new Blob([XLSX.write(book, { bookType: "xlsx", type: "array" })], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              }),
              `${name}.xlsx`
            );
          }
          return;
        }

        if (kind === "print") {
          // Paper, so the same page-fitted rendering the PDF uses.
          if (!printGanttSvg(buildSvg({ widthPx: PDF_CONTENT_WIDTH_PX }), exportTitle)) {
            toast.error(t("gantt.exportBlocked"));
          }
          return;
        }

        if (kind === "png") {
          // Left at the on-screen zoom: an image is scrolled and zoomed, not
          // read at a fixed size, so shrinking it to a page would lose detail.
          downloadBlob(await svgToPngBlob(buildSvg(), 2), `${name}.png`);
          return;
        }

        downloadBlob(
          await svgToPdfBlob(buildSvg({ widthPx: PDF_CONTENT_WIDTH_PX }), {
            headerHeight: HEADER_H + 44,
            title: exportTitle,
          }),
          `${name}.pdf`
        );
      } catch (error) {
        console.error("Gantt export failed:", error);
        toast.error(t("gantt.exportFailed"));
      }
    },
    [buildSvg, exportTitle, rows, dependencies, schedule.tasks, t]
  );

  // ---------------------------------------------------------------- render

  const paneWidth = leftCollapsed ? 0 : paneContentWidth;
  const todayX = scale.xOf(today());
  const todayVisible = todayX >= 0 && todayX <= scale.width;

  const toolbar = (
    <GanttToolbar
      zoom={zoom}
      onZoomChange={changeZoom}
      colorBy={colorBy}
      onColorByChange={setColorBy}
      onScrollToToday={scrollToToday}
      onFitToWindow={fitToWindow}
      showCriticalPath={showCriticalPath}
      onShowCriticalPathChange={setShowCriticalPath}
      showBaseline={showBaseline}
      onShowBaselineChange={setShowBaseline}
      baselineCount={baselineCount}
      onCaptureBaseline={onCaptureBaseline ? captureBaseline : undefined}
      criticalCount={schedule.criticalIds.size}
      violationCount={schedule.violations.length}
      onGoToViolation={schedule.violations.length > 0 ? goToNextViolation : undefined}
      cycleCount={schedule.cycleIds.size}
      onExport={handleExport}
      fields={fields}
      onFieldsChange={changeFields}
      readOnlyReason={readOnlyReason}
    >
      {toolbarExtras}
    </GanttToolbar>
  );

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
        {toolbar}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm max-w-md">
            {emptyMessage ?? (
              <>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                  {t("gantt.nothingToPlotTitle")}
                </h2>
                <p className="text-gray-500 dark:text-gray-400">
                  {t("gantt.nothingToPlotBody")}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden text-gray-800 dark:text-slate-300 min-h-0"
      style={{ cursor: resizingPane ? "col-resize" : undefined }}
    >
      {toolbar}

      <div className="flex-1 flex flex-col min-h-0 border-t border-gray-200 dark:border-[#1e2333]">
        {/* Header band. Its own viewport, translated to follow the body's
            horizontal scroll - one real scroller keeps the two in lockstep
            without a scroll-event feedback loop between them. */}
        <div className="flex shrink-0 bg-white dark:bg-[#131722] border-b border-gray-200 dark:border-[#1e2333] relative z-30">
          <div
            className="shrink-0 relative flex items-end border-r border-gray-200 dark:border-[#1e2333] bg-gray-50 dark:bg-[#0e111a]"
            style={{ width: paneWidth, height: GANTT_HEADER_HEIGHT }}
          >
            {!leftCollapsed && (
              <>
                <div className="absolute inset-x-0 bottom-0 flex items-stretch h-8">
                  {fields.map((key) => {
                    const field = GANTT_FIELDS[key];
                    return (
                      <div
                        key={key}
                        className={`flex items-center px-2 min-w-0 ${
                          field.align === "right" ? "justify-end" : ""
                        } ${key === "name" ? "" : "border-l border-gray-200/60 dark:border-[#1e2333]"}`}
                        style={{
                          width: key === "name" ? nameWidth : field.width,
                          flexShrink: 0,
                        }}
                      >
                        <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider truncate">
                          {t(field.labelKey)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 transition-colors z-40"
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setResizingPane(true);
                  }}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setLeftCollapsed((v) => !v)}
              className="absolute z-50 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] shadow-md hover:bg-gray-100 dark:hover:bg-[#252a3f] transition-all"
              style={{ right: -12, top: "50%", transform: "translateY(-50%)" }}
              title={t(leftCollapsed ? "gantt.showTaskList" : "gantt.hideTaskList")}
              aria-label={t(leftCollapsed ? "gantt.showTaskList" : "gantt.hideTaskList")}
            >
              <ChevronDown
                size={12}
                className="text-gray-500 dark:text-gray-400"
                style={{
                  transform: leftCollapsed ? "rotate(-90deg)" : "rotate(90deg)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <div ref={headerTrackRef} style={{ width: scale.width, willChange: "transform" }}>
              <GanttHeader scale={scale} window={pxWindow} />
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Task pane, translated to follow the body's vertical scroll. */}
          <div
            className="shrink-0 overflow-hidden bg-gray-50 dark:bg-[#0e111a] border-r border-gray-200 dark:border-[#1e2333] relative"
            style={{ width: paneWidth }}
          >
            <div ref={leftTrackRef} className="relative" style={{ willChange: "transform" }}>
              {!leftCollapsed &&
                visibleRows.map((row) => (
                  <TaskPaneRow
                    key={row.id}
                    row={row}
                    width={paneContentWidth}
                    fields={fields}
                    nameWidth={nameWidth}
                    context={{
                      t,
                      dateLocale,
                      schedule:
                        row.kind === "item"
                          ? schedule.tasks.get(row.item.id)
                          : undefined,
                      dependencies,
                      nameById: itemNames,
                    }}
                    onToggleCollapse={onToggleCollapse}
                    onSelectItem={onSelectItem}
                    reorderable={Boolean(onMoveItem)}
                    draggedRowId={draggedRowId}
                    dropTargetId={dropTargetId}
                    setDraggedRowId={setDraggedRowId}
                    setDropTargetId={setDropTargetId}
                    onMoveItem={onMoveItem}
                  />
                ))}
            </div>
          </div>

          {/* The one real scroller. */}
          <div
            ref={bodyRef}
            className="flex-1 overflow-auto bg-gray-50/50 dark:bg-[#0e111a]"
            onScroll={syncPanes}
          >
            <div
              className="relative"
              style={{ width: scale.width, height: Math.max(totalHeight, 1) }}
            >
              {/* Grid */}
              <div className="absolute inset-0 pointer-events-none">
                {gridLines.map((tick) => (
                  <div
                    key={tick.key}
                    className="absolute top-0 bottom-0 border-r border-gray-200/70 dark:border-[#1e2333]"
                    style={{ left: tick.x, width: tick.width }}
                  />
                ))}
              </div>

              {todayVisible && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-500/70 pointer-events-none z-20 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                  style={{ left: todayX }}
                  aria-hidden="true"
                />
              )}

              {visibleRows.map((row) => (
                <TimelineRow
                  key={row.id}
                  row={row}
                  scale={scale}
                  colorBy={colorBy}
                  editable={editable}
                  drag={drag?.id === row.id ? drag : null}
                  resize={resize?.id === row.id ? resize : null}
                  onStartDrag={(e, id) => {
                    if (!editable && !onSelectItem) return;
                    e.preventDefault();
                    e.stopPropagation();
                    capturePointer(e);
                    setDrag({ id, startX: e.clientX, dx: 0, moved: false });
                  }}
                  onStartResize={(e, id, edge) => {
                    e.preventDefault();
                    e.stopPropagation();
                    capturePointer(e);
                    setResize({ id, edge, startX: e.clientX, dx: 0 });
                  }}
                  t={t}
                  dateLocale={dateLocale}
                  taskSchedule={
                    row.kind === "item" ? schedule.tasks.get(row.item.id) : undefined
                  }
                  highlightCritical={showCriticalPath}
                  showBaseline={showBaseline}
                  onBarKeyDown={handleBarKeyDown}
                  linkable={linkable}
                  onStartLink={startLink}
                  linkHoverEdge={
                    linkDrag?.hover?.targetId === row.id
                      ? linkDrag.hover.edge
                      : null
                  }
                />
              ))}

              {linkDrag && (
                <svg
                  className="absolute top-0 left-0 pointer-events-none z-50"
                  width={scale.width}
                  height={Math.max(totalHeight, 1)}
                  aria-hidden="true"
                >
                  <line
                    x1={linkAnchor?.x ?? linkDrag.x}
                    y1={linkAnchor?.y ?? linkDrag.y}
                    x2={linkDrag.x}
                    y2={linkDrag.y}
                    stroke={linkDrag.hover ? "#0073ea" : "#94a3b8"}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                  <circle
                    cx={linkDrag.x}
                    cy={linkDrag.y}
                    r={4}
                    fill={linkDrag.hover ? "#0073ea" : "#94a3b8"}
                  />
                </svg>
              )}

              <GanttLinks
                itemRows={itemRows}
                dependencies={dependencies}
                scale={scale}
                totalHeight={totalHeight}
                criticalDependencyIds={schedule.criticalDependencyIds}
                violatedDependencyIds={violatedDependencyIds}
                highlightCritical={showCriticalPath}
                onSelectDependency={
                  onUpdateLink || onDeleteLink
                    ? (dependency, at) => setSelectedLink({ dependency, at })
                    : undefined
                }
                selectedDependencyId={openLink?.dependency.id ?? null}
                viewport={{
                  top: scroll.top - 200,
                  bottom: scroll.top + viewport.height + 200,
                  left: pxWindow.start,
                  right: pxWindow.end,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {openLink && (
        <GanttLinkEditor
          key={openLink.dependency.id}
          dependency={openLink.dependency}
          at={openLink.at}
          sourceName={
            model.byItemId.get(openLink.dependency.sourceId)?.label ??
            t("master.unknownTask")
          }
          targetName={
            model.byItemId.get(openLink.dependency.targetId)?.label ??
            t("master.unknownTask")
          }
          // A link recorded only on an item's dependency column has no row to
          // carry a type or a lag, so it can be removed but not reshaped.
          readOnly={openLink.dependency.id.startsWith("col-")}
          onChange={(changes) => onUpdateLink?.(openLink.dependency.id, changes)}
          onDelete={() => {
            onDeleteLink?.(openLink.dependency.id);
            setSelectedLink(null);
          }}
          onClose={() => setSelectedLink(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ task pane

interface TaskPaneRowProps {
  row: GanttRow;
  width: number;
  fields: GanttFieldKey[];
  nameWidth: number;
  context: GanttFieldContext;
  onToggleCollapse: (id: string) => void;
  onSelectItem?: (item: Item) => void;
  reorderable: boolean;
  draggedRowId: string | null;
  dropTargetId: string | null;
  setDraggedRowId: (id: string | null) => void;
  setDropTargetId: (id: string | null) => void;
  onMoveItem?: (sourceId: string, targetId: string) => void;
}

/**
 * One row of the task table.
 *
 * The cells are whatever columns the board asked for, so the same component
 * renders a name-and-dates pane or a full schedule table with duration, slack
 * and predecessors. Summary rows use the same columns, which is what lets a
 * phase's rolled-up duration line up under the task durations inside it.
 */
function TaskPaneRow({
  row,
  width,
  fields,
  nameWidth,
  context,
  onToggleCollapse,
  onSelectItem,
  reorderable,
  draggedRowId,
  dropTargetId,
  setDraggedRowId,
  setDropTargetId,
  onMoveItem,
}: TaskPaneRowProps) {
  const base =
    "absolute left-0 flex items-stretch border-b border-gray-200 dark:border-[#1e2333] overflow-hidden";
  const style: React.CSSProperties = { top: row.y, height: row.height, width };
  const isSummary = row.kind !== "item";

  const cells = (
    <>
      {fields.map((key) => {
        const field = GANTT_FIELDS[key];
        const isName = key === "name";
        const text = field.value(row, context);

        return (
          <div
            key={key}
            className={`flex items-center px-2 min-w-0 ${
              field.align === "right" ? "justify-end" : ""
            } ${isName ? "" : "border-l border-gray-200/60 dark:border-[#1e2333]"}`}
            style={{ width: isName ? nameWidth : field.width, flexShrink: 0 }}
          >
            {isName && (
              <>
                {isSummary ? (
                  <Chevron
                    collapsed={row.collapsed}
                    style={{ marginLeft: row.depth * 12 }}
                  />
                ) : (
                  <span
                    className="shrink-0"
                    style={{ width: row.depth * 12 + 16 }}
                    aria-hidden="true"
                  />
                )}
                {row.kind === "group" && (
                  <span
                    className="w-2 h-2 rounded-full mr-2 shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                )}
              </>
            )}
            <TruncatedText
              className={`truncate ${
                field.numeric ? "tabular-nums" : ""
              } ${
                isName
                  ? isSummary
                    ? "font-bold text-[12.5px] text-gray-800 dark:text-gray-100"
                    : "text-[12.5px] text-gray-700 dark:text-slate-300"
                  : "text-[11.5px] text-gray-500 dark:text-gray-400"
              }`}
            >
              {text}
            </TruncatedText>
            {isName && isSummary && (
              <span className="ml-auto pl-2 shrink-0 text-[11px] font-semibold tabular-nums text-gray-400 dark:text-gray-500">
                {row.itemCount}
              </span>
            )}
          </div>
        );
      })}
    </>
  );

  if (isSummary) {
    return (
      <button
        type="button"
        onClick={() => onToggleCollapse(row.kind === "group" ? row.group.id : row.id)}
        className={`${base} text-left w-full transition-colors ${
          row.kind === "project"
            ? "bg-white dark:bg-[#151a29] hover:bg-gray-50 dark:hover:bg-[#1b2133]"
            : "bg-gray-100/70 dark:bg-[#1a1e2d] hover:bg-gray-200/70 dark:hover:bg-[#252a3f]"
        }`}
        style={style}
        aria-expanded={!row.collapsed}
      >
        {cells}
      </button>
    );
  }

  const isDropTarget = dropTargetId === row.item.id;

  return (
    <div
      draggable={reorderable}
      onDragStart={(e) => {
        setDraggedRowId(row.item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedRowId && draggedRowId !== row.item.id) setDropTargetId(row.item.id);
      }}
      onDragLeave={() => {
        if (dropTargetId === row.item.id) setDropTargetId(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (draggedRowId && draggedRowId !== row.item.id) onMoveItem?.(draggedRowId, row.item.id);
        setDropTargetId(null);
        setDraggedRowId(null);
      }}
      onDragEnd={() => {
        setDropTargetId(null);
        setDraggedRowId(null);
      }}
      onClick={() => onSelectItem?.(row.item)}
      className={`${base} bg-gray-50 dark:bg-[#0e111a] hover:bg-white dark:hover:bg-[#131722] transition-colors ${
        isDropTarget ? "border-t-2 border-t-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""
      } ${draggedRowId === row.item.id ? "opacity-50" : ""}`}
      style={{ ...style, cursor: reorderable ? "grab" : onSelectItem ? "pointer" : "default" }}
    >
      {cells}
    </div>
  );
}

function Chevron({ collapsed, style }: { collapsed: boolean; style?: React.CSSProperties }) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <Icon
      size={14}
      className="shrink-0 mr-1.5 text-gray-400 dark:text-gray-500"
      style={style}
    />
  );
}

/** "Mar 3 – 12" inside a month, "Mar 3 – Apr 2" across one, a bare date for a single day. */
function formatSpan(start: Date, end: Date, locale?: GanttFieldContext["dateLocale"]): string {
  if (daysBetween(start, end) === 0) return format(start, "MMM d", { locale });
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return `${format(start, "MMM d", { locale })} – ${format(end, sameMonth ? "d" : "MMM d", { locale })}`;
}

// ------------------------------------------------------------------ timeline

interface TimelineRowProps {
  row: GanttRow;
  scale: ReturnType<typeof createGanttScale>;
  colorBy: GanttColorBy;
  editable: boolean;
  drag: { dx: number; moved: boolean } | null;
  resize: { edge: "left" | "right"; dx: number } | null;
  onStartDrag: (e: React.PointerEvent, id: string) => void;
  onStartResize: (e: React.PointerEvent, id: string, edge: "left" | "right") => void;
  taskSchedule?: TaskSchedule;
  highlightCritical: boolean;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
  dateLocale: GanttFieldContext["dateLocale"];
  showBaseline: boolean;
  onBarKeyDown: (e: React.KeyboardEvent, row: GanttItemRow) => void;
  linkable: boolean;
  onStartLink: (e: React.PointerEvent, row: GanttItemRow, edge: BarEdge) => void;
  linkHoverEdge: BarEdge | null;
}

function TimelineRow({
  row,
  scale,
  colorBy,
  editable,
  drag,
  resize,
  onStartDrag,
  onStartResize,
  taskSchedule,
  highlightCritical,
  t,
  dateLocale,
  showBaseline,
  onBarKeyDown,
  linkable,
  onStartLink,
  linkHoverEdge,
}: TimelineRowProps) {
  const x = scale.xOf(row.start);
  const width = scale.widthOf(row.start, row.end);

  if (row.kind !== "item") {
    // A summary bar is drawn whether or not the group is collapsed. Hiding it
    // when expanded, as the old chart did, threw away the one thing the row is
    // there to say: when this phase starts and when it ends.
    return (
      <div
        className="absolute left-0 border-b border-gray-200 dark:border-[#1e2333] bg-gray-100/50 dark:bg-[#1a1e2d]/50"
        style={{ top: row.y, height: row.height, width: scale.width }}
      >
        <SummaryBar x={x} width={width} color={row.color} centerY={row.height / 2} />
      </div>
    );
  }

  const activeDx = drag?.moved ? drag.dx : 0;
  let barX = x;
  let barWidth = width;

  if (resize) {
    const shift = scale.daysFromPx(resize.dx) * scale.pxPerDay;
    if (resize.edge === "left") {
      barX += shift;
      barWidth -= shift;
    } else {
      barWidth += shift;
    }
    barWidth = Math.max(scale.pxPerDay, barWidth);
  }

  const isCritical = highlightCritical && !!taskSchedule?.isCritical;
  const color = isCritical
    ? CRITICAL_COLOR
    : colorBy === "status"
      ? row.statusColor
      : row.groupColor;
  const centerY = row.height / 2;

  // Float is the one number that says how much room a task has, and it is only
  // knowable from the whole network - so it is worth saying out loud.
  const floatLabel = taskSchedule?.inCycle
    ? t("gantt.inLoopShort")
    : taskSchedule && taskSchedule.totalFloat > 0
      ? t("gantt.slack", { days: taskSchedule.totalFloat })
      : taskSchedule
        ? t("gantt.noSlack")
        : "";

  return (
    <div
      className="absolute left-0 border-b border-gray-200 dark:border-[#1e2333] hover:bg-white/60 dark:hover:bg-[#131722]/60 transition-colors group/row"
      style={{ top: row.y, height: row.height, width: scale.width }}
    >
      {showBaseline && row.baseline && (
        <BaselineBar
          x={scale.xOf(row.baseline.start)}
          width={scale.widthOf(row.baseline.start, row.baseline.end)}
          centerY={centerY}
          slipDays={daysBetween(row.baseline.end, row.end)}
        />
      )}

      {row.isMilestone ? (
        <Milestone
          x={x + activeDx}
          centerY={centerY}
          color={color}
          label={row.label}
          date={row.start}
          editable={editable}
          floatLabel={floatLabel}
          t={t}
          dateLocale={dateLocale}
          onPointerDown={(e) => onStartDrag(e, row.item.id)}
          onKeyDown={(e) => onBarKeyDown(e, row)}
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => onBarKeyDown(e, row)}
          aria-label={`${row.label}, ${formatSpan(row.start, row.end, dateLocale)}${
            floatLabel ? `, ${floatLabel}` : ""
          }`}
          title={`${row.label}
${formatSpan(row.start, row.end, dateLocale)} · ${
            daysBetween(row.start, row.end) + 1
          }d${floatLabel ? `
${floatLabel}` : ""}${
            row.assigneeNames ? `
${row.assigneeNames}` : ""
          }`}
          onPointerDown={(e) => onStartDrag(e, row.item.id)}
          className={`absolute rounded-[3px] group/bar overflow-hidden flex items-center border border-white/20 hover:border-white/60 ${
            editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          } ${drag?.moved ? "opacity-80 shadow-xl z-30" : ""}`}
          style={{
            left: barX + activeDx,
            width: Math.max(scale.pxPerDay, barWidth),
            top: centerY,
            height: 22,
            transform: "translateY(-50%)",
            backgroundColor: color,
            boxShadow: `0 0 12px 1px ${color}55`,
            transitionDuration: drag || resize ? "0ms" : "150ms",
            // Without this a finger on a bar scrolls the chart instead of
            // moving the task: the browser claims the gesture before the
            // pointermove handler ever sees it.
            touchAction: "none",
          }}
        >
          {editable && row.colType === "timeline" && (
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-white/30 transition-colors"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => onStartResize(e, row.item.id, "left")}
            />
          )}

          <div className="absolute inset-0 bg-white/15 opacity-0 group-hover/bar:opacity-100 transition-opacity duration-150 pointer-events-none" />

          <TruncatedText
            className="flex-1 min-w-0 truncate text-[10px] font-bold text-white px-2 drop-shadow-md relative z-10"
            tooltip={row.label}
          >
            {row.label}
          </TruncatedText>

          {editable && row.colType === "timeline" && (
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-white/30 transition-colors"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => onStartResize(e, row.item.id, "right")}
            />
          )}
        </div>
      )}

      {linkable && !row.isMilestone && (
        <>
          <LinkHandle
            x={barX + activeDx}
            centerY={centerY}
            edge="start"
            t={t}
            active={linkHoverEdge === "start"}
            onPointerDown={(e) => onStartLink(e, row, "start")}
          />
          <LinkHandle
            x={barX + activeDx + Math.max(scale.pxPerDay, barWidth)}
            centerY={centerY}
            edge="finish"
            t={t}
            active={linkHoverEdge === "finish"}
            onPointerDown={(e) => onStartLink(e, row, "finish")}
          />
        </>
      )}

      {(drag?.moved || resize) && (
        <DragTooltip
          x={barX + activeDx}
          width={Math.max(scale.pxPerDay, barWidth)}
          start={previewStart(row, scale, drag, resize)}
          end={previewEnd(row, scale, drag, resize)}
        />
      )}

      {!row.isMilestone && row.assigneeNames && (
        <span
          className="absolute text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap pointer-events-none"
          style={{ left: barX + activeDx + Math.max(scale.pxPerDay, barWidth) + 8, top: centerY, transform: "translateY(-50%)" }}
        >
          {row.assigneeNames}
        </span>
      )}
    </div>
  );
}

function previewStart(
  row: GanttItemRow,
  scale: ReturnType<typeof createGanttScale>,
  drag: { dx: number; moved: boolean } | null,
  resize: { edge: "left" | "right"; dx: number } | null
): Date {
  if (drag?.moved) return addDaysOnly(row.start, scale.daysFromPx(drag.dx));
  if (resize?.edge === "left") return addDaysOnly(row.start, scale.daysFromPx(resize.dx));
  return row.start;
}

function previewEnd(
  row: GanttItemRow,
  scale: ReturnType<typeof createGanttScale>,
  drag: { dx: number; moved: boolean } | null,
  resize: { edge: "left" | "right"; dx: number } | null
): Date {
  if (drag?.moved) return addDaysOnly(row.end, scale.daysFromPx(drag.dx));
  if (resize?.edge === "right") return addDaysOnly(row.end, scale.daysFromPx(resize.dx));
  return row.end;
}

/** Live dates while a bar is being moved or resized - the move had none before. */
function DragTooltip({
  x,
  width,
  start,
  end,
}: {
  x: number;
  width: number;
  start: Date;
  end: Date;
}) {
  return (
    <div
      className="absolute z-[100] pointer-events-none flex justify-center"
      style={{ left: x, width, top: -4, transform: "translateY(-100%)" }}
    >
      <div className="bg-gray-900 text-white rounded-md px-3 py-1.5 shadow-lg flex items-center gap-2.5 text-xs font-semibold whitespace-nowrap">
        <span className="text-gray-400 tabular-nums">{daysBetween(start, end) + 1}d</span>
        <span className="tabular-nums">{format(start, "MMM d")}</span>
        <span className="text-gray-500">—</span>
        <span className="tabular-nums">{format(end, "MMM d")}</span>
      </div>
    </div>
  );
}

/**
 * The grab point for drawing a dependency.
 *
 * Kept faint until the row is hovered so a chart at rest is still a chart, and
 * lit while a drag is over it so the drop target is never in doubt.
 */
function LinkHandle({
  x,
  centerY,
  edge,
  active,
  t,
  onPointerDown,
}: {
  x: number;
  centerY: number;
  edge: BarEdge;
  active: boolean;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      title={t(edge === "finish" ? "gantt.linkFromFinish" : "gantt.linkFromStart")}
      className={`absolute z-40 rounded-full border-2 border-white dark:border-slate-900 cursor-crosshair transition-opacity ${
        active
          ? "opacity-100 bg-blue-500 scale-125"
          : // Revealed on hover, but a touch screen has no hover - there it is
            // always visible, or it could never be found at all.
            "opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 bg-gray-400 hover:bg-blue-500"
      }`}
      style={{
        // Sat just outside the bar rather than on its edge. Centred on the edge
        // it covered the resize handle underneath, so dragging a bar's end to
        // lengthen it started drawing a dependency instead.
        left: edge === "start" ? x - 14 : x + 4,
        top: centerY - 5,
        width: 10,
        height: 10,
        touchAction: "none",
      }}
    />
  );
}

/**
 * The plan as it was agreed, drawn as a thin grey bar beneath the live one.
 *
 * Without it a Gantt can only ever show the current plan, which by definition
 * is always on time - the slippage is exactly the thing that has been edited
 * away. The number on the end is how many days late the finish has drifted.
 */
function BaselineBar({
  x,
  width,
  centerY,
  slipDays,
}: {
  x: number;
  width: number;
  centerY: number;
  slipDays: number;
}) {
  return (
    <>
      <div
        className="absolute rounded-sm bg-gray-400/60 dark:bg-slate-500/50 pointer-events-none"
        style={{ left: x, width, top: centerY + 13, height: 5 }}
        aria-hidden="true"
      />
      {slipDays !== 0 && (
        <span
          className={`absolute text-[10px] font-semibold tabular-nums pointer-events-none ${
            slipDays > 0
              ? "text-red-500 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
          style={{ left: x + width + 6, top: centerY + 10 }}
        >
          {slipDays > 0 ? `+${slipDays}d` : `${slipDays}d`}
        </span>
      )}
    </>
  );
}

/** The bracket a summary row draws over its children's span. */
function SummaryBar({
  x,
  width,
  color,
  centerY,
}: {
  x: number;
  width: number;
  color: string;
  centerY: number;
}) {
  return (
    <div
      data-testid="gantt-summary-bar"
      className="absolute pointer-events-none"
      style={{ left: x, width, top: centerY - 5, height: 10 }}
    >
      <div className="absolute inset-x-0 top-0 h-[5px] rounded-sm" style={{ backgroundColor: color }} />
      {/* The downturned ends are what distinguish a summary from a task bar. */}
      <div className="absolute left-0 top-0 w-[3px] h-[10px]" style={{ backgroundColor: color }} />
      <div className="absolute right-0 top-0 w-[3px] h-[10px]" style={{ backgroundColor: color }} />
    </div>
  );
}

function Milestone({
  x,
  centerY,
  color,
  label,
  date,
  editable,
  floatLabel,
  t,
  dateLocale,
  onPointerDown,
  onKeyDown,
}: {
  x: number;
  centerY: number;
  color: string;
  label: string;
  date: Date;
  editable: boolean;
  /** Said out loud here too: a milestone has float like any other task. */
  floatLabel: string;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
  dateLocale: GanttFieldContext["dateLocale"];
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`${t("gantt.milestone", { name: label })}, ${format(date, "MMM d yyyy", { locale: dateLocale })}${
          floatLabel ? `, ${floatLabel}` : ""
        }`}
        title={`${label} — ${format(date, "MMM d, yyyy", { locale: dateLocale })}${
          floatLabel ? `
${floatLabel}` : ""
        }`}
        onPointerDown={onPointerDown}
        className={editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
        style={{
          position: "absolute",
          left: x,
          top: centerY,
          width: 16,
          height: 16,
          marginLeft: -8,
          transform: "translateY(-50%) rotate(45deg)",
          backgroundColor: color,
          boxShadow: `0 0 10px 1px ${color}66`,
          borderRadius: 2,
          touchAction: "none",
        }}
      />
      <span
        className="absolute text-[11px] font-semibold text-gray-700 dark:text-slate-300 whitespace-nowrap pointer-events-none"
        style={{ left: x + 14, top: centerY, transform: "translateY(-50%)" }}
      >
        {label}
      </span>
    </>
  );
}
