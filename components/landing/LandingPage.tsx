"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Moon,
  Sun,
  Languages,
  LayoutList,
  Columns3,
  LayoutDashboard,
  Calendar,
  GripVertical,
  Smartphone,
} from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useLanguage, useT } from "@/components/LanguageProvider";
import type { TranslationKey } from "@/lib/i18n";

type MockView = "table" | "kanban" | "gantt" | "calendar" | "dashboard";

const MOCK_TABS: { key: MockView; labelKey: TranslationKey }[] = [
  { key: "table", labelKey: "board.viewTable" },
  { key: "kanban", labelKey: "board.viewKanban" },
  { key: "gantt", labelKey: "board.viewGantt" },
  { key: "calendar", labelKey: "board.viewCalendar" },
  { key: "dashboard", labelKey: "board.viewDashboard" },
];

/**
 * One focus ring for every interactive element on the page.
 *
 * The five view tabs used to be the only thing that had one; every <Link> —
 * nav, hero pair, closing pair, footer — fell back to the UA default, which
 * the amber button's own background swallows. A keyboard visitor lost the
 * cursor on the primary conversion path.
 */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5A623] dark:focus-visible:outline-amber-300";

/**
 * One press transition, shared.
 *
 * `active:scale-[.98]` only eases if `transform` is named in the transition.
 * The amber CTA had `transition-all` so it did; every secondary button had
 * `transition-colors`, so the same scale snapped — two buttons side by side in
 * the hero pressing like different components. Not `transition-all` as the
 * fix: that animates layout properties too.
 */
const PRESS =
  "transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[.98]";

const BTN_BASE = `inline-flex items-center justify-center font-bold rounded-[10px] ${PRESS} ${FOCUS_RING}`;

/** Brand amber (#F5A623 via the brand-amber theme key), not Tailwind's amber-400. */
const BTN_PRIMARY = `${BTN_BASE} bg-brand-amber text-[#221704] shadow-[0_1px_2px_rgba(245,166,35,.4)] hover:bg-brand-amber-hover hover:shadow-[0_6px_20px_-6px_rgba(245,166,35,.8)]`;

const BTN_SECONDARY = `${BTN_BASE} border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-white hover:bg-white dark:hover:bg-white/5 hover:border-gray-400 dark:hover:border-slate-400`;

/**
 * The same four illustrative tasks, reused across every mock view below.
 *
 * Keys rather than literals: this is marketing copy, not user data, so unlike
 * a real board's task names it SHOULD follow the reader's language. `status`
 * stays a stable identifier so the Kanban columns can group on it without
 * depending on the rendered string.
 */
const MOCK_TASKS = [
  { nameKey: "landing.mockTaskWireframes", initials: "JD", color: "#579bfc", status: "done", statusKey: "status.done", statusColor: "#00c875", datesKey: "landing.mockDates1" },
  { nameKey: "landing.mockTaskContent", initials: "MR", color: "#a25ddc", status: "working", statusKey: "status.workingOnIt", statusColor: "#fdab3d", datesKey: "landing.mockDates2" },
  { nameKey: "landing.mockTaskReview", initials: "SL", color: "#00c875", status: "stuck", statusKey: "status.stuck", statusColor: "#e2445c", datesKey: "landing.mockDates3" },
  { nameKey: "landing.mockTaskLaunch", initials: "AB", color: "#e2445c", status: "idle", statusKey: "status.notStarted", statusColor: null as string | null, datesKey: "landing.mockDates4" },
] as const;

/**
 * The public home page shown at "/" when there is no signed-in user.
 *
 * Exists for one reason: Google's OAuth consent-screen review requires a home
 * page reachable without signing in first, that explains what the product
 * does. Before this, "/" always redirected straight to the login form (see
 * proxy.ts), so reviewers — and anyone deciding whether to grant access —
 * never saw anything. Deliberately self-contained and free of data fetching,
 * for the same reason components/legal/LegalPage.tsx is: a database outage
 * must not take the one page Google's reviewer can reach down with it.
 *
 * The product mock below (board rows, Gantt bars) is illustrative content,
 * not a live view — it mirrors the real table/Gantt styling (full-bleed
 * status cells, the navy icon rail, STATUS_OPTIONS colors) so a visitor sees
 * something that actually looks like the app.
 */
