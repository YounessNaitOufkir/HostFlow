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
  const apiKey = process.env.NEXT_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY;
  const fromEmail = process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "HostFlow Automations <onboarding@resend.dev>";
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (!apiKey) {
    // Development fallback / simulated email delivery
    console.log("\n=========================================");
    console.log(`📧 [EMAIL SIMULATION / FALLBACK]`);
    console.log(`TO: ${recipients.join(", ")}`);
    console.log(`SUBJECT: ${options.subject}`);
    console.log(`CONTENT: ${options.text || "(HTML content provided)"}`);
    console.log("=========================================\n");
    if (typeof window !== "undefined") {
      try {
        toast.success(`📧 Email Sent: ${options.subject}`, {
          description: `To: ${recipients.join(", ")}`,
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
