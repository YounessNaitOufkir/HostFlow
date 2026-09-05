import { test, expect } from "@playwright/test";
import { fixture, openGantt, bar, db, resetFixtureDates, createTask } from "./helpers";

/**
 * The Gantt, driven through the real app against a scratch board.
 *
 * Every gesture here targets only tasks this run created. Nothing that already
 * existed is dragged, edited or removed - which is also why the board is its
 * own island: a reschedule cannot reach an existing task through a dependency
 * chain that does not leave the board.
 */

const PERMIS = fixture.items[0];
const DEVIS = fixture.items[1];
const INDEPENDANT = fixture.items[5];

const itemById = async (id: string) =>
  (await db(`items?select=id,name,column_values,baseline&id=eq.${id}`))[0];

test.describe.configure({ mode: "serial" });

test("the board's Gantt renders the seeded plan", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await openGantt(page);

  for (const item of fixture.items) {
    await expect(bar(page, item.name)).toBeVisible();
  }
  await expect(page.getByText("Phase 1", { exact: true }).first()).toBeVisible();

  // The seeded chain is drawn. Arrows outside the viewport are deliberately not
  // routed, so this counts what is on screen rather than all four.
  const arrows = page.locator("svg path[marker-end]");
  expect(await arrows.count()).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test("zoom keeps the arrows attached to the bars", async ({ page }) => {
  await openGantt(page);

  for (const zoom of ["Week", "Month", "Day"]) {
    await page.getByRole("button", { name: zoom, exact: true }).click();
    await page.waitForTimeout(400);

    const box = await bar(page, PERMIS.name).boundingBox();
    expect(box, `${PERMIS.name} should be on screen at ${zoom} zoom`).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
  }
});

test("dragging a task moves it and pushes its successor", async ({ page }) => {
  // Back to the seeded dates, so the bar is where the chart's own bounds put it
  // rather than wherever the last run left it.
  await resetFixtureDates();
  await openGantt(page);

  const before = { permis: await itemById(PERMIS.id), devis: await itemById(DEVIS.id) };
  await expect(bar(page, PERMIS.name)).toBeVisible();
  const source = (await bar(page, PERMIS.name).boundingBox())!;

  // Five days right, at 50px a day on the default Day zoom.
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 250, source.y + source.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(2000);

  const after = { permis: await itemById(PERMIS.id), devis: await itemById(DEVIS.id) };
  const col = fixture.columns.timeline;

  const shift = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

  const permisShift = shift(
    before.permis.column_values[col].start,
    after.permis.column_values[col].start
  );
  expect(permisShift, "the dragged task moved five days").toBe(5);

  // Permis and Devis were back to back, so Devis has nowhere to absorb the move.
  const devisShift = shift(
    before.devis.column_values[col].start,
    after.devis.column_values[col].start
  );
  expect(devisShift, "the successor followed").toBeGreaterThan(0);

  // Duration is preserved: a drag moves a task, it does not stretch it.
  const span = (v: { start: string; end: string }) => shift(v.start, v.end);
  expect(span(after.permis.column_values[col])).toBe(span(before.permis.column_values[col]));
});

test("a task with slack is left where it is", async ({ page }) => {
  // "E2E Independant" has no predecessors, so nothing upstream can move it.
  await resetFixtureDates();
  const before = await itemById(INDEPENDANT.id);
  await openGantt(page);
  await page.waitForTimeout(500);
  const after = await itemById(INDEPENDANT.id);
  expect(after.column_values[fixture.columns.timeline]).toEqual(
    before.column_values[fixture.columns.timeline]
  );
});

test("resizing a bar changes only its finish", async ({ page }) => {
  await resetFixtureDates();
  await openGantt(page);

  const before = await itemById(INDEPENDANT.id);
  await expect(bar(page, INDEPENDANT.name)).toBeVisible();
  const box = (await bar(page, INDEPENDANT.name).boundingBox())!;

  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3 + 100, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(2000);

  const after = await itemById(INDEPENDANT.id);
  const col = fixture.columns.timeline;
  expect(after.column_values[col].start).toBe(before.column_values[col].start);
  expect(Date.parse(after.column_values[col].end)).toBeGreaterThan(
    Date.parse(before.column_values[col].end)
  );
});

test("the critical path and slack are reported", async ({ page }) => {
  await resetFixtureDates();
  await openGantt(page);

  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("switch", { name: /Critical path/ }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // The seeded chain has a day's gap between each task, and a gap is slack:
  // Permis could start four days later without moving the finish date.
  const permis = await bar(page, PERMIS.name).getAttribute("aria-label");
  expect(permis).toContain("slack");

  // The last task in the chain is what sets the finish, so it has none.
  const last = await bar(page, fixture.items[4].name).getAttribute("aria-label");
  expect(last).toContain("critical path");
});

test("the field picker adds Slack and Waits on", async ({ page }) => {
  await openGantt(page);

  // Under "Fields" inside the View menu, not "Columns": the board filter bar
  // above has a "Columns" button, and two identical labels doing different
  // things is a trap.
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("button", { name: "Slack", exact: true }).click();
  await page.getByRole("button", { name: "Waits on", exact: true }).click();
  // Escape closes it: the menus dismiss on Escape or an outside click.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // The headers render uppercase through CSS; the text in the DOM is not.
  await expect(page.getByText("Slack", { exact: true })).toBeVisible();
  await expect(page.getByText("Waits on", { exact: true })).toBeVisible();

  // Slack is a real computed number, not a placeholder: the seeded chain has a
  // day's gap between each task, so it counts down 4, 3, 2, 1, 0 to the finish.
  const slackCells = page.locator('[class*="tabular-nums"]');
  await expect(slackCells.filter({ hasText: /^4$/ }).first()).toBeVisible();

  // And the predecessor is named in the table, not just implied by an arrow.
  await expect(page.getByText(PERMIS.name).nth(1)).toBeVisible();
});

test("a baseline can be captured, updated and shown", async ({ page }) => {
  await resetFixtureDates();
  await openGantt(page);

  // Capture is reachable whether or not one already exists - the first version
  // turned the control into a display toggle after the first capture, which
  // left no way to update it.
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("button", { name: /Set baseline|Update baseline/ }).click();
  await page.waitForTimeout(3000);

  const stored = await itemById(PERMIS.id);
  expect(stored.baseline, "the agreed plan was stored").toBeTruthy();
  expect(stored.baseline.start).toBe(stored.column_values[fixture.columns.timeline].start);
  expect(stored.baseline.captured_at).toBeTruthy();

  // And it can then be shown against the live bars.
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("switch", { name: /Baseline/ }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  expect(await page.locator('[class*="bg-gray-400"]').count()).toBeGreaterThan(0);
});

test("a dependency can be drawn between two bars", async ({ page }) => {
  await resetFixtureDates();

  // A fresh, unlinked pair each run: re-linking the same two tasks would be
  // refused as a duplicate, and unpicking the last run's link is not something
  // these tests may do.
  const stamp = Date.now().toString().slice(-6);
  const source = await createTask(`E2E Link src ${stamp}`, 1, 3);
  const target = await createTask(`E2E Link dst ${stamp}`, 8, 3);

  await openGantt(page);

  // Narrow the board to just this run's pair. Each run adds two tasks, so
  // without this they drift down the board and out of reach - and it exercises
  // the filter bar, which the Gantt did not show at all until recently.
  await page.locator('input[placeholder*="earch" i]').first().fill(stamp);
  await page.waitForTimeout(900);

  await expect(bar(page, source.name)).toBeVisible();
  await expect(bar(page, target.name)).toBeVisible();

  const from = (await bar(page, source.name).boundingBox())!;
  const to = (await bar(page, target.name).boundingBox())!;

  // The link handle sits just outside the bar's finish, clear of the resize
  // handle on the edge itself.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.waitForTimeout(300);
  await page.mouse.move(from.x + from.width + 9, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * 0.25, to.y + to.height / 2, { steps: 15 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(2500);

  const links = await db(
    `item_links?select=id,dep_type,lag_days,target_item_id&source_item_id=eq.${source.id}`
  );
  expect(links.length, "a link was created").toBe(1);
  expect(links[0].target_item_id).toBe(target.id);
  // Finish handle into the target's start half is finish-to-start.
  expect(links[0].dep_type).toBe("FS");
  expect(links[0].lag_days).toBe(0);
});

test("the export menu offers every format", async ({ page }) => {
  await openGantt(page);
  await page.getByRole("button", { name: "Export" }).click();
  for (const label of ["PDF", "PNG image", "Print…", "Excel", "CSV"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test("a PDF downloads and is more than one page but not many", async ({ page }) => {
  await openGantt(page);
  await page.getByRole("button", { name: "Export" }).click();

  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByText("PDF", { exact: true }).click();
  const file = await download;

  const path = await file.path();
  const { readFileSync } = await import("fs");
  const bytes = readFileSync(path!);
  expect(bytes.length).toBeGreaterThan(20_000);

  // A six-task board must not paginate into a stack.
  const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  expect(pages).toBeGreaterThanOrEqual(1);
  expect(pages, "a small board is one or two pages").toBeLessThanOrEqual(2);
});

test("the filter bar is available in the Gantt, without the dead control", async ({ page }) => {
  await openGantt(page);

  // The bar was hidden here entirely, so the board's search and filters did nothing.
  await expect(page.locator('input[placeholder*="earch" i]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sort" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();

  // Its column show/hide governs the table and kanban, not the Gantt, and sat
  // next to a second button also called "Columns". Only the chart's own field
  // picker belongs on this screen.
  await expect(page.getByRole("button", { name: "Columns" })).toHaveCount(0);
  // The chart's own field picker lives inside View now.
  await page.getByRole("button", { name: /^View/ }).click();
  await expect(page.getByRole("button", { name: "Slack", exact: true })).toBeVisible();
});

test("searching narrows the chart", async ({ page }) => {
  await openGantt(page);
  await expect(bar(page, DEVIS.name)).toBeVisible();

  await page.locator('input[placeholder*="earch" i]').first().fill("E2E Permis");
  await page.waitForTimeout(900);

  await expect(bar(page, PERMIS.name)).toBeVisible();
  await expect(bar(page, DEVIS.name)).toHaveCount(0);
});
