import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * An audit of the Gantt against a network whose answer was worked out before
 * the chart drew it (see audit-seed.js). Every task here was created by that
 * seed; nothing pre-existing is touched.
 */

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, ".audit.json"), "utf-8")
) as {
  boards: Record<"a" | "b" | "c", { id: string; name: string }>;
  workspaces: { test: { name: string }; other: { name: string } };
  items: Record<string, { id: string }>;
  links: Record<string, string>;
  expected: {
    criticalNames: string[];
    brokenLinkCount: number;
    brokenLinkTarget: string;
    milestone: string;
    floatingNames: string[];
  };
};

/**
 * Opens one of the audit boards, the way the existing helper does.
 *
 * The app lands on My Work with every workspace selected, so the sidebar's
 * board list is empty until a workspace is picked. An exact text match is what
 * separates the sidebar entry from My Work's "Test > ZZ Audit A" group heading,
 * which contains the same name inside a longer string.
 */
async function openAuditBoard(page: Page, workspace: string, board: string) {
  await page.goto("/");
  await page.waitForTimeout(2500);

  const entry = page.getByText(board, { exact: true }).first();

  for (let attempt = 0; attempt < 5; attempt++) {
    if (await entry.isVisible().catch(() => false)) break;
    const switcher = page.getByText("All workspaces", { exact: true }).first();
    if (await switcher.isVisible().catch(() => false)) {
      await switcher.click();
      await page.waitForTimeout(400);
      await page.getByText(workspace, { exact: true }).first().click().catch(() => {});
    }
    await page.waitForTimeout(1200);
  }

  await entry.waitFor({ state: "visible", timeout: 30_000 });
  await entry.click();
  await page.waitForTimeout(2500);
}

async function openGantt(page: Page) {
  await page.getByRole("button", { name: /^Gantt$/ }).first().click();
  await page.waitForTimeout(2500);
}

/** A bar's left edge and width in px, read off the element the chart drew. */
async function barBox(page: Page, name: string) {
  const bar = page.getByRole("button", { name: new RegExp(`^(Milestone: )?${name},`) }).first();
  return bar.evaluate((el) => ({
    left: parseFloat((el as HTMLElement).style.left),
    width: parseFloat((el as HTMLElement).style.width),
    background: getComputedStyle(el).backgroundColor,
  }));
}

/**
 * The arrowhead's tip should touch the bar, not overlap it, so every path stops
 * two pixels short of its target. Accounted for rather than asserted around.
 */
const ARROWHEAD_INSET = 2;

/** The first and last x of one arrow's path. */
async function arrowEnds(page: Page, linkId: string) {
  const g = page.locator(`g[data-dependency-id="${linkId}"]`);
  const d = await g.locator("path[marker-end]").getAttribute("d");
  if (!d) throw new Error(`no path for link ${linkId}`);
  const nums = d.match(/-?[\d.]+/g)!.map(Number);
  return { startX: nums[0], endX: nums[nums.length - 2] };
}

