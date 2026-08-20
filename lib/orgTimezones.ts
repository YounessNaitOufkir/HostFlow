/**
 * The timezones an admin can pick for the company.
 *
 * The previous list offered five US zones plus London and Paris and no African
 * one at all, so Host'lik — a Moroccan company — could not select its own
 * timezone even in principle. Casablanca leads the list for that reason.
 *
 * Deliberately short rather than the full IANA database: this is a single-company
 * setting, and a 400-entry dropdown is worse than a curated one. Add entries as
 * they are actually needed.
 */
export interface OrgTimezone {
  id: string;
  label: string;
}

export const ORG_TIMEZONES: OrgTimezone[] = [
  { id: "Africa/Casablanca", label: "Casablanca (Morocco)" },
  { id: "UTC", label: "UTC (Coordinated Universal Time)" },
  { id: "Europe/London", label: "London (GMT/BST)" },
  { id: "Europe/Paris", label: "Paris / Central European Time" },
  { id: "Europe/Madrid", label: "Madrid" },
  { id: "Africa/Cairo", label: "Cairo" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "America/New_York", label: "New York (Eastern)" },
  { id: "America/Chicago", label: "Chicago (Central)" },
  { id: "America/Denver", label: "Denver (Mountain)" },
  { id: "America/Los_Angeles", label: "Los Angeles (Pacific)" },
];
