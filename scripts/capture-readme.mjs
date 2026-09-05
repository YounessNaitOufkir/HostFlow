/**
 * Drives a real browser through the demo tenant and writes the images the
 * README shows.
 *
 *   node scripts/seed-demo.mjs        # first: put the demo data in place
 *   npm run dev                       # second: a server on :3000
 *   node scripts/capture-readme.mjs   # third: this
 *   node scripts/seed-demo.mjs --clean
 *
 * Stills are PNG. Motion is captured as a run of PNG frames and written twice:
 * an animated WebP, which every current browser plays and which is roughly a
 * tenth the size of the equivalent GIF, and a single PNG for anything that
 * cannot. The README pairs them in a <picture>, so a reader either sees the
 * animation or a sharp still — never a broken image.
 *
 * Every capture is independent: one that fails is reported and skipped rather
 * than taking the run down, because a selector that has moved should cost one
 * image, not all of them.
 */

import { mkdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const OUT = join(root, "docs", "assets");

const DEMO_EMAIL = "salma@demo.hostflow.test";
const DEMO_PASSWORD = "hostflow-demo-2f8c41";
const BASE = process.env.CAPTURE_URL || "http://localhost:3000";

const WORKSPACE = "Atelier Zellige";
const BOARD = "Résidence Anfa · Fit-out";

/** Wide enough to read when a README scales it down, short enough not to dominate the page. */
const VIEWPORT = { width: 1440, height: 900 };

/** Sizes for the captures that need something other than the laptop viewport. */
const SIZES = {
  banner: { width: 1280, height: 400 },
};

/**
 * Captures that need neither an account nor the demo tenant. The banner is
 * drawn from a local file, so it is the one image on the page that can be
 * re-shot on a clean checkout with no database at all.
 */
const PUBLIC = new Set(["banner"]);

/**
 * How fast frames are taken, and how fast they are played back.
 *
 * These are deliberately different numbers. Capturing quickly keeps the motion
 * smooth; playing back slowly gives a reader time to actually read a column
 * header before the view changes under them. Playback at a little over twice
 * the capture interval is the point where these clips stop feeling hurried.
 */
const CAPTURE_FPS = 8;
const CAPTURE_MS = Math.round(1000 / CAPTURE_FPS);
const PLAYBACK_MS = 240;

/**
 * Stills are taken at 2× so they stay sharp when a reader opens one full size.
 * Clips are not: a retina screenshot of this viewport takes about 440ms, which
 * caps the capture at barely two frames a second and makes every movement
 * stutter. They are shown 1000px wide, so 1× is all they ever needed.
 */
const RETINA = new Set(["dashboard", "calendar", "master"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Puts the demo account back into a chosen language.
 *
 * The bilingual capture changes it, and the language is stored on the profile,
 * so it outlives the browser context and the capture that runs next meets a
 * sidebar in the wrong language. Clicking English back through the panel is not
 * reliable — the modal has already begun closing — so this writes the profile
 * directly. Same credentials the seeder uses, and it touches only that account.
 */
async function setDemoLanguage(locale) {
  const env = Object.fromEntries(
    readFileSync(join(root, ".env.local"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(DEMO_EMAIL)}`,
    {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ language: locale }),
    }
  );
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const wanted = (name) => only.length === 0 || only.includes(name);

const made = [];
const skipped = [];

// ── output ──────────────────────────────────────────────────────────────────

const kbOf = (file) => {
  try {
    return Math.round(statSync(join(OUT, file)).size / 1024);
  } catch {
    return 0;
  }
};

async function writeStill(name, buffer, width = 1280) {
  await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, `${name}.png`));
  made.push(`${name}.png (${kbOf(`${name}.png`)} KB)`);
}

/**
 * Writes a run of frames as an animation plus a poster.
 *
 * sharp joins the frames into one tall image and tags it as animated, which is
 * the same representation libvips uses when it reads a GIF, so the encoders
 * take it directly.
 */
async function writeClip(name, frames, width = 1000, delay = PLAYBACK_MS, posterAt = 1) {
  if (frames.length < 2) throw new Error(`only ${frames.length} frame(s)`);

  const scaled = await Promise.all(
    frames.map((f) => sharp(f).resize({ width, withoutEnlargement: true }).png().toBuffer())
  );
  const { height } = await sharp(scaled[0]).metadata();

  await sharp(scaled, { join: { across: 1, animated: true } })
    .webp({ quality: 72, effort: 5, loop: 0, delay, pageHeight: height })
    .toFile(join(OUT, `${name}.webp`));

  // The poster defaults to the last frame: a clip ends on the thing it set out
  // to show, so that is usually the frame worth freezing. A looping clip has no
  // such ending, and passes the fraction of the cycle that shows the most.
  const poster = scaled[Math.min(scaled.length - 1, Math.round(posterAt * (scaled.length - 1)))];
  await sharp(poster).png({ compressionLevel: 9 }).toFile(join(OUT, `${name}.png`));

  made.push(
    `${name}.webp (${frames.length} frames, ${kbOf(`${name}.webp`)} KB) + ${name}.png (${kbOf(`${name}.png`)} KB)`
  );
}

/** Grabs frames on a timer while `script` drives the page. */
async function record(page, script, { clip, fps } = {}) {
  const every = fps ? Math.round(1000 / fps) : CAPTURE_MS;
  const frames = [];
  let running = true;
  const grabber = (async () => {
    while (running) {
      const started = Date.now();
      try {
        frames.push(await page.screenshot({ clip, animations: "allow" }));
      } catch {
        /* a screenshot during a navigation can throw; drop that frame */
      }
      const spent = Date.now() - started;
      if (spent < every) await sleep(every - spent);
    }
  })();
  try {
    await script();
  } finally {
    running = false;
    await grabber;
  }
  return frames;
}

// ── navigation ──────────────────────────────────────────────────────────────

/**
 * Signs in, retrying once. The dev server recompiles a route on first hit, and
 * a cold compile can outlast the first attempt without anything being wrong.
 */
async function login(page, attempt = 0) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.locator('input[type="email"]').fill(DEMO_EMAIL);
    await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
    await page.locator('button[type="submit"]').click();
  }
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  } catch (e) {
    if (attempt >= 1) throw e;
    return login(page, attempt + 1);
  }
  await page.waitForLoadState("networkidle");
}

/**
 * Chooses the demo workspace.
 *
 * The app opens on My Work with every workspace selected, and the board list
 * stays empty until one is picked. Retried rather than waited on: on a cold
 * dev server the sidebar's first render can arrive after the switcher has
 * already been looked for once.
 */
async function selectWorkspace(page, until) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await until.isVisible().catch(() => false)) return;

    // Either language: the account's own setting is what decides, and a capture
    // that ran before this one may have left it mid-change.
    const switcher = page
      .getByText(/^(All workspaces|Tous les espaces)$/)
      .first();
    if (await switcher.isVisible().catch(() => false)) {
      await switcher.click();
      // Wait for the menu rather than guessing at how long it takes to open:
      // clicking into a menu that has not appeared lands on the sidebar behind it.
      const option = page.getByText(WORKSPACE, { exact: true }).first();
      await option.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      await option.click().catch(() => {});
    }
    await sleep(1500);
  }
  await until.waitFor({ state: "visible", timeout: 45_000 });
}

async function openBoard(page, boardName = BOARD) {
  const link = page.getByText(boardName, { exact: true }).first();
  await selectWorkspace(page, link);
  await link.waitFor({ state: "visible", timeout: 45_000 });
  await link.click();
  await page.getByText("Measured survey", { exact: true }).first().waitFor({ timeout: 45_000 });
  await sleep(700);
}

const tab = (page, name) => page.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).first();

async function view(page, name, settle = 1400) {
  await tab(page, name).click();
  await sleep(settle);
}

/**
 * Removes what belongs to the development server rather than to the product:
 * the Next.js dev-tools badge, which sits in the bottom-left corner of every
 * page and would otherwise appear in every README image. Also stops the caret
 * from freezing mid-blink inside a focused field.
 */
/** The panel has a Done button and does not answer Escape; its label follows the language just set. */
async function closeReadability(page) {
  const done = page.getByRole("button", { name: /^(Done|Terminé)$/ }).last();
  if (await done.isVisible().catch(() => false)) {
    await done.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await sleep(900);
}

async function calmDown(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
      *, *::before, *::after { caret-color: transparent !important; }
      /* A synthetic pointer press can leave a blue text selection across a card. */
      * { user-select: none !important; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
    `,
  });
}

// ── the captures ────────────────────────────────────────────────────────────

const CAPTURES = {
  /**
   * The README's opening image: docs/banner.html, which is the sign-in panel's
   * artwork re-laid-out wide.
   *
   * Its cycle is 13s and every stream duration divides that, so capturing one
   * whole cycle and playing it back at real time gives a seamless loop. Local
   * file, no server and no data — the reason this one is worth having as a page
   * of its own rather than a crop of the sign-in screenshot.
   */
  async banner(page) {
    await page.goto(pathToFileURL(join(root, "docs", "banner.html")).href, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);

    const CYCLE_MS = 13_000;
    const FPS = 6;
    const frames = await record(page, () => sleep(CYCLE_MS), { fps: FPS });
    // One cycle spread over exactly one cycle: real time, and it meets itself.
    // The poster is taken from the middle of the unfolded hold (33-72% of the
    // cycle), because a still of the compact mark says far less than the plan.
    await writeClip("banner", frames, 1280, Math.round(CYCLE_MS / frames.length), 0.55);
  },

  /** One board, every view, in the order a reader would try them. */
  async views(page) {
    await openBoard(page);
    await view(page, "Main Table");
    const frames = await record(page, async () => {
      await sleep(900);
      for (const name of ["Kanban", "Gantt", "Calendar", "Dashboard", "Main Table"]) {
        await view(page, name, 1500);
      }
    });
    await writeClip("views", frames);
  },

  /**
   * The Gantt: the whole plan fitted to the window, then the critical path lit.
   * Driven through toolbar controls rather than by pointing at a named bar,
   * because a bar's position depends on the zoom the board happens to open at.
   */
  async gantt(page) {
    await openBoard(page);
    await view(page, "Gantt", 3000);
    const frames = await record(page, async () => {
      await sleep(900);
      const fit = page.getByRole("button", { name: "Fit" }).first();
      if (await fit.isVisible().catch(() => false)) {
        await fit.click();
        await sleep(1800);
      }
      const viewMenu = page.getByRole("button", { name: /^View$/ }).first();
      if (await viewMenu.isVisible().catch(() => false)) {
        await viewMenu.click();
        await sleep(900);
        const critical = page.getByText("Critical path", { exact: true }).first();
        if (await critical.isVisible().catch(() => false)) {
          await critical.click();
          await sleep(1200);
        }
        await page.keyboard.press("Escape");
      }
      await sleep(2000);
    });
    await writeClip("gantt", frames);
  },

  /**
   * Kanban, moving a finished task into Done.
   *
   * Driven through the drag library's own keyboard interface — focus the card,
   * space to lift, an arrow to change column, space to drop. A synthetic mouse
   * drag is unreliable against this library and, when it fails, it selects the
   * card's text instead, which then shows up highlighted in the capture.
   */
  async kanban(page) {
    await openBoard(page);
    await view(page, "Kanban", 2200);

    const card = page
      .locator("[data-rfd-drag-handle-draggable-id]", { hasText: "First fix plumbing" })
      .first();
    await card.waitFor({ state: "visible", timeout: 20_000 });

    const move = async (direction) => {
      await card.focus();
      await sleep(400);
      await page.keyboard.press("Space");
      await sleep(700);
      await page.keyboard.press(direction);
      await sleep(800);
      await page.keyboard.press("Space");
      await sleep(1200);
    };

    const frames = await record(page, async () => {
      await sleep(800);
      await move("ArrowLeft");
      await sleep(1400);
    });
    await writeClip("kanban", frames);

    // Put the board back, off camera: the move wrote a new status, and every
    // other capture assumes the board it was seeded as.
    await move("ArrowRight");
  },

  /** Search across every board, including the comment bodies. */
  async search(page) {
    await openBoard(page);
    await view(page, "Main Table");
    const frames = await record(page, async () => {
      await sleep(700);
      await page.keyboard.press("Control+k");
      await sleep(1100);
      for (const ch of "joinery") {
        await page.keyboard.type(ch);
        await sleep(130);
      }
      await sleep(2400);
    });
    await writeClip("search", frames);
  },

  /** The same board read in the other language. */
  async bilingual(page) {
    await openBoard(page);
    await view(page, "Main Table", 1600);
    const before = await page.screenshot();

    // The app opens this panel from its own custom event, which is a far steadier
    // handle than walking the avatar menu.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("open-readability")));
    await sleep(1400);

    const french = page.getByText("Français", { exact: true }).first();
    await french.waitFor({ state: "visible", timeout: 15_000 });
    await french.click();
    await sleep(1200);
    await closeReadability(page);

    await sleep(2600);
    const after = await page.screenshot();

    // Two states, each held long enough to read. A cross-fade would only blur
    // the words that changed, which are the entire point of the clip. Repeating
    // a frame costs almost nothing: WebP stores the duplicates as no change.
    const hold = (buf, n) => Array.from({ length: n }, () => buf);
    await writeClip("bilingual", [...hold(before, 9), ...hold(after, 13)]);

    await setDemoLanguage("en");
  },

  /** Where the work sits and who holds it. */
  async dashboard(page) {
    await openBoard(page);
    await view(page, "Dashboard", 3000);
    await writeStill("dashboard", await page.screenshot());
  },

  /** The calendar, for the month view. */
  async calendar(page) {
    await openBoard(page);
    await view(page, "Calendar", 2400);
    await writeStill("calendar", await page.screenshot());
  },

  /**
   * Both fit-outs on one chart. A workspace-level view, so it does not need a
   * board opened first — only the workspace chosen.
   */
  async master(page) {
    // The board picker is remembered collapsed, so set that before opening
    // rather than hunting for its toggle: the chart then has the full width.
    await page.evaluate(() => localStorage.setItem("hostflow_master_gantt_panel_collapsed", "true"));

    const link = page.getByText(/Master Gantt/i).first();
    await selectWorkspace(page, link);
    await link.waitFor({ state: "visible", timeout: 45_000 });
    await link.click();
    await sleep(3500);

    // It opens at day zoom, where a two-month portfolio is all empty grid.
    for (const control of ["Month", "Fit"]) {
      const button = page.getByRole("button", { name: new RegExp(`^${control}$`) }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await sleep(1600);
      }
    }
    await writeStill("master-gantt", await page.screenshot());
  },
};

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  // Self-healing: an interrupted earlier run may have left the account French.
  await setDemoLanguage("en");

  const browser = await chromium.launch();

  // A context per capture: each one starts from a clean signed-in state, so a
  // capture that leaves a menu open or a language switched cannot reach the next.
  for (const [name, run] of Object.entries(CAPTURES)) {
    if (!wanted(name)) continue;
    const context = await browser.newContext({
      viewport: SIZES[name] || VIEWPORT,
      deviceScaleFactor: RETINA.has(name) ? 2 : 1,
      colorScheme: "light",
      locale: "en-GB",
      timezoneId: "Europe/Paris",
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    try {
      if (!PUBLIC.has(name)) {
        await login(page);
        await calmDown(page);
      }
      await run(page);
      console.log(`  ok   ${name}`);
    } catch (e) {
      skipped.push(`${name}: ${String(e.message).split("\n")[0].slice(0, 140)}`);
      console.log(`  SKIP ${name} — ${String(e.message).split("\n")[0].slice(0, 120)}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();

  console.log(`\nWrote ${made.length} file(s) to docs/assets:`);
  for (const m of made) console.log(`  · ${m}`);
  if (skipped.length) {
    console.log(`\n${skipped.length} capture(s) skipped:`);
    for (const s of skipped) console.log(`  · ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
