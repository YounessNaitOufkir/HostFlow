import { describe, it, expect } from "vitest";
import {
  accessPromptState,
  isStandingDecline,
  latestRequestByUser,
  reasonToStore,
  requestForNotification,
  type AccessRequest,
} from "@/lib/accessRequests";
import { notificationText } from "@/lib/notificationText";
import { translate, type TranslationKey } from "@/lib/i18n";

const en = (k: TranslationKey, v?: Record<string, string | number>) => translate("en", k, v);
const fr = (k: TranslationKey, v?: Record<string, string | number>) => translate("fr", k, v);

const request = (over: Partial<AccessRequest>): AccessRequest => ({
  id: "r1",
  user_id: "u1",
  note: null,
  status: "pending",
  reason: null,
  decided_by: null,
  decided_at: null,
  cleared_at: null,
  created_at: "2026-09-27T09:00:00Z",
  ...over,
});

describe("requestForNotification", () => {
  const newer = request({ id: "r2", created_at: "2026-09-27T10:00:00Z" });
  const older = request({ id: "r1", status: "declined" });
  const byId = new Map([newer, older].map((r) => [r.id, r]));
  const latest = latestRequestByUser([newer, older]);

  it("finds the request a notification names", () => {
    const n = { message_vars: { name: "Karim", requestId: "r1" }, related_user_id: "u1" };
    expect(requestForNotification(n, byId, latest)?.id).toBe("r1");
  });

  it("falls back to the person's latest request on a notification from before requests were rows", () => {
    const n = { message_vars: { name: "Karim" }, related_user_id: "u1" };
    expect(requestForNotification(n, byId, latest)?.id).toBe("r2");
  });

  it("finds nothing for a named request that is not loaded, rather than guessing", () => {
    const n = { message_vars: { name: "Karim", requestId: "gone" }, related_user_id: "u1" };
    expect(requestForNotification(n, byId, latest)).toBeNull();
  });
});

describe("reasonToStore", () => {
  const standard = en("access.defaultReason");

  it("stores the standard reason as empty, so each reader sees it in their language", () => {
    expect(reasonToStore(standard, standard)).toBeNull();
    expect(reasonToStore(`  ${standard}  `, standard)).toBeNull();
    expect(reasonToStore("   ", standard)).toBeNull();
  });

  it("keeps an admin's own words", () => {
    expect(reasonToStore(" We only take staff for now. ", standard)).toBe("We only take staff for now.");
  });
});

describe("isStandingDecline", () => {
  it("is a decline that has not been cleared by joining the team", () => {
    expect(isStandingDecline(request({ status: "declined" }))).toBe(true);
    expect(isStandingDecline(request({ status: "declined", cleared_at: "2026-09-28T00:00:00Z" }))).toBe(false);
    expect(isStandingDecline(request({ status: "pending" }))).toBe(false);
    expect(isStandingDecline(undefined)).toBe(false);
  });
});

describe("accessPromptState", () => {
  const external = { role: "member" as const, is_staff: false };

  it("offers to ask when nothing was asked yet, or the last answer was a yes that was since undone", () => {
    expect(accessPromptState(external, undefined)).toEqual({ kind: "ask" });
    expect(accessPromptState(external, request({ status: "approved" }))).toEqual({ kind: "ask" });
  });

  it("waits while a request is pending", () => {
    expect(accessPromptState(external, request({}))).toEqual({ kind: "pending", since: "2026-09-27T09:00:00Z" });
  });

  it("stays declined for good, dated from the decision", () => {
    expect(
      accessPromptState(external, request({ status: "declined", decided_at: "2026-09-28T10:00:00Z" }))
    ).toEqual({ kind: "declined", on: "2026-09-28T10:00:00Z" });
  });

  it("offers to ask again once a decline was cleared by joining the team and later leaving it", () => {
    expect(
      accessPromptState(external, request({ status: "declined", cleared_at: "2026-09-29T00:00:00Z" }))
    ).toEqual({ kind: "ask" });
  });

  it("tells a Team member without workspaces that an admin is choosing them", () => {
    expect(accessPromptState({ role: "member", is_staff: true }, request({ status: "approved" }))).toEqual({
      kind: "onTeam",
    });
  });

  it("says nothing to an admin, who reaches every workspace by role", () => {
    expect(accessPromptState({ role: "admin", is_staff: true }, undefined)).toEqual({ kind: "hidden" });
    expect(accessPromptState(null, undefined)).toEqual({ kind: "hidden" });
  });
});

describe("the declined notification", () => {
  const declined = {
    message: "Your request to join Host'lik was declined: You're not a member of the Host'lik team.",
    message_key: "notif.accessDeclined" as TranslationKey,
    message_vars: { name: "Youness", reason: null } as unknown as Record<string, string>,
  };

  it("gives the standard reason in the reader's language when none was written", () => {
    expect(notificationText(en, declined)).toBe(
      "Your request to join Host'lik was declined: You're not a member of the Host'lik team."
    );
    expect(notificationText(fr, declined)).toContain("Vous ne faites pas partie de l'équipe Host'lik.");
  });

  it("gives the admin's own reason as written", () => {
    const own = { ...declined, message_vars: { name: "Youness", reason: "Staff only for now." } };
    expect(notificationText(en, own)).toBe("Your request to join Host'lik was declined: Staff only for now.");
  });
});
