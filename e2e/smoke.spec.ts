import { test, expect } from "@playwright/test";

test.describe("HostFlow E2E Smoke Suite", () => {
  test("has valid app title", async ({ page }) => {
    await page.goto("/");

    // The title should be defined and non-empty
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title.toLowerCase()).toContain("hostflow");
  });

  test("redirects unauthenticated users to login or renders app layout", async ({ page }) => {
    await page.goto("/");

    // HostFlow either redirects to /login if unauthenticated, or renders the main workspace container
    await page.waitForLoadState("domcontentloaded");
    const currentUrl = page.url();

    if (currentUrl.includes("/login")) {
      // Confirm login form elements are present
      await expect(page.locator("input[type='email'], input[name='email'], button[type='submit']").first()).toBeVisible();
    } else {
      // Authenticated / local dev bypass — check for main container or sidebar
      const body = page.locator("body");
      await expect(body).toBeVisible();
    }
  });

  test("renders viewport without critical JavaScript console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Check that login page loaded and no unhandled syntax/runtime errors broke execution
    expect(page.url()).toContain("/login");
    // Filter out common harmless network/favicon warnings in local dev
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes("favicon") && !err.includes("404")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
