"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

type MockView = "table" | "kanban" | "gantt" | "calendar" | "dashboard";

const MOCK_TABS: { key: MockView; label: string }[] = [
  { key: "table", label: "Table" },
  { key: "kanban", label: "Kanban" },
  { key: "gantt", label: "Gantt" },
  { key: "calendar", label: "Calendar" },
  { key: "dashboard", label: "Dashboard" },
];

/** The same four illustrative tasks, reused across every mock view below. */
const MOCK_TASKS = [
  { name: "Wireframes", initials: "JD", color: "#579bfc", status: "Done", statusColor: "#00c875", dates: "2 Mar → 6 Mar" },
  { name: "Content draft", initials: "MR", color: "#a25ddc", status: "Working on it", statusColor: "#fdab3d", dates: "9 Mar → 18 Mar" },
  { name: "Design review", initials: "SL", color: "#00c875", status: "Stuck", statusColor: "#e2445c", dates: "12 Mar → 20 Mar" },
  { name: "QA & launch", initials: "AB", color: "#e2445c", status: "Not started", statusColor: null as string | null, dates: "23 Mar → 27 Mar" },
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
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[38%]">Task</th>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[12%]">Owner</th>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[22%]">Status</th>
          <th className="text-left font-semibold text-[11px] uppercase tracking-[.09em] text-gray-400 dark:text-gray-500 px-3.5 py-2 border-b border-gray-200 dark:border-slate-700/60 border-r border-gray-100 dark:border-slate-700/30 whitespace-nowrap w-[28%]">Timeline</th>
        </tr>
      </thead>
      <tbody>
        {MOCK_TASKS.map((row) => (
          <tr key={row.name}>
            <td className="h-[38px] p-0 border-b border-gray-100 dark:border-slate-700/30 border-r border-gray-100 dark:border-slate-700/30">
              <div className="h-full flex items-center gap-2.5 px-3.5">
                <span className="w-[3px] h-[18px] rounded-sm bg-[#579bfc] shrink-0" />
                <span className="font-semibold whitespace-nowrap">{row.name}</span>
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
              <StatusPill status={row.status} color={row.statusColor} />
            </td>
            <td className="h-[38px] p-0 border-b border-gray-100 dark:border-slate-700/30 border-r border-gray-100 dark:border-slate-700/30">
              <div className="h-full flex items-center px-3.5">
                <span className="font-mono text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{row.dates}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GanttMock() {
  return (
    <div className="px-4 pt-3.5 pb-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] uppercase tracking-[.09em] font-bold text-gray-400 dark:text-gray-500">Same tasks, Gantt view</span>
        <div className="flex gap-3.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1.5"><i className="w-4 h-[5px] rounded-full inline-block bg-amber-400 not-italic" /> Critical path</span>
          <span className="flex items-center gap-1.5"><i className="w-4 h-[5px] rounded-full inline-block bg-[#579bfc] not-italic" /> Float</span>
        </div>
      </div>
      <svg
        viewBox="0 0 620 132"
        width="100%"
        height="132"
        role="img"
        aria-label="Gantt bars for four tasks with dependency arrows; the design review sits on the critical path"
      >
        <g className="font-mono" fontSize="9" fill="#8a96b4">
          <text x="40" y="10">2 MAR</text>
          <text x="180" y="10">9 MAR</text>
          <text x="320" y="10">16 MAR</text>
          <text x="460" y="10">23 MAR</text>
        </g>
        <g stroke="#DFE4F0" strokeWidth="1">
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

        <g stroke="#8a96b4" strokeWidth="1.3" fill="none">
          <path d="M136 35.5 H150 V52 h24" />
          <path d="M320 59.5 H334 V76 h20" />
          <path d="M360 83.5 H420 V100 h34" />
        </g>
        <g fill="#8a96b4">
          <polygon points="180,59.5 172,55.5 172,63.5" />
          <polygon points="360,83.5 352,79.5 352,87.5" />
          <polygon points="460,107.5 452,103.5 452,111.5" />
        </g>

        <g className="font-mono" fontSize="9.5" fill="#55638a">
          <text x="144" y="39">Wireframes</text>
          <text x="328" y="63">Content</text>
          <text x="368" y="87">Review</text>
          <text x="564" y="111">Launch</text>
        </g>
        <circle cx="320" cy="59.5" r="4.5" fill="#e2445c" className="motion-safe:animate-pulse" />
      </svg>
    </div>
  );
}

function KanbanMock() {
  const columns = [
    { label: "Not started", color: "#8a96b4", tasks: MOCK_TASKS.filter((t) => t.status === "Not started") },
    { label: "Working on it", color: "#fdab3d", tasks: MOCK_TASKS.filter((t) => t.status === "Working on it") },
    { label: "Stuck", color: "#e2445c", tasks: MOCK_TASKS.filter((t) => t.status === "Stuck") },
    { label: "Done", color: "#00c875", tasks: MOCK_TASKS.filter((t) => t.status === "Done") },
  ];
  return (
    <div className="p-4 grid grid-cols-4 gap-3">
      {columns.map((col) => (
        <div key={col.label}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-gray-500 dark:text-gray-400 whitespace-nowrap">{col.label}</span>
          </div>
          <div className="space-y-2 min-h-[64px] rounded-lg bg-gray-50 dark:bg-black/10 p-2">
            {col.tasks.map((t) => (
              <div key={t.name} className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-lg shadow-sm p-2.5">
                <p className="text-[12.5px] font-semibold leading-snug">{t.name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{t.dates.split(" → ")[1]}</span>
                  <span
                    className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold text-white shrink-0"
                    style={{ background: t.color }}
                  >
                    {t.initials}
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
  const bars = [
    { label: "Content draft", color: "#fdab3d", row: 2, colStart: 2, colSpan: 3 },
    { label: "Design review", color: "#e2445c", row: 3, colStart: 4, colSpan: 3 },
  ];
  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
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
          <div key={bar.label} className="grid grid-cols-7 gap-1">
            <div
              className="h-6 rounded-full flex items-center px-2.5 text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden"
              style={{ gridColumnStart: bar.colStart, gridColumnEnd: `span ${bar.colSpan}`, background: bar.color }}
            >
              {bar.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardMock() {
  const stats = [
    { label: "Done", value: 1, color: "#00c875" },
    { label: "Working on it", value: 1, color: "#fdab3d" },
    { label: "Stuck", value: 1, color: "#e2445c" },
    { label: "Not started", value: 1, color: "#c4c4c4" },
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

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-300 hover:bg-white dark:hover:bg-white/5 hover:border-gray-400 dark:hover:border-slate-400 transition-colors active:scale-[.98]"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export default function LandingPage() {
  const [activeView, setActiveView] = useState<MockView>("gantt");
  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-[#181b34] text-gray-900 dark:text-gray-100">
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
            <a href="#how" className="hover:text-gray-900 dark:hover:text-white transition-colors">How it works</a>
            <a href="#views" className="hover:text-gray-900 dark:hover:text-white transition-colors">Views</a>
            <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</Link>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex items-center justify-center text-[13.5px] font-bold rounded-[10px] px-4 py-2.5 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-white hover:bg-white dark:hover:bg-white/5 hover:border-gray-400 dark:hover:border-slate-400 transition-colors active:scale-[.98]"
            >
              Sign in
            </Link>
            <Link
              href="/login?signup=1"
              className="inline-flex items-center justify-center text-[13.5px] font-bold rounded-[10px] px-4 py-2.5 bg-amber-400 text-[#221704] shadow-[0_1px_2px_rgba(245,166,35,.4)] hover:bg-amber-300 hover:shadow-[0_6px_20px_-6px_rgba(245,166,35,.8)] transition-all active:scale-[.98]"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="max-w-6xl mx-auto px-5 pt-16 pb-10">
        <h1 className="max-w-[22ch] text-[2.1rem] sm:text-5xl lg:text-[3.4rem] leading-[1.08] tracking-[-.03em] font-extrabold text-balance">
          Visual scheduling,
          <br />
          automated tracking,
          <br />
          <span className="bg-[linear-gradient(transparent_66%,rgba(245,166,35,.45)_66%)] dark:bg-[linear-gradient(transparent_66%,rgba(245,166,35,.55)_66%)]">
            zero chaos.
          </span>
        </h1>
        <p className="mt-6 max-w-[56ch] text-[1.05rem] leading-[1.62] font-medium text-gray-600 dark:text-gray-300">
          HostFlow is the ultimate workspace for teams with complex, repeating processes. Switch
          seamlessly between six views, map your critical path, and let smart dependencies
          automatically reschedule your timeline when one date shifts.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/login?signup=1"
            className="inline-flex items-center justify-center text-sm font-bold rounded-[10px] px-6 py-3.5 bg-amber-400 text-[#221704] shadow-[0_1px_2px_rgba(245,166,35,.4)] hover:bg-amber-300 hover:shadow-[0_6px_20px_-6px_rgba(245,166,35,.8)] transition-all active:scale-[.98]"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center text-sm font-bold rounded-[10px] px-6 py-3.5 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-white hover:bg-white dark:hover:bg-white/5 hover:border-gray-400 dark:hover:border-slate-400 transition-colors active:scale-[.98]"
          >
            Sign in
          </Link>
        </div>

        {/* ---- product frame ---- */}
        <div className="mt-12 flex bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-[14px] shadow-[0_2px_4px_rgba(26,44,91,.06),0_32px_64px_-24px_rgba(26,44,91,.32)] dark:shadow-[0_2px_4px_rgba(0,0,0,.3),0_32px_64px_-24px_rgba(0,0,0,.6)] overflow-hidden">
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

          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="min-w-[660px]">
              <div className="h-12 border-b border-gray-200 dark:border-slate-700/60 flex items-center gap-3.5 px-4">
                <span className="font-bold text-sm tracking-[-.01em]">Website Relaunch</span>
                <div role="tablist" aria-label="Board view" className="flex gap-0.5 ml-auto">
                  {MOCK_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={activeView === tab.key}
                      onClick={() => setActiveView(tab.key)}
                      className={`text-[12.5px] px-2.5 py-1.5 rounded-[7px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2 ${
                        activeView === tab.key
                          ? "font-bold text-[#1A2C5B] bg-[#cce5ff] dark:text-[#cfe0ff] dark:bg-blue-900/30"
                          : "font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

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
            </div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-14">
        <div className="max-w-[60ch]">
          <h2 className="text-[1.6rem] sm:text-[2.15rem] tracking-[-.03em] font-extrabold leading-[1.14]">
            Built for the same plan, run again and again.
          </h2>
          <p className="mt-3.5 text-base leading-[1.6] font-medium text-gray-600 dark:text-gray-300">
            Whatever the work &mdash; a launch, a build, a client project &mdash; it runs through the same
            phases each time. HostFlow is built around that repetition: the schedule knows its own
            logic, and the interface meets each person in their own language.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-13 items-center pt-11">
          <div>
            <p className="font-mono text-[11px] tracking-[.14em] font-bold text-amber-500">CRITICAL PATH</p>
            <h3 className="mt-3 text-[1.4rem] tracking-[-.025em] font-extrabold">Scheduling that means something</h3>
            <p className="mt-3 text-[15px] leading-[1.65] font-medium text-gray-600 dark:text-gray-300">
              A forward and backward pass over the dependency graph: earliest and latest start and
              finish, total float, and the critical path highlighted. Finish-to-start, start-to-start
              and finish-to-finish links with lag &mdash; crossing boards and workspaces. Cycles are
              reported, never silently absorbed.
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-xl shadow-[0_1px_2px_rgba(26,44,91,.06),0_12px_32px_-12px_rgba(26,44,91,.18)] p-4">
            <svg viewBox="0 0 300 108" width="100%" role="img" aria-label="Three linked bars where moving the first pushes the two that follow it">
              <rect x="8" y="16" width="72" height="13" rx="6.5" fill="#579bfc" />
              <rect x="96" y="44" width="86" height="13" rx="6.5" fill="#F5A623" />
              <rect x="198" y="72" width="66" height="13" rx="6.5" fill="#F5A623" />
              <g stroke="#8a96b4" strokeWidth="1.2" fill="none">
                <path d="M80 22.5 H88 V44 h4" />
                <path d="M182 50.5 H190 V72 h4" />
              </g>
              <g fill="#8a96b4">
                <polygon points="96,50.5 88,46.5 88,54.5" />
                <polygon points="198,78.5 190,74.5 190,82.5" />
              </g>
              <g className="font-mono" fontSize="8" fill="#8a96b4">
                <text x="8" y="12">FLOAT 3d</text>
                <text x="96" y="40">FLOAT 0d</text>
                <text x="198" y="68">FLOAT 0d</text>
              </g>
            </svg>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-13 items-center pt-11 mt-11 border-t border-gray-100 dark:border-slate-700/30">
          <div>
            <p className="font-mono text-[11px] tracking-[.14em] font-bold text-amber-500">EN / FR</p>
            <h3 className="mt-3 text-[1.4rem] tracking-[-.025em] font-extrabold">Bilingual, per reader</h3>
            <p className="mt-3 text-[15px] leading-[1.65] font-medium text-gray-600 dark:text-gray-300">
              The interface, status labels, dates and notifications render in the language of whoever
              is reading them &mdash; including a notification written by a colleague in the other
              language. What a user typed is never translated: task names, groups, people and a
              board&rsquo;s own vocabulary stay exactly as entered.
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-xl shadow-[0_1px_2px_rgba(26,44,91,.06),0_12px_32px_-12px_rgba(26,44,91,.18)] p-4">
            <div className="flex items-center gap-2.5 text-[12.5px] px-2.5 py-2 rounded-lg bg-[#cce5ff] dark:bg-blue-900/30">
              <span className="font-mono text-[11px] font-bold tracking-[.06em] text-gray-400 dark:text-gray-500 w-[26px] shrink-0">EN</span>
              <span>Due date &mdash; <span className="font-bold">Design review</span></span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5 text-[12.5px] px-2.5 py-2 rounded-lg bg-amber-400/15">
              <span className="font-mono text-[11px] font-bold tracking-[.06em] text-gray-400 dark:text-gray-500 w-[26px] shrink-0">FR</span>
              <span>Date d&rsquo;&eacute;ch&eacute;ance &mdash; <span className="font-bold">Design review</span></span>
            </div>
            <p className="mt-3 text-[11.5px] font-semibold text-gray-400 dark:text-gray-500">
              The label translates. The task name never does.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 md:gap-13 items-center pt-11 mt-11 border-t border-gray-100 dark:border-slate-700/30">
          <div>
            <p className="font-mono text-[11px] tracking-[.14em] font-bold text-amber-500">SEARCH</p>
            <h3 className="mt-3 text-[1.4rem] tracking-[-.025em] font-extrabold">Search that knows where things live</h3>
            <p className="mt-3 text-[15px] leading-[1.65] font-medium text-gray-600 dark:text-gray-300">
              One shortcut searches tasks, boards and comment bodies across every workspace you can
              reach, and each result carries its full path. Two boards both have a &ldquo;Design
              review&rdquo; &mdash; the breadcrumb is what tells them apart.
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e2140] border border-gray-200 dark:border-slate-700/60 rounded-xl shadow-[0_1px_2px_rgba(26,44,91,.06),0_12px_32px_-12px_rgba(26,44,91,.18)] p-4">
            <div className="px-3 py-2.5 rounded-[9px] border border-[#579bfc] bg-[#cce5ff] dark:bg-blue-900/30">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">
                Product <span>&rsaquo;</span> <b className="text-gray-900 dark:text-white font-bold">Website Relaunch</b>
              </div>
              <div className="mt-1 font-bold text-[13.5px]">Design review</div>
            </div>
            <div className="mt-2 px-3 py-2.5 rounded-[9px] border border-gray-100 dark:border-slate-700/40">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">
                Marketing <span>&rsaquo;</span> <b className="text-gray-900 dark:text-white font-bold">Spring Campaign</b>
              </div>
              <div className="mt-1 font-bold text-[13.5px]">Design review</div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= VIEWS + EXTRAS ================= */}
      <section id="views" className="max-w-6xl mx-auto px-5 pb-14">
        <div className="max-w-[60ch]">
          <h2 className="text-[1.6rem] sm:text-[2.15rem] tracking-[-.03em] font-extrabold leading-[1.14]">
            Six views. One set of tasks.
          </h2>
          <p className="mt-3.5 text-base leading-[1.6] font-medium text-gray-600 dark:text-gray-300">
            Switching view changes what you can see, never what is stored &mdash; a date moved on the
            chart is the same edit as a date typed in a cell.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          {["Table", "Kanban", "Dashboard", "Calendar", "Gantt", "Cards"].map((v) => (
            <span
              key={v}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-[#1e2140]"
            >
              {v}
            </span>
          ))}
        </div>

        <p className="font-mono text-[11px] tracking-[.14em] font-bold text-gray-400 dark:text-gray-500 mt-11">ALSO IN THE BOX</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            "14 typed columns",
            "Automations",
            "Email, Telegram & daily digest",
            "CSV, Excel & Monday.com import",
            "Row-level permissions",
            "Trash, restore & activity log",
            "Baselines & chart export",
          ].map((v) => (
            <span
              key={v}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-[#1e2140]"
            >
              {v}
            </span>
          ))}
        </div>
      </section>

      {/* ================= CLOSE ================= */}
      <section className="max-w-6xl mx-auto px-5 pb-6">
        <div className="rounded-[18px] px-8 py-14 text-center bg-[#1A2C5B] text-white">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-.03em]">
            Put your next project on a plan that holds.
          </h2>
          <p className="mt-3.5 text-base font-medium text-white/70">Invite your team once you&rsquo;re in.</p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Link
              href="/login?signup=1"
              className="inline-flex items-center justify-center text-sm font-bold rounded-[10px] px-6 py-3.5 bg-amber-400 text-[#221704] shadow-[0_1px_2px_rgba(245,166,35,.4)] hover:bg-amber-300 hover:shadow-[0_6px_20px_-6px_rgba(245,166,35,.8)] transition-all active:scale-[.98]"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center text-sm font-bold rounded-[10px] px-6 py-3.5 bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors active:scale-[.98]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="max-w-6xl mx-auto px-5 py-7 border-t border-gray-200/80 dark:border-slate-700/50">
        <div className="flex flex-wrap items-center justify-between gap-4 text-[13px] font-semibold text-gray-400 dark:text-gray-500">
          <span>&copy; {new Date().getFullYear()} HostFlow</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-gray-900 dark:hover:text-white transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