test.describe("Gantt audit", () => {
  test("arrows land on the edges each dependency type names", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);

    // Arrows are routed only for the slice on screen, so the whole chart has to
    // be on screen before every link can be checked. Fit does that.
    await page.getByRole("button", { name: /^Fit/ }).click();
    await page.waitForTimeout(900);

    const A = await barBox(page, "A Permis");
    const B = await barBox(page, "B Devis");
    const C = await barBox(page, "C Travaux");
    const D = await barBox(page, "D Finitions");
    const E = await barBox(page, "E Livraison");
    const F = await barBox(page, "F Nettoyage");
    const G = await barBox(page, "G Suivi");

    // FS: leaves the source's finish, lands on the target's start.
    const ab = await arrowEnds(page, fixture.links.ab);
    expect(ab.startX).toBeCloseTo(A.left + A.width, 0);
    expect(ab.endX).toBeCloseTo(B.left - ARROWHEAD_INSET, 0);

    // SS: leaves the source's start, lands on the target's start.
    const cg = await arrowEnds(page, fixture.links.cg);
    expect(cg.startX).toBeCloseTo(C.left, 0);
    expect(cg.endX).toBeCloseTo(G.left - ARROWHEAD_INSET, 0);

    // FF: leaves the source's finish, lands on the target's finish.
    const df = await arrowEnds(page, fixture.links.df);
    expect(df.startX).toBeCloseTo(D.left + D.width, 0);
    expect(df.endX).toBeCloseTo(F.left + F.width - ARROWHEAD_INSET, 0);

    // And an arrow into a milestone still lands on it, though it has no width.
    const de = await arrowEnds(page, fixture.links.de);
    expect(de.startX).toBeCloseTo(D.left + D.width, 0);
    expect(de.endX).toBeCloseTo(E.left - ARROWHEAD_INSET, 0);
  });

  test("the critical path is exactly the longest chain", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);

    // Each bar is measured against ITSELF across the toggle.
    //
    // This used to capture one bar's colour before the toggle and then assert
    // that every critical bar differed from that single value. Any bar whose
    // group colour already differed from A's satisfied that without the toggle
    // doing anything at all, so the test could pass while critical-path
    // highlighting was entirely broken.
    const names = [
      ...fixture.expected.criticalNames,
      ...fixture.expected.floatingNames,
    ];
    const before = new Map<string, string>();
    for (const name of names) {
      before.set(name, (await barBox(page, name)).background);
    }

    await page.getByRole("button", { name: /^View/ }).click();
    await page.getByRole("switch", { name: /Critical path/ }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    // A→B→C→D→E is 25 days; nothing else comes close, so those five carry no
    // float and everything else does.
    const criticalColours = new Set<string>();
    for (const name of fixture.expected.criticalNames) {
      const after = (await barBox(page, name)).background;
      expect(after, `${name} should change colour when the critical path is shown`)
        .not.toBe(before.get(name));
      criticalColours.add(after);
    }

    // One highlight colour for the whole chain, not a coincidence per bar.
    expect(criticalColours.size, "the critical chain should share one colour").toBe(1);
    const criticalColour = [...criticalColours][0];

    for (const name of fixture.expected.floatingNames) {
      const after = (await barBox(page, name)).background;
      expect(after, `${name} has slack and should be untouched`).toBe(before.get(name));
      expect(after, `${name} has slack and should not be highlighted`).not.toBe(
        criticalColour
      );
    }
  });

  test("the broken link is counted and reachable", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);

    // J starts before C ends, so C→J is the one impossible link.
    const badge = page.getByRole("button", { name: /broken link/i });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(String(fixture.expected.brokenLinkCount));

    await badge.click();
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog", { name: /dependency/i })).toBeVisible();
  });

  test("the toolbar's controls all do something", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);

    const widthAt = async () => (await barBox(page, "C Travaux")).width;

    const day = await widthAt();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await page.waitForTimeout(600);
    const week = await widthAt();
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await page.waitForTimeout(600);
    const month = await widthAt();

    // Coarser scales draw the same task narrower.
    expect(day).toBeGreaterThan(week);
    expect(week).toBeGreaterThan(month);

    await page.getByRole("button", { name: "Day", exact: true }).click();
    await page.waitForTimeout(500);

    // Today and Fit both move the viewport rather than the data.
    await page.getByRole("button", { name: /^Today$/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /^Fit/ }).click();
    await page.waitForTimeout(600);
    const fitted = await widthAt();
    expect(fitted).toBeGreaterThan(0);

    // The View menu's own contents.
    await page.getByRole("button", { name: /^View/ }).click();
    await expect(page.getByRole("switch", { name: /Critical path/ })).toBeVisible();
    await expect(page.getByRole("switch", { name: /Baseline/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Set baseline|Update baseline/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Slack$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Group$/ })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("a captured baseline can then be shown", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);

    await page.getByRole("button", { name: /^View/ }).click();
    await page.getByRole("button", { name: /Set baseline|Update baseline/ }).click();
    await page.waitForTimeout(2500);

    await page.getByRole("button", { name: /^View/ }).click();
    const toggle = page.getByRole("switch", { name: /Baseline/ });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // The agreed plan is drawn as a thin grey bar under the live one.
    await expect(page.locator('[class*="bg-gray-400"]').first()).toBeVisible();
  });

  test("export hands over a file", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);

    await page.getByRole("button", { name: /^Export$/ }).click();
    await page.waitForTimeout(500);

    const download = page.waitForEvent("download", { timeout: 45_000 });
    await page.getByRole("button", { name: /PNG/i }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.png$/i);
  });

  test("a one-day task is drawn as a milestone", async ({ page }) => {
    await openAuditBoard(page, fixture.workspaces.test.name, fixture.boards.a.name);
    await openGantt(page);
    await expect(
      page.getByRole("button", { name: new RegExp(`^Milestone: ${fixture.expected.milestone},`) })
    ).toBeVisible();
  });
});