function StatusPill({ status, color }: { status: string; color: string | null }) {
  return (
    <div
      className={`relative h-full flex items-center justify-center text-white text-[12.5px] font-medium whitespace-nowrap ${
        color ? "" : "bg-[#c4c4c4] dark:bg-[#3e4157]"
      }`}
      style={color ? { background: color } : undefined}
    >
      {status}
      <span
        className="absolute top-0 right-0 w-[11px] h-[11px] bg-white/20"
        style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
      />
    </div>
  );
}

function TableMock() {
  const t = useT();
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[38%]">{t("col.task")}</th>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[12%]">{t("col.owner")}</th>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[22%]">{t("col.status")}</th>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[28%]">{t("col.timeline")}</th>
        </tr>
      </thead>
      <tbody>
        {MOCK_TASKS.map((row) => (
          <tr key={row.status}>
            <td className="h-[38px] p-0 border-b border-gray-100 dark:border-slate-700/30 border-r border-gray-100 dark:border-slate-700/30">
              <div className="h-full flex items-center gap-2.5 px-3.5">
                <span className="w-[3px] h-[18px] rounded-sm bg-[#579bfc] shrink-0" />
                <span className="font-semibold whitespace-nowrap">{t(row.nameKey)}</span>
              </div>
            </td>
            <td className="h-[38px] p-0 border-b border-gray-100 dark:border-slate-700/30 border-r border-gray-100 dark:border-slate-700/30">
              <div className="h-full flex items-center px-3.5">
                <span
                  className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: row.color }}
                >
                  {row.initials}
                </span>
              </div>
            </td>
            <td className="h-[38px] p-0 border-b border-gray-100 dark:border-slate-700/30 border-r border-gray-100 dark:border-slate-700/30">
              <StatusPill status={t(row.statusKey)} color={row.statusColor} />
            </td>
            <td className="h-[38px] p-0 border-b border-gray-100 dark:border-slate-700/30 border-r border-gray-100 dark:border-slate-700/30">
              <div className="h-full flex items-center px-3.5">
                <span className="font-mono text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{t(row.datesKey)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GanttMock() {
  const t = useT();
  return (
    <div className="px-4 pt-3.5 pb-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] uppercase tracking-[.09em] font-bold text-gray-400 dark:text-gray-500">{t("landing.ganttStripTitle")}</span>
        <div className="flex gap-3.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1.5"><i className="w-4 h-[5px] rounded-full inline-block bg-brand-amber not-italic" /> {t("landing.criticalPath")}</span>
          <span className="flex items-center gap-1.5"><i className="w-4 h-[5px] rounded-full inline-block bg-[#579bfc] not-italic" /> {t("landing.float")}</span>
        </div>
      </div>
      {/* Every colour below used to be a literal, so this whole chart had no
          dark mode: the gridlines glared near-white on the #1e2140 card while
          the bar labels sank into it. Gantt is the DEFAULT tab, so it was the
          first thing a dark-mode visitor saw. */}
      <svg
        viewBox="0 0 620 132"
        width="100%"
        height="132"
        role="img"
        aria-label="Gantt bars for four tasks with dependency arrows; the design review sits on the critical path"
      >
        <g className="font-mono fill-[#8a96b4] dark:fill-[#64748B]" fontSize="9">
          <text x="40" y="10">{t("landing.ganttAxis1")}</text>
          <text x="180" y="10">{t("landing.ganttAxis2")}</text>
          <text x="320" y="10">{t("landing.ganttAxis3")}</text>
          <text x="460" y="10">{t("landing.ganttAxis4")}</text>
        </g>
        <g className="stroke-[#DFE4F0] dark:stroke-[#2a2d45]" strokeWidth="1">
          <line x1="40" y1="18" x2="40" y2="124" />
          <line x1="180" y1="18" x2="180" y2="124" />
          <line x1="320" y1="18" x2="320" y2="124" />
          <line x1="460" y1="18" x2="460" y2="124" />
          <line x1="600" y1="18" x2="600" y2="124" />
        </g>

        <rect x="40" y="28" width="96" height="15" rx="7.5" fill="#00c875" />
        <rect x="180" y="52" width="140" height="15" rx="7.5" fill="#F5A623" />
        <rect x="240" y="76" width="120" height="15" rx="7.5" fill="#F5A623" />
        <rect x="460" y="100" width="96" height="15" rx="7.5" fill="#579bfc" />

        <g className="stroke-[#8a96b4] dark:stroke-[#64748B]" strokeWidth="1.3" fill="none">
          <path d="M136 35.5 H150 V52 h24" />
          <path d="M320 59.5 H334 V76 h20" />
          <path d="M360 83.5 H420 V100 h34" />
        </g>
        <g className="fill-[#8a96b4] dark:fill-[#64748B]">
          <polygon points="180,59.5 172,55.5 172,63.5" />
          <polygon points="360,83.5 352,79.5 352,87.5" />
          <polygon points="460,107.5 452,103.5 452,111.5" />
        </g>

        {/* The claim this page makes is that a slip PROPAGATES down the chain.
            Drawing the path once says that; the pulsing dot that used to sit
            here said "loading". See .hf-cp-draw in globals.css — outside the
            no-preference query it is simply a solid line. */}
        <path
          className="hf-cp-draw"
          d="M136 35.5 H150 V52 h30 M320 59.5 H334 V76 h26 M360 83.5 H420 V100 h40"
          stroke="#e2445c"
          strokeWidth="2"
          fill="none"
        />

        <g className="font-mono fill-[#55638a] dark:fill-[#94A3B8]" fontSize="9.5">
          <text x="144" y="39">{t("landing.mockTaskWireframesShort")}</text>
          <text x="328" y="63">{t("landing.mockTaskContentShort")}</text>
          <text x="368" y="87">{t("landing.mockTaskReviewShort")}</text>
          <text x="564" y="111">{t("landing.mockTaskLaunchShort")}</text>
        </g>
        <circle cx="320" cy="59.5" r="4.5" fill="#e2445c" />
      </svg>
    </div>
  );
}

function KanbanMock() {
  const t = useT();
  const columns = [
    { status: "idle", labelKey: "status.notStarted", color: "#8a96b4" },
    { status: "working", labelKey: "status.workingOnIt", color: "#fdab3d" },
    { status: "stuck", labelKey: "status.stuck", color: "#e2445c" },
    { status: "done", labelKey: "status.done", color: "#00c875" },
  ] as const;
  return (
    <div className="p-4 grid grid-cols-4 gap-3">
      {columns.map((col) => (
        <div key={col.status}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-gray-500 dark:text-gray-400 whitespace-nowrap">{t(col.labelKey)}</span>
          </div>
          <div className="space-y-2 min-h-[64px] rounded-lg bg-gray-50 dark:bg-black/10 p-2">
            {MOCK_TASKS.filter((task) => task.status === col.status).map((task) => (
              <div key={task.status} className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-lg shadow-sm p-2.5">
                <p className="text-[12.5px] font-semibold leading-snug">{t(task.nameKey)}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{t(task.datesKey).split(" → ")[1]}</span>
                  <span
                    className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold text-white shrink-0"
                    style={{ background: task.color }}
                  >
                    {task.initials}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarMock() {
  const t = useT();
  const { locale } = useLanguage();
  const bars = [
    { labelKey: "landing.mockTaskContent", color: "#fdab3d", colStart: 2, colSpan: 3 },
    { labelKey: "landing.mockTaskReview", color: "#e2445c", colStart: 4, colSpan: 3 },
  ] as const;
  const dayInitials = locale === "fr"
    ? ["D", "L", "M", "M", "J", "V", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1">
        {dayInitials.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 pb-1">{d}</div>
        ))}
        {Array.from({ length: 28 }, (_, i) => (
          <div
            key={i}
            className="h-9 rounded-md border border-gray-100 dark:border-slate-700/30 text-[10px] text-gray-400 dark:text-gray-600 px-1.5 pt-1"
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {bars.map((bar) => (
          <div key={bar.labelKey} className="grid grid-cols-7 gap-1">
            <div
              className="h-6 rounded-full flex items-center px-2.5 text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden"
              style={{ gridColumnStart: bar.colStart, gridColumnEnd: `span ${bar.colSpan}`, background: bar.color }}
            >
              {t(bar.labelKey)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardMock() {
  const t = useT();
  const stats = [
    { label: t("status.done"), value: 1, color: "#00c875" },
    { label: t("status.workingOnIt"), value: 1, color: "#fdab3d" },
    { label: t("status.stuck"), value: 1, color: "#e2445c" },
    { label: t("status.notStarted"), value: 1, color: "#c4c4c4" },
  ];
  const total = stats.reduce((sum, s) => sum + s.value, 0);
  let cumulative = 0;
  const circumference = 2 * Math.PI * 34;
  return (
    <div className="p-4 grid grid-cols-[1fr_auto] gap-6 items-center">
      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 dark:border-slate-700/60 px-3 py-2.5">
            <p className="text-xl font-extrabold tabular-nums" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{s.label}</p>
          </div>
        ))}
      </div>
      <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Status ring: one task in each of done, working on it, stuck and not started">
        <g transform="translate(48,48) rotate(-90)">
          <circle r="34" fill="none" stroke="#EBEEF6" strokeWidth="12" className="dark:opacity-10" />
          {stats.map((s) => {
            const frac = s.value / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={s.label}
                r="34"
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-cumulative}
              />
            );
            cumulative += dash;
            return el;
          })}
        </g>
        <text x="48" y="52" textAnchor="middle" className="font-mono" fontSize="15" fontWeight="700" fill="currentColor">{total}</text>
      </svg>
    </div>
  );
}

const TOGGLE_CLASS =
  `inline-flex items-center justify-center h-9 rounded-[10px] border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-white/5 hover:border-gray-400 dark:hover:border-slate-400 ${PRESS} ${FOCUS_RING}`;

function ThemeToggle() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? t("landing.switchToLight") : t("landing.switchToDark")}
      className={`${TOGGLE_CLASS} w-9`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/**
 * Lets a visitor pick their language before they have an account to store it
 * on. LanguageProvider already infers French from navigator.language, so this
 * is for overriding that guess — and it is the one place on the public site
 * that demonstrates the bilingual claim the page makes further down.
 */
function LanguageToggle() {
  const { locale, setLocale } = useLanguage();
  const next = locale === "fr" ? "en" : "fr";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={next === "fr" ? "Passer en français" : "Switch to English"}
      className={`${TOGGLE_CLASS} gap-1.5 px-2.5 text-[12px] font-bold uppercase tracking-wide`}
    >
      <Languages size={15} />
      {next}
    </button>
  );
}

/** The six views, with the same glyphs the real board header uses. */
const VIEW_TILES: { key: TranslationKey; Icon: typeof LayoutList }[] = [
  { key: "board.viewTable", Icon: LayoutList },
  { key: "board.viewKanban", Icon: Columns3 },
  { key: "board.viewDashboard", Icon: LayoutDashboard },
  { key: "board.viewCalendar", Icon: Calendar },
  { key: "board.viewGantt", Icon: GripVertical },
  { key: "board.viewCards", Icon: Smartphone },
];

export default function LandingPage() {
  const t = useT();
  const [activeView, setActiveView] = useState<MockView>("gantt");

  /**
   * Which section the reader is in, driving the nav's active underline.
   *
   * The only piece of component state on the page — everything else here is
   * presentational. (A second observer used to also fade the nav's own "Get
   * started" to an outline button while the hero's identical CTA was still on
   * screen, so the two wouldn't split the click — but a quiet, near-white
   * button at the top of the page read as broken rather than deliberate, so
   * the nav CTA is back to always being the branded amber button.)
   */
  const [activeSection, setActiveSection] = useState<"how" | "views" | null>(null);

  useEffect(() => {
    const sections = ["how", "views"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    // Read every section's position rather than trusting the entry that fired:
    // that way scrolling back above "how" clears the underline instead of
    // leaving it stuck on whichever section was last seen.
    const decide = () => {
      let current: "how" | "views" | null = null;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= 140) {
          current = section.id as "how" | "views";
        }
      }
      setActiveSection(current);
    };

    const sectionObserver = new IntersectionObserver(decide, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    sections.forEach((section) => sectionObserver.observe(section));

    return () => sectionObserver.disconnect();
  }, []);

  const navLink = (href: string, id: "how" | "views" | null, label: string) => (
    <a
      href={href}
      className={`relative py-1 transition-colors ${FOCUS_RING} ${
        id !== null && activeSection === id
          ? "text-gray-900 dark:text-white"
          : "hover:text-gray-900 dark:hover:text-white"
      }`}
    >
      {label}
      {id !== null && (
        <span
          aria-hidden="true"
          className={`absolute left-0 -bottom-0.5 h-0.5 w-full origin-left rounded-full bg-brand-amber transition-transform duration-300 ease-out ${
            activeSection === id ? "scale-x-100" : "scale-x-0"
          }`}
        />
      )}
    </a>
  );

  return (
    <div className="hf-landing min-h-screen bg-[#F4F6F8] dark:bg-[#181b34] text-gray-900 dark:text-gray-100">
      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-30 backdrop-blur bg-[#F4F6F8]/85 dark:bg-[#181b34]/85 border-b border-gray-200/80 dark:border-slate-700/50">
        <div className="max-w-6xl mx-auto px-5 h-[62px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 font-extrabold tracking-tight text-[17px]">
            <svg width="28" height="28" viewBox="0 0 512 512" aria-hidden="true">
              <rect width="512" height="512" rx="112" fill="#1A2C5B" />
              <rect x="104" y="130" width="184" height="68" rx="34" fill="#fff" />
              <rect x="160" y="222" width="256" height="68" rx="34" fill="#F5A623" />
              <rect x="224" y="314" width="160" height="68" rx="34" fill="#fff" />
            </svg>
            HostFlow
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-gray-500 dark:text-gray-400">
            {navLink("#how", "how", t("landing.navHowItWorks"))}
            {navLink("#views", "views", t("landing.navViews"))}
            <Link href="/privacy" className={`py-1 hover:text-gray-900 dark:hover:text-white transition-colors ${FOCUS_RING}`}>{t("landing.navPrivacy")}</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <ThemeToggle />
            <Link
              href="/login"
              className={`hidden sm:inline-flex text-[13.5px] px-4 py-2.5 ${BTN_SECONDARY}`}
            >
              {t("landing.signIn")}
            </Link>
            <Link
              href="/login?signup=1"
              className={`text-[13.5px] px-4 py-2.5 ${BTN_PRIMARY}`}
            >
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="max-w-6xl mx-auto px-5 pt-20 pb-20">
        {/* The three lines are broken by hand on desktop, where they are a
            deliberate shape. Below sm: the breaks come off and text-balance
            owns the rag — French line one ("Planification visuelle,") is 23
            characters against English's 18, so on a 360px screen the forced
            breaks gave French four ragged lines where English got three. */}
        <h1 className="hf-rise max-w-[20ch] text-display-sm sm:text-5xl lg:text-display leading-[1.08] tracking-[-.03em] font-extrabold text-balance">
          {t("landing.heroLine1")}
          <br className="hidden sm:inline" />
          {t("landing.heroLine2")}
          <br className="hidden sm:inline" />
          <span className="bg-[linear-gradient(transparent_66%,rgba(245,166,35,.45)_66%)] dark:bg-[linear-gradient(transparent_66%,rgba(245,166,35,.55)_66%)]">
            {t("landing.heroLine3")}
          </span>
        </h1>
        <p className="hf-rise hf-rise-1 mt-6 max-w-[56ch] text-lede leading-[1.62] font-medium text-gray-600 dark:text-gray-300">
          {t("landing.lede")}
        </p>
        <div className="hf-rise hf-rise-2 mt-8 flex flex-wrap items-center gap-3">
          <Link href="/login?signup=1" className={`text-sm px-6 py-3.5 ${BTN_PRIMARY}`}>
            {t("landing.getStarted")}
          </Link>
          <Link href="/login" className={`text-sm px-6 py-3.5 ${BTN_SECONDARY}`}>
            {t("landing.signIn")}
          </Link>
        </div>

        {/* ---- product frame ---- */}
        <div className="hf-rise hf-rise-3 mt-12 flex bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-[14px] shadow-[0_2px_4px_rgba(26,44,91,.06),0_32px_64px_-24px_rgba(26,44,91,.32)] dark:shadow-[0_2px_4px_rgba(0,0,0,.3),0_32px_64px_-24px_rgba(0,0,0,.6)] overflow-hidden">
          <div className="w-[46px] shrink-0 bg-[#1A2C5B] flex flex-col items-center gap-3.5 py-3" aria-hidden="true">
            <div className="w-[26px] h-[26px] rounded-[7px] grid place-items-center bg-white/15 text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </div>
            <div className="w-[26px] h-[26px] rounded-[7px] grid place-items-center text-white/60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="18" rx="1.5" /><rect x="14" y="3" width="7" height="11" rx="1.5" /></svg>
            </div>
            <div className="w-[26px] h-[26px] rounded-[7px] grid place-items-center text-white/60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            </div>
            <div className="w-[26px] h-[26px] rounded-[7px] grid place-items-center text-white/60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </div>
          </div>

          {/* Below ~700px the board is wider than the frame. The mask says
              "there is more to the right" without adding a control; above sm:
              nothing is clipped, so it comes off. */}
          <div className="flex-1 min-w-0 overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,#000_calc(100%-44px),transparent)] sm:[mask-image:none]">
            <div className="min-w-[660px]">
              <div className="h-12 border-b border-gray-200 dark:border-slate-700/60 flex items-center gap-3.5 px-4">
                <span className="font-bold text-sm tracking-[-.01em]">{t("landing.mockBoardName")}</span>
                <div role="tablist" aria-label={t("landing.boardViewLabel")} className="flex gap-0.5 ml-auto">
                  {MOCK_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={activeView === tab.key}
                      onClick={() => setActiveView(tab.key)}
                      className={`text-[12.5px] px-2.5 py-1.5 rounded-[7px] transition-colors ${FOCUS_RING} ${
                        activeView === tab.key
                          ? "font-bold text-[#1A2C5B] bg-[#cce5ff] dark:text-[#cfe0ff] dark:bg-blue-900/30"
                          : "font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      }`}
                    >
                      {t(tab.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* The page's one interactive moment. It used to swap on the same
                  frame, and because the Gantt tab renders the table AND the
                  chart (~330px) against Kanban's ~150px, the page below lurched.
                  `layout` animates the wrapper between the two heights;
                  mode="wait" crossfades so the two never overlap. */}
              <MotionConfig reducedMotion="user">
                <motion.div layout transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeView}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      {activeView === "table" && <TableMock />}
                      {activeView === "gantt" && (
                        <>
                          <TableMock />
                          <GanttMock />
                        </>
                      )}
                      {activeView === "kanban" && <KanbanMock />}
                      {activeView === "calendar" && <CalendarMock />}
                      {activeView === "dashboard" && <DashboardMock />}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </MotionConfig>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="how" className="scroll-mt-[78px] max-w-6xl mx-auto px-5 py-20">
        <div className="max-w-[60ch]">
          <h2 className="text-h2-sm sm:text-h2 tracking-[-.022em] font-extrabold leading-[1.14]">
            {t("landing.featuresHeading")}
          </h2>
          <p className="mt-3.5 text-base leading-[1.6] font-medium text-gray-600 dark:text-gray-300">
            {t("landing.featuresSub")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-13 items-center pt-12">
          <div>
            <p className="font-mono text-[11px] tracking-[.14em] font-bold text-amber-700 dark:text-amber-400">{t("landing.criticalPathEyebrow")}</p>
            <h3 className="mt-3 text-h3 tracking-[-.015em] font-extrabold">{t("landing.criticalPathTitle")}</h3>
            <p className="mt-3 text-body leading-[1.65] font-medium text-gray-600 dark:text-gray-300">
              {t("landing.criticalPathBody")}
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-xl shadow-[0_1px_2px_rgba(26,44,91,.06),0_12px_32px_-12px_rgba(26,44,91,.18)] p-4">
            <svg viewBox="0 0 300 108" width="100%" role="img" aria-label="Three linked bars where moving the first pushes the two that follow it">
              <rect x="8" y="16" width="72" height="13" rx="6.5" fill="#579bfc" />
              <rect x="96" y="44" width="86" height="13" rx="6.5" fill="#F5A623" />
              <rect x="198" y="72" width="66" height="13" rx="6.5" fill="#F5A623" />
              <g className="stroke-[#8a96b4] dark:stroke-[#64748B]" strokeWidth="1.2" fill="none">
                <path d="M80 22.5 H88 V44 h4" />
                <path d="M182 50.5 H190 V72 h4" />
              </g>
              <g className="fill-[#8a96b4] dark:fill-[#64748B]">
                <polygon points="96,50.5 88,46.5 88,54.5" />
                <polygon points="198,78.5 190,74.5 190,82.5" />
              </g>
              <g className="font-mono fill-[#8a96b4] dark:fill-[#64748B]" fontSize="8">
                <text x="8" y="12">{t("landing.floatHigh")}</text>
                <text x="96" y="40">{t("landing.floatZero")}</text>
                <text x="198" y="68">{t("landing.floatZero")}</text>
              </g>
            </svg>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-13 items-center pt-12 mt-12 border-t border-gray-100 dark:border-slate-700/30">
          <div>
            <p className="font-mono text-[11px] tracking-[.14em] font-bold text-amber-700 dark:text-amber-400">{t("landing.bilingualEyebrow")}</p>
            <h3 className="mt-3 text-h3 tracking-[-.015em] font-extrabold">{t("landing.bilingualTitle")}</h3>
            <p className="mt-3 text-body leading-[1.65] font-medium text-gray-600 dark:text-gray-300">
              {t("landing.bilingualBody")}
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-xl shadow-[0_1px_2px_rgba(26,44,91,.06),0_12px_32px_-12px_rgba(26,44,91,.18)] p-4">
            {/* The two rows are the demonstration, so their labels are pinned
                to their own language rather than translated. The task name is
                deliberately identical in both: that is the point being made. */}
            <div className="flex items-center gap-2.5 text-[12.5px] px-2.5 py-2 rounded-lg bg-[#cce5ff] dark:bg-blue-900/30">
              <span className="font-mono text-[11px] font-bold tracking-[.06em] text-gray-400 dark:text-gray-500 w-[26px] shrink-0">EN</span>
              <span>Due date &mdash; <span className="font-bold">{t("landing.mockTaskReview")}</span></span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5 text-[12.5px] px-2.5 py-2 rounded-lg bg-brand-amber/15">
              <span className="font-mono text-[11px] font-bold tracking-[.06em] text-gray-400 dark:text-gray-500 w-[26px] shrink-0">FR</span>
              <span>Date d&rsquo;&eacute;ch&eacute;ance &mdash; <span className="font-bold">{t("landing.mockTaskReview")}</span></span>
            </div>
            <p className="mt-3 text-meta font-semibold text-gray-400 dark:text-gray-500">
              {t("landing.bilingualCaption")}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-13 items-center pt-12 mt-12 border-t border-gray-100 dark:border-slate-700/30">
          <div>
            <p className="font-mono text-[11px] tracking-[.14em] font-bold text-amber-700 dark:text-amber-400">{t("landing.searchEyebrow")}</p>
            <h3 className="mt-3 text-h3 tracking-[-.015em] font-extrabold">{t("landing.searchTitle")}</h3>
            <p className="mt-3 text-body leading-[1.65] font-medium text-gray-600 dark:text-gray-300">
              {t("landing.searchBody")}
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-xl shadow-[0_1px_2px_rgba(26,44,91,.06),0_12px_32px_-12px_rgba(26,44,91,.18)] p-4">
            <div className="px-3 py-2.5 rounded-[9px] border border-[#579bfc] bg-[#cce5ff] dark:bg-blue-900/30">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">
                {t("landing.searchWorkspaceProduct")} <span>&rsaquo;</span> <b className="text-gray-900 dark:text-white font-bold">{t("landing.mockBoardName")}</b>
              </div>
              <div className="mt-1 font-bold text-[13.5px]">{t("landing.mockTaskReview")}</div>
            </div>
            <div className="mt-2 px-3 py-2.5 rounded-[9px] border border-gray-100 dark:border-slate-700/40">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">
                {t("landing.searchWorkspaceMarketing")} <span>&rsaquo;</span> <b className="text-gray-900 dark:text-white font-bold">{t("landing.searchBoardCampaign")}</b>
              </div>
              <div className="mt-1 font-bold text-[13.5px]">{t("landing.mockTaskReview")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= VIEWS + EXTRAS ================= */}
      <section id="views" className="scroll-mt-[78px] max-w-6xl mx-auto px-5 pb-20">
        <div className="max-w-[60ch]">
          <h2 className="text-h2-sm sm:text-h2 tracking-[-.022em] font-extrabold leading-[1.14]">
            {t("landing.viewsHeading")}
          </h2>
          <p className="mt-3.5 text-base leading-[1.6] font-medium text-gray-600 dark:text-gray-300">
            {t("landing.viewsSub")}
          </p>
        </div>

        {/* The six views are this section's actual headline claim, so they are
            no longer a row of pills identical to the row below them — which put
            "Gantt" at the same weight as "Trash, restore & activity log". */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-5">
          {VIEW_TILES.map(({ key, Icon }) => (
            <div
              key={key}
              className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-600 rounded-[10px] px-3 py-3.5 flex flex-col gap-2.5 transition-colors hover:border-brand-amber"
            >
              <Icon size={18} className="text-gray-400 dark:text-gray-500" />
              <span className="text-[12.5px] font-bold tracking-[-.01em]">{t(key)}</span>
            </div>
          ))}
        </div>

        <p className="font-mono text-[11px] tracking-[.14em] font-bold text-gray-400 dark:text-gray-500 mt-12">{t("landing.alsoInTheBox")}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {(["landing.chipColumns", "landing.chipAutomations", "landing.chipNotifications", "landing.chipImport", "landing.chipPermissions", "landing.chipTrash", "landing.chipBaselines"] as const).map((key) => (
            <span
              key={key}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-[#1e2140]"
            >
              {t(key)}
            </span>
          ))}
        </div>
      </section>

      {/* ================= CLOSE ================= */}
      <section className="max-w-6xl mx-auto px-5 pb-6">
        {/* Left-aligned like every other heading on the page, and carrying the
            mark — the same three bars as the logo and the favicon, third
            surface — so the one block that showed nothing of the product now
            shows the product's own geometry. */}
        <div className="relative overflow-hidden rounded-[18px] px-8 py-14 bg-[#1A2C5B] text-white">
          <svg
            className="pointer-events-none absolute -right-10 top-1/2 -translate-y-1/2 w-[240px] h-[200px]"
            viewBox="0 0 512 512"
            aria-hidden="true"
          >
            <rect x="104" y="130" width="184" height="68" rx="34" fill="rgba(255,255,255,.08)" />
            <rect x="160" y="222" width="256" height="68" rx="34" fill="rgba(255,255,255,.12)" />
            <rect x="224" y="314" width="160" height="68" rx="34" fill="rgba(255,255,255,.08)" />
          </svg>
          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-.022em]">
              {t("landing.closingHeading")}
            </h2>
            <p className="mt-3.5 text-base font-medium text-white/70">{t("landing.closingSub")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login?signup=1" className={`text-sm px-6 py-3.5 ${BTN_PRIMARY}`}>
                {t("landing.getStarted")}
              </Link>
              <Link
                href="/login"
                className={`text-sm px-6 py-3.5 ${BTN_BASE} bg-white/10 border border-white/20 text-white hover:bg-white/20`}
              >
                {t("landing.signIn")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="max-w-6xl mx-auto px-5 py-8 border-t border-gray-200/80 dark:border-slate-700/50">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
          <span>&copy; {new Date().getFullYear()} HostFlow</span>
          <Link href="/privacy" className={`hover:text-gray-900 dark:hover:text-white transition-colors ${FOCUS_RING}`}>{t("landing.footerPrivacy")}</Link>
          <Link href="/terms" className={`hover:text-gray-900 dark:hover:text-white transition-colors ${FOCUS_RING}`}>{t("landing.footerTerms")}</Link>
          <Link href="/login" className={`hover:text-gray-900 dark:hover:text-white transition-colors ${FOCUS_RING}`}>{t("landing.signIn")}</Link>
        </div>
      </footer>
    </div>
  );
}
