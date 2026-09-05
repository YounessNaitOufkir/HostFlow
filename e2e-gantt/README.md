# Gantt end-to-end tests

Drives the real app in a browser against a **scratch board** created for the
purpose, so no existing task is ever dragged, edited or removed.

## Running

```bash
npm run dev                                        # in another terminal
node e2e-gantt/seed.js e2e-gantt/.fixture.json     # creates the scratch board
npx playwright test --config playwright.gantt.config.ts
```

`seed.js` creates one board named `ZZ Gantt E2E <timestamp>` in the **Test**
workspace, with a group, six tasks and a four-link chain. Re-running it creates
another; the boards are safe to delete by hand when you are done with them.

Credentials come from `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local`.

## Proving nothing else moved

The suite writes, so it is worth being able to show it wrote only where it
should:

```bash
node e2e-gantt/snapshot.js before.json
npx playwright test --config playwright.gantt.config.ts
node e2e-gantt/snapshot.js after.json
node e2e-gantt/diff.js before.json after.json
```

`diff.js` exits non-zero if any row that already existed was changed or removed.
Newly added rows are counted and allowed.

## Notes

- A `setup` project signs in once and caches the session to `.auth.json`, so no
  test spends its budget on a login form while the dev server recompiles. Doing
  it per test meant one of them reliably landed mid-recompile and timed out.
- Every run adds two tasks to the scratch board — the link test needs a pair
  nothing is linked to yet, and these tests never delete. Re-run `seed.js` for a
  clean board when it gets cluttered.
- Tests that move tasks call `resetFixtureDates()` first, so a run always starts
  from the seeded dates rather than the last run's result.
- The link test creates its own pair each run and narrows the board to them with
  the search box: re-linking the same two tasks would be refused as a duplicate.

## The audit fixture

`audit-seed.js` builds a second, richer fixture whose answer is worked out in
advance, so the chart can be checked against arithmetic rather than impressions:

```
node e2e-gantt/audit-seed.js e2e-gantt/.audit.json
npx playwright test --config playwright.gantt.config.ts audit.spec.ts audit-master.spec.ts
```

It creates its own workspace and three boards, so it can exercise a link that
leaves its board and one that leaves its property. The network is a chain
A-B-C-D-E of 25 days, five tasks that must carry float, one deliberately
impossible link, one milestone, a positive lag, an SS and an FF — so the
critical set, the broken-link count and every arrow anchor are known before the
chart draws them.

Re-seed rather than re-run: the audit captures a baseline and the reschedule
tests move dates, so a second run would start from the first run's result.
