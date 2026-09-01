import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the real app against the seeded scratch board.
 *
 * Deliberately serial and single-worker: these tests write, and interleaving
 * writes to one board would make a failure impossible to read.
 */
export default defineConfig({
  testDir: "./e2e-gantt",
  reporter: "list",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1600, height: 950 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts|touch\.spec\.ts/,
      dependencies: ["setup"],
      // Signed in once by the setup project, so no test spends its budget on a
      // login form while the dev server is busy recompiling.
      use: { ...devices["Desktop Chrome"], storageState: "./e2e-gantt/.auth.json" },
    },
    {
      // A tablet, which is where a property manager would actually hold this.
      name: "tablet",
      testMatch: /touch\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        // Chromium with touch emulation rather than the WebKit iPad profile:
        // what is under test is pointer events and touch-action, and this does
        // not need a second browser engine downloaded to exercise them.
        ...devices["Desktop Chrome"],
        viewport: { width: 1194, height: 834 },
        hasTouch: true,
        storageState: "./e2e-gantt/.auth.json",
      },
    },
  ],
  // Next refuses a second dev server for the same directory, so these run
  // against whichever one is already up.
});
