/**
 * HostFlow's own product name — what the browser tab, PWA install prompt, and
 * Apple home-screen shortcut call this app.
 *
 * This used to be read from organization_settings.company_name, on the theory
 * that a tenant renaming their company should retitle the installed app to
 * match. In practice that conflated two different names: a tenant's own
 * business identity (used for their logo, invites, etc.) and this product's
 * own brand — so typing a company name here silently renamed the app itself.
 * The icon rail and login page already keep HostFlow's own mark regardless of
 * tenant branding (see the company-logo hint in AdminSettingsModal); the tab
 * and PWA title now follow the same rule.
 */
export const APP_NAME = "HostFlow";
