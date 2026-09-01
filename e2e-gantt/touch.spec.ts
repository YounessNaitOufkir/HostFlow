import { test, expect } from "@playwright/test";
import { fixture, openGantt, bar, db, resetFixtureDates } from "./helpers";

/**
 * The Gantt on a touchscreen.
 *
 * Every gesture used to be bound to mouse events, so on a tablet - which is
 * where someone would actually hold this, standing in a building - a bar could
 * not be moved, resized or linked at all. A finger on a bar scrolled the chart.
 */

const PERMIS = fixture.items[0];
const INDEPENDANT = fixture.items[5];
const COL = fixture.columns.timeline;

const itemById = async (id: string) =>
  (await db(`items?select=id,column_values&id=eq.${id}`))[0];

const shift = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

test.describe.configure({ mode: "serial" });

test("the chart renders on a tablet", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await openGantt(page);
  await expect(bar(page, PERMIS.name)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a finger drags a task instead of scrolling the chart", async ({ page }) => {
  await resetFixtureDates();
  await openGantt(page);

  const before = await itemById(PERMIS.id);
  await expect(bar(page, PERMIS.name)).toBeVisible();
  const box = (await bar(page, PERMIS.name).boundingBox())!;

  const y = box.y + box.height / 2;
  const from = box.x + box.width / 2;

  // A real touch sequence, not a mouse one.
  await page.dispatchEvent("body", "pointerdown", {});
  await bar(page, PERMIS.name).dispatchEvent("pointerdown", {
    pointerType: "touch",
    isPrimary: true,
    pointerId: 1,
    clientX: from,
    clientY: y,
    bubbles: true,
  });
  for (const step of [60, 120, 180, 250]) {
    await page.dispatchEvent("body", "pointermove", {
      pointerType: "touch",
      pointerId: 1,
      clientX: from + step,
      clientY: y,
      bubbles: true,
    });
  }
  await page.dispatchEvent("body", "pointerup", {
    pointerType: "touch",
    pointerId: 1,
    clientX: from + 250,
    clientY: y,
    bubbles: true,
  });
  await page.waitForTimeout(2500);

  const after = await itemById(PERMIS.id);
  expect(
    shift(before.column_values[COL].start, after.column_values[COL].start),
    "the task moved five days under a finger"
  ).toBe(5);
});

test("link handles are reachable without a hover", async ({ page }) => {
  await openGantt(page);

  // On a touch screen nothing is ever hovered, so a control revealed only on
  // hover can never be found.
  const handle = page.locator('[title^="Drag to link"]').first();
  await expect(handle).toBeVisible();
  expect(await handle.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

test("bars do not let the browser steal the gesture", async ({ page }) => {
  await openGantt(page);
  const touchAction = await bar(page, INDEPENDANT.name).evaluate(
    (el) => getComputedStyle(el).touchAction
  );
  expect(touchAction, "a bar owns its own gesture").toBe("none");
});
