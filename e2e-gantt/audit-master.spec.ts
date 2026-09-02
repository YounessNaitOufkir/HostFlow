import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * The Master Gantt half of the audit: the parts a single board cannot show -
 * a link that leaves its board, one that leaves its property, and the swimlane
 * headings that say which property a row belongs to.
 */

const fixture = JSON.parse(readFileSync(path.join(__dirname, ".audit.json"), "utf-8")) as {
  boards: Record<"a" | "b" | "c", { id: string; name: string }>;
  workspaces: { test: { name: string }; other: { name: string } };
  links: Record<string, string>;
};

async function openMasterGantt(page: Page) {
  await page.goto("/");
  await page.waitForTimeout(2500);

  // A fresh selection, so the default is what is under test rather than a
  // preference left over from an earlier run.
  await page.evaluate(() => {
    try {
      localStorage.removeItem("hostflow_master_gantt_selection");
    } catch {}
  });
  await page.reload();
  await page.waitForTimeout(3000);

  await page.getByText(/Master Gantt/i).first().click();
  await page.waitForTimeout(4000);
}

/**
 * Narrows the chart to exactly the named boards.
 *
 * Cleared first on purpose: opening with the workspace picker on "All
 * workspaces" ticks every board in the account, and a chart of fifteen boards
 * virtualizes the row under test off screen before it can be looked at.
 */
async function showOnly(page: Page, names: string[]) {
  const panel = page.getByRole("region", { name: /Included Boards/i });
  await panel.getByRole("button", { name: /^Clear$/ }).click();
  await page.waitForTimeout(700);

  for (const name of names) {
    const row = panel.getByRole("button", { name, exact: true }).first();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2000);
}

test.describe("Master Gantt audit", () => {
  test("lists boards from every workspace, private ones aside", async ({ page }) => {
    await openMasterGantt(page);
    const panel = page.getByRole("region", { name: /Included Boards/i });

    // The seed made a second workspace precisely so there is a property to cross.
    await expect(panel.getByText(fixture.workspaces.other.name)).toBeVisible();
    await expect(panel.getByText(fixture.workspaces.test.name, { exact: true })).toBeVisible();
  });

  test("draws a link that leaves its board", async ({ page }) => {
    await openMasterGantt(page);
    await showOnly(page, [fixture.boards.a.name, fixture.boards.b.name]);

    await page.getByRole("button", { name: /^Fit/ }).click();
    await page.waitForTimeout(1500);

    // C Travaux on board A, K on board B - same property, different boards.
    const arrow = page.locator(`g[data-dependency-id="${fixture.links.ck}"]`);
    await expect(arrow).toBeAttached();
    await expect(arrow.locator("path[marker-end]")).toHaveAttribute("d", /^M /);
  });

  test("draws a link that leaves its property", async ({ page }) => {
    await openMasterGantt(page);
    await showOnly(page, [fixture.boards.a.name, fixture.boards.c.name]);

    await page.getByRole("button", { name: /^Fit/ }).click();
    await page.waitForTimeout(1500);

    const arrow = page.locator(`g[data-dependency-id="${fixture.links.cl}"]`);
    await expect(arrow).toBeAttached();
  });

  test("names the property on every swimlane", async ({ page }) => {
    await openMasterGantt(page);
    await showOnly(page, [fixture.boards.a.name, fixture.boards.c.name]);

    // Board names repeat across properties by design, so a lane that named only
    // the board would be unidentifiable.
    await expect(
      page.getByText(`${fixture.workspaces.other.name} › ${fixture.boards.c.name}`).first()
    ).toBeVisible();
  });

  test("the critical path is computed across boards, not per board", async ({ page }) => {
    await openMasterGantt(page);
    await showOnly(page, [fixture.boards.a.name, fixture.boards.b.name]);

    await page.getByRole("button", { name: /^View/ }).click();
    await page.getByRole("switch", { name: /Critical path/ }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);

    // The longest chain still runs A-B-C-D-E and ends on board A, so pulling a
    // second board onto the chart must not change who is critical.
    const critical = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="button"]'))
        .map((el) => el.getAttribute("aria-label") || "")
        .filter((l) => /no slack - on the critical path/.test(l))
        .map((l) => l.split(",")[0].replace(/^Milestone: /, ""))
    );
    expect(critical.sort()).toEqual(
      ["A Permis", "B Devis", "C Travaux", "D Finitions", "E Livraison"].sort()
    );
  });

  test("Projects only collapses to one row per board", async ({ page }) => {
    await openMasterGantt(page);
    await showOnly(page, [fixture.boards.a.name]);

    const task = page.getByRole("button", { name: /^C Travaux,/ });
    await expect(task).toBeVisible();

    await page.getByRole("button", { name: /Projects only/i }).click();
    await page.waitForTimeout(1500);
    await expect(task).toHaveCount(0);

    await page.getByRole("button", { name: /Projects only/i }).click();
    await page.waitForTimeout(1500);
    await expect(task).toBeVisible();
  });

  test("the portfolio filter narrows every lane at once", async ({ page }) => {
    await openMasterGantt(page);
    await showOnly(page, [fixture.boards.a.name]);

    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Next 30 days/i }).click();
    await page.waitForTimeout(1500);

    // The seed puts everything a fortnight out and 25 days long, so a 30-day
    // window keeps the chart populated rather than emptying it.
    await expect(page.getByText(/of \d+ tasks/i).first()).toBeVisible();
  });
});
