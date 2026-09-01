import { test, expect } from "@playwright/test";
import { fixture, openGantt, openBoard, bar, db, resetFixtureDates } from "./helpers";

/**
 * A date changed in the board table now reschedules the same way the chart does.
 *
 * There used to be two engines. The Gantt pushed successors by link type and
 * lag; a table edit shifted every one of them by the same raw delta, only ever
 * forwards, and only on a board carrying an enabled "Timeline & Date Shifting"
 * automation. The same change therefore did different things depending on which
 * screen you made it on - and on a board without that automation, which is
 * nearly all of them, a dependency constrained nothing until you dragged a bar.
 *
 * The seeded board has no such automation, so before this change the table edit
 * below would have moved nothing at all.
 *
 * The change under test is a five-day extension of the first task's finish,
 * because that is what the date picker does naturally: with a range already
 * selected it extends it rather than starting a new one.
 */

const PERMIS = fixture.items[0];
const DEVIS = fixture.items[1];
const TRAVAUX = fixture.items[2];
const COL = fixture.columns.timeline;

const itemById = async (id: string) =>
  (await db(`items?select=id,name,column_values&id=eq.${id}`))[0];

const span = (item: { column_values: Record<string, { start: string; end: string }> }) =>
  item.column_values[COL];

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const readAll = async () => ({
  permis: span(await itemById(PERMIS.id)),
  devis: span(await itemById(DEVIS.id)),
  travaux: span(await itemById(TRAVAUX.id)),
});

test.describe.configure({ mode: "serial" });

test("extending a task in the table reschedules exactly as the chart does", async ({ page }) => {
  // ---------- what the chart does with a five-day extension
  await resetFixtureDates();
  await openGantt(page);

  const seeded = await readAll();
  const wanted = { start: seeded.permis.start, end: addDays(seeded.permis.end, 5) };

  await expect(bar(page, PERMIS.name)).toBeVisible();
  const box = (await bar(page, PERMIS.name).boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3 + 250, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(2500);

  const viaChart = await readAll();
  expect(viaChart.permis, "the chart applied the extension").toEqual(wanted);
  expect(viaChart.devis.start, "and pushed the successor").not.toBe(seeded.devis.start);

  // ---------- the same extension, made in the board table
  await resetFixtureDates();
  await openBoard(page);

  const permisRow = page
    .locator("tr, [class*='group']")
    .filter({ hasText: PERMIS.name })
    .first();
  await permisRow.getByText(/^\w{3} \d+( – .+)?$/).first().click();

  // react-day-picker opens on the current month, not on the value being edited,
  // so it has to be walked forward. Days are matched on their own aria-label,
  // which carries the full date and cannot collide with a number elsewhere.
  const calendar = page.locator(".rdp-root");
  await calendar.waitFor({ timeout: 15_000 });

  const monthName = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" });
  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    const month = d.toLocaleString("en-US", { month: "long" });
    return new RegExp(`${month} ${d.getDate()}(st|nd|rd|th), ${d.getFullYear()}`);
  };

  for (let i = 0; i < 14; i++) {
    if ((await calendar.textContent())?.includes(monthName(wanted.end))) break;
    await page.locator("button.rdp-button_next").click();
    await page.waitForTimeout(250);
  }
  expect(await calendar.textContent()).toContain(monthName(wanted.end));

  // One click: with a range already selected the picker extends its finish.
  await calendar.getByRole("button", { name: dayLabel(wanted.end) }).click();
  await page.getByRole("button", { name: /Apply/ }).click();
  await page.waitForTimeout(3000);

  const viaTable = await readAll();

  expect(viaTable.permis, "the table applied the same extension").toEqual(wanted);

  // The chain moved with it, which on a board with no timeline-shifting
  // automation would previously not have happened at all.
  expect(viaTable.devis.start).not.toBe(seeded.devis.start);

  // One engine, one answer.
  expect(viaTable.devis).toEqual(viaChart.devis);
  expect(viaTable.travaux).toEqual(viaChart.travaux);
});
