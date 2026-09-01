import { readFileSync } from "fs";
import type { Page } from "@playwright/test";

import { join } from "path";

export interface Fixture {
  workspaceName: string;
  boardId: string;
  boardName: string;
  groupId: string;
  columns: { timeline: string; status: string; dependency: string };
  items: { id: string; name: string; values: Record<string, unknown> }[];
  links: string[];
}

/** Written by `node e2e-gantt/seed.js e2e-gantt/.fixture.json`. */
export const fixture: Fixture = JSON.parse(
  readFileSync(join(__dirname, ".fixture.json"), "utf-8")
);

const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

/** Reads straight from the database, to check what the UI actually persisted. */
export async function db(path: string) {
  const auth = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  const { access_token } = await auth.json();
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${access_token}`,
    },
  });
  return r.json();
}

/** Where the shared signed-in session is cached, relative to this folder. */
export const AUTH_FILE = ".auth.json";

export async function login(page: Page) {
  await page.goto("/login");
  if (page.url().includes("/login")) {
    await page.locator('input[type="email"]').fill(env.E2E_EMAIL);
    await page.locator('input[type="password"]').fill(env.E2E_PASSWORD);
    await page.locator('button[type="submit"]').click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

/**
 * Opens the seeded board.
 *
 * Idempotent: a test that navigates twice finds the workspace already chosen
 * the second time, so the switcher is only opened when it is actually showing
 * "All workspaces".
 */
export async function openBoard(page: Page) {
  await login(page);

  const boardLink = page.getByText(fixture.boardName, { exact: true }).first();

  // The app opens on My Work with every workspace selected, so the board list is
  // empty until one is chosen. A plain isVisible() check raced the sidebar's
  // first render: on a slow load it read false, the switch was skipped, and the
  // test then waited out its timeout on a board link that was never coming.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await boardLink.isVisible().catch(() => false)) break;

    const switcher = page.getByText("All workspaces", { exact: true }).first();
    if (await switcher.isVisible().catch(() => false)) {
      await switcher.click();
      await page.getByText(fixture.workspaceName, { exact: true }).first().click();
    }
    await page.waitForTimeout(1000);
  }

  await boardLink.waitFor({ state: "visible", timeout: 30_000 });
  await boardLink.click();
  await page.getByText(fixture.items[0].name, { exact: true }).first().waitFor({ timeout: 30_000 });
}

/**
 * Opens the seeded board and switches to its Gantt.
 *
 * Waits on real signals rather than fixed sleeps: the dev server recompiles
 * between runs, and a timeout long enough on a warm server is not long enough
 * on a cold one.
 */
export async function openGantt(page: Page) {
  await openBoard(page);

  const ganttTab = page.getByRole("button", { name: /^Gantt$/i }).first();
  await ganttTab.waitFor({ state: "visible", timeout: 30_000 });
  await ganttTab.click();

  // The toolbar means the chart itself has mounted, and the first bar means it
  // has data - both are needed before a test can measure anything.
  await page.getByRole("button", { name: "Today" }).waitFor({ timeout: 30_000 });
  await page
    .getByRole("button", { name: new RegExp(`^(Milestone: )?${fixture.items[0].name},`) })
    .first()
    .waitFor({ timeout: 30_000 });
}

/**
 * A task bar by name.
 *
 * A one-day task is drawn as a milestone diamond, which is labelled
 * "Milestone: <name>, ..." rather than "<name>, ..." - so both forms match.
 */
export const bar = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^(Milestone: )?${name},`) }).first();

export const timelineOf = (item: { values: Record<string, unknown> }) =>
  item.values[fixture.columns.timeline] as { start: string; end: string };

/**
 * Puts the seeded tasks back to the dates they were created with.
 *
 * The mutating tests move these tasks, so without a reset each run starts from
 * the last run's result: the bars drift right until they leave the viewport and
 * a drag silently does nothing. Only touches items this run created.
 */
export async function resetFixtureDates() {
  const auth = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  const { access_token } = await auth.json();

  for (const item of fixture.items) {
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/items?id=eq.${item.id}`, {
      method: "PATCH",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ column_values: item.values }),
    });
  }
}

/**
 * Adds a task to the scratch board.
 *
 * The link test needs a pair nothing is linked to yet: a second run would
 * otherwise be refused as a duplicate, and removing the first run's link is not
 * something these tests are allowed to do.
 */
export async function createTask(name: string, startOffsetDays: number, days: number) {
  const auth = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  const { access_token } = await auth.json();

  const base = new Date();
  base.setDate(base.getDate() + 14 + startOffsetDays);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days - 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/items`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      name,
      group_id: fixture.groupId,
      board_id: fixture.boardId,
      position: 90,
      column_values: { [fixture.columns.timeline]: { start: iso(base), end: iso(end) } },
    }),
  });
  const [item] = await r.json();
  return item as { id: string; name: string };
}
