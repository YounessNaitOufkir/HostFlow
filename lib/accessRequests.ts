import type { Notification, Profile } from "@/types";

export type AccessRequestStatus = "pending" | "approved" | "declined";

/** A row of access_requests: someone outside asking to join the Host'lik team. */
export interface AccessRequest {
  id: string;
  user_id: string;
  /** What the person wrote when asking, if anything. */
  note: string | null;
  status: AccessRequestStatus;
  /** On a decline, the admin's own words; null is the standard reason, in the reader's language. */
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  /** Set once a declined person was added to the team anyway; the decline no longer blocks. */
  cleared_at: string | null;
  created_at: string;
}

export type AccessRequestPerson = Pick<Profile, "id" | "full_name" | "avatar_initials" | "avatar_url" | "color">;

/**
 * The request a "wants to join" notification is about.
 *
 * Notifications written since requests became rows carry the request's id.
 * Older ones only name the person, so they show that person's latest request,
 * which is the one an admin can still act on.
 */
export function requestForNotification(
  notification: Pick<Notification, "message_vars" | "related_user_id">,
  byId: Map<string, AccessRequest>,
  latestByUser: Map<string, AccessRequest>
): AccessRequest | null {
  const id = notification.message_vars?.requestId;
  if (id) return byId.get(id) ?? null;
  if (notification.related_user_id) return latestByUser.get(notification.related_user_id) ?? null;
  return null;
}

/**
 * The reason to store for a decline. The standard reason, kept as offered, is
 * stored as null so each reader sees it in their own language.
 */
export function reasonToStore(text: string, standardReason: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === standardReason.trim()) return null;
  return trimmed.slice(0, 300);
}

/** Each person's latest request, from requests sorted newest first. */
export function latestRequestByUser(requests: AccessRequest[]): Map<string, AccessRequest> {
  const latest = new Map<string, AccessRequest>();
  for (const request of requests) {
    if (!latest.has(request.user_id)) latest.set(request.user_id, request);
  }
  return latest;
}

/** A decline that still stops the person from asking again. */
export function isStandingDecline(request: AccessRequest | null | undefined): request is AccessRequest {
  return !!request && request.status === "declined" && !request.cleared_at;
}

export type AccessPromptState =
  | { kind: "hidden" }
  | { kind: "ask" }
  | { kind: "pending"; since: string }
  | { kind: "declined"; on: string }
  | { kind: "onTeam" };

/**
 * What the "work at Host'lik?" prompt says to someone with no shared workspace.
 *
 * Admins reach every company workspace by role and never need it. A Team
 * member without one was let in but not yet given workspaces. Anyone else
 * can ask, or is waiting, or was declined - for good, until an admin adds
 * them to the team.
 */
export function accessPromptState(
  profile: Pick<Profile, "role" | "is_staff"> | null,
  latest: AccessRequest | null | undefined
): AccessPromptState {
  if (!profile || profile.role === "admin") return { kind: "hidden" };
  if (profile.is_staff) return { kind: "onTeam" };
  if (latest?.status === "pending") return { kind: "pending", since: latest.created_at };
  if (isStandingDecline(latest)) return { kind: "declined", on: latest.decided_at ?? latest.created_at };
  return { kind: "ask" };
}
