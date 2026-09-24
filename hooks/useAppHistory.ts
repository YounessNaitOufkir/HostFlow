import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Browser Back/Forward for an app with no routes.
 *
 * Everything lives at "/", and moving between boards, views and workspaces is
 * only state — so the browser had no history entries inside HostFlow, and
 * Back left the site entirely. Each location change now pushes an entry
 * (same URL, location in history.state), and popstate puts the app back.
 * Browser buttons, Alt+Left/Right, mouse side buttons and the in-app buttons
 * all go through the same stack.
 */

export interface AppLocation {
  boardId: string | null;
  workspaceId: string | null;
  mainView: string;
}

interface Entry extends AppLocation {
  idx: number;
  key: string;
}

// With a board open the workspace is derived from it, so it isn't part of
// the key; otherwise the workspace-sync effect would look like a second move.
const keyOf = (loc: AppLocation) =>
  loc.boardId ? `b:${loc.boardId}|${loc.mainView}` : `w:${loc.workspaceId ?? ""}|${loc.mainView}`;

const MAX_KEY = "hostflow_history_max";
function readMax(): number {
  try {
    return Number(sessionStorage.getItem(MAX_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeMax(n: number) {
  try {
    sessionStorage.setItem(MAX_KEY, String(n));
  } catch {
    // Storage blocked: Forward just can't be known across a reload.
  }
}

// Position in the stack, as an external store so the buttons can render it
// without setState inside effects.
let snapshot = { idx: 0, max: 0 };
const SERVER_SNAPSHOT = { idx: 0, max: 0 };
const listeners = new Set<() => void>();
function setSnapshot(idx: number, max: number) {
  snapshot = { idx, max };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function writeEntry(method: "pushState" | "replaceState", entry: Entry) {
  // Spread the existing state so Next.js keeps its own router data.
  const base = method === "replaceState" ? window.history.state ?? {} : {};
  window.history[method]({ ...base, hf: entry }, "", window.location.href);
}

export function useAppHistory({
  ready,
  location,
  apply,
}: {
  ready: boolean;
  location: AppLocation;
  apply: (loc: AppLocation) => void;
}) {
  const key = keyOf(location);
  const idxRef = useRef<number | null>(null);
  const currentKeyRef = useRef<string | null>(null);
  // Set by popstate: the next location change is the app catching up to the
  // entry the user went to, not a new move to record. A timestamp, not a
  // boolean: if applying changes nothing (a vanished board falling back to
  // the page already shown), no change arrives to clear it, and a boolean
  // would swallow the user's next real move.
  const applyingSinceRef = useRef(0);
  const locationRef = useRef(location);
  const applyRef = useRef(apply);
  useEffect(() => {
    locationRef.current = location;
    applyRef.current = apply;
  });

  useEffect(() => {
    if (!ready) return;
    const loc = locationRef.current;

    if (idxRef.current === null) {
      // First settle after load (or reload): adopt the entry we're on.
      const existing = window.history.state?.hf as Entry | undefined;
      const idx = typeof existing?.idx === "number" ? existing.idx : 0;
      const max = Math.max(idx, readMax());
      idxRef.current = idx;
      currentKeyRef.current = key;
      writeEntry("replaceState", { ...loc, idx, key });
      writeMax(max);
      setSnapshot(idx, max);
      return;
    }

    if (Date.now() - applyingSinceRef.current < 1000) {
      applyingSinceRef.current = 0;
      // Record where we actually ended up (a board that's gone falls back to
      // Overview), so this entry doesn't point at nothing next time.
      currentKeyRef.current = key;
      writeEntry("replaceState", { ...loc, idx: idxRef.current, key });
      return;
    }

    if (key === currentKeyRef.current) return;

    const idx = idxRef.current + 1;
    idxRef.current = idx;
    currentKeyRef.current = key;
    writeEntry("pushState", { ...loc, idx, key });
    writeMax(idx);
    setSnapshot(idx, idx);
  }, [ready, key]);

  useEffect(() => {
    if (!ready) return;
    const onPop = (e: PopStateEvent) => {
      const entry = e.state?.hf as Entry | undefined;
      if (!entry) return;
      idxRef.current = entry.idx;
      setSnapshot(entry.idx, Math.max(entry.idx, readMax()));
      if (entry.key === currentKeyRef.current) return;
      applyingSinceRef.current = Date.now();
      applyRef.current(entry);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ready]);

  const position = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  const goBack = useCallback(() => window.history.back(), []);
  const goForward = useCallback(() => window.history.forward(), []);

  return {
    canGoBack: ready && position.idx > 0,
    canGoForward: ready && position.idx < position.max,
    goBack,
    goForward,
  };
}
