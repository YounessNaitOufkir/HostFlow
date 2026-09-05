import { test as setup } from "@playwright/test";
import { join } from "path";
import { login, AUTH_FILE } from "./helpers";

/**
 * Signs in once and saves the session for every other test.
 *
 * Logging in per test meant fourteen full sign-ins against a dev server that
 * recompiles between navigations; one of them would reliably land mid-compile
 * and time out on the login form. Cheaper, and it removes the race entirely.
 */
setup("authenticate", async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: join(__dirname, AUTH_FILE) });
});
