import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { renderEmail, appUrl } from "@/lib/emailTemplate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invites someone to a workspace by email.
 *
 * Runs service-role because it needs two things a normal session can't do:
 * look up whether the email already has an account, and send mail. The
 * caller is authorised FIRST, as themselves, so RLS and can_manage_workspace()
 * decide who may invite — not this route.
 *
 * Always resolves the same generic shape regardless of whether the email
 * turned out to belong to an existing account or a brand-new one: an
 * authorised inviter typing addresses one at a time must not be able to
 * fingerprint who already has a HostFlow account.
 */
export async function POST(request: Request) {
  try {
    const { workspaceId, email: rawEmail } = await request.json().catch(() => ({}));
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "A workspaceId is required" }, { status: 400 });
    }
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    // 1. Who is asking, and may they invite to this workspace?
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: allowed, error: permError } = await userClient.rpc("can_manage_workspace", {
      ws_id: workspaceId,
    });
    if (permError) {
      return NextResponse.json({ error: "Could not check permissions" }, { status: 500 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "You cannot invite people to this workspace" },
        { status: 403 }
      );
    }

    // 2. Elevated, but scoped to what this one invite needs.
    const admin = createAdminClient();

    const [{ data: workspace, error: wsError }, { data: inviter }] = await Promise.all([
      admin.from("workspaces").select("id, name, is_private").eq("id", workspaceId).single(),
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
    ]);
    if (wsError || !workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // A non-private workspace is staff-only, so a grant there is dead on
    // arrival unless it also lifts the ceiling — see the migration's header.
    const isStaffInvite = !workspace.is_private;
    const inviterName = inviter?.full_name || "Someone";

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, is_staff")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      // Already has an account: grant access now, no email needed.
      const { error: memberError } = await admin
        .from("workspace_members")
        .upsert(
          { workspace_id: workspaceId, user_id: existingProfile.id, role: "member" },
          { onConflict: "user_id,workspace_id", ignoreDuplicates: true }
        );
      if (memberError) {
        console.error("[workspaces/invite] workspace_members upsert failed:", memberError.message);
        return NextResponse.json({ error: "Could not grant access" }, { status: 500 });
      }
      if (isStaffInvite && existingProfile.is_staff === false) {
        await admin.from("profiles").update({ is_staff: true }).eq("id", existingProfile.id);
      }
      return NextResponse.json({ success: true });
    }

    // No account yet: record the invite and email a signup link. Redeemed by
    // redeem_pending_invitations() when they eventually create an account.
    const { data: invite, error: inviteError } = await admin
      .from("pending_invitations")
      .upsert(
        {
          workspace_id: workspaceId,
          email,
          invited_by: user.id,
          role: "member",
          is_staff_invite: isStaffInvite,
        },
        { onConflict: "workspace_id,email" }
      )
      .select("token")
      .single();
    if (inviteError || !invite) {
      console.error("[workspaces/invite] pending_invitations upsert failed:", inviteError?.message);
      return NextResponse.json({ error: "Could not send the invitation" }, { status: 500 });
    }

    const { html, text } = renderEmail({
      preheader: `${inviterName} invited you to collaborate on HostFlow.`,
      heading: "You're invited to HostFlow",
      paragraphs: [
        `${inviterName} has invited you to collaborate on "${workspace.name}" in HostFlow.`,
        "Create your account with this email address to get access — or sign in, if you already have one.",
      ],
      cta: { label: "Accept invitation", href: `${appUrl()}/login?invite=${invite.token}` },
      footerNote: "You're receiving this because someone invited you to a HostFlow workspace.",
    });

    const sent = await sendEmail({
      to: email,
      subject: `You're invited to join "${workspace.name}" on HostFlow`,
      html,
      text,
    });
    if (!sent.success) {
      // The invite row still exists, so a retry or a future signup with this
      // email redeems it either way — the email is a convenience, not the
      // only path in.
      console.error("[workspaces/invite] sendEmail failed:", sent.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Workspace Invite] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
