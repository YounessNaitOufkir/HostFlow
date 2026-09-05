import { toast } from "sonner";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResponse {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Sends an email notification using Resend (https://resend.com) if RESEND_API_KEY is configured.
 * Safely falls back to console logging & development simulation when no key is set.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResponse> {
  // Server-only. Never read a NEXT_PUBLIC_ variable for this: that prefix inlines the
  // value into the browser bundle, which would publish the Resend key to every visitor.
  // Resend also rejects browser-origin requests (CORS), so a client-side key cannot work
  // even in principle. This module is reachable from the client bundle via
  // lib/automations/engine.ts, so on the client apiKey is simply undefined and we fall
  // through to the simulation branch below.
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "HostFlow Automations <onboarding@resend.dev>";
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (!apiKey) {
    // Development fallback / simulated email delivery.
    //
    // Deliberately counts recipients rather than naming them, and never prints
    // the body: this branch runs whenever RESEND_API_KEY is unset, which
    // includes the client, so addresses and message content would otherwise
    // land in a shared server log or in the browser console.
    console.log(
      `📧 [EMAIL SIMULATION] subject="${options.subject}" recipients=${recipients.length} (RESEND_API_KEY not set)`
    );
    if (typeof window !== "undefined") {
      try {
        toast.success(`📧 Email Sent: ${options.subject}`, {
          description: `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`,
        });
      } catch (e) {}
    }
    return {
      success: true,
      id: "simulated-" + Date.now(),
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      // The automations pass awaits sendEmail once per item, in sequence, so a
      // request that hangs stalls every item behind it. The catch below already
      // turns an abort into { success: false }.
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[sendEmail] Resend API error:", data);
      return { success: false, error: data.message || "Failed to send email via Resend" };
    }

    if (typeof window !== "undefined") {
      try {
        toast.success(`📧 Email Sent: ${options.subject}`, {
          description: `To: ${recipients.join(", ")}`,
        });
      } catch (e) {}
    }

    return { success: true, id: data.id };
  } catch (err: any) {
    console.error("[sendEmail] Network error:", err);
    return { success: false, error: err?.message || "Email delivery failed" };
  }
}
