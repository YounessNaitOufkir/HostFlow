import { describe, it, expect, afterEach, vi } from "vitest";
import {
  renderEmail,
  itemUrl,
  appUrl,
  escapeHtml,
} from "@/lib/emailTemplate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appUrl", () => {
  it("drops a trailing slash so paths do not double up", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hostflow-app.com/");
    expect(appUrl()).toBe("https://hostflow-app.com");
  });

  it("falls back to localhost when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});

describe("itemUrl", () => {
  it("carries the board and the item, since the app has no route for either", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hostflow-app.com");
    const url = new URL(itemUrl("board-1", "item-9"));
    expect(url.origin).toBe("https://hostflow-app.com");
    expect(url.searchParams.get("board")).toBe("board-1");
    expect(url.searchParams.get("item")).toBe("item-9");
  });
});

describe("escapeHtml", () => {
  it("neutralises the five characters that break out of markup", () => {
    expect(escapeHtml(`<a href="x" & 'y'>`)).toBe(
      "&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;"
    );
  });
});

describe("renderEmail", () => {
  const base = {
    preheader: "Preview line",
    heading: "A task is overdue",
    recipientName: "Amina",
    paragraphs: ["This task missed its due date."],
  };

  it("escapes task names, which are user input", () => {
    // The previous templates interpolated item.name straight into the body, so
    // a task called <script>… travelled into the recipient's mail client.
    const { html } = renderEmail({
      ...base,
      details: [{ label: "Task", value: "<script>alert(1)</script>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("puts the call to action in both representations", () => {
    const href = "https://hostflow-app.com/?board=b1&item=i1";
    const { html, text } = renderEmail({
      ...base,
      cta: { label: "Open the task", href },
    });
    // & has to survive as an entity in HTML and as itself in plain text.
    expect(html).toContain("board=b1&amp;item=i1");
    expect(text).toContain(href);
  });

  it("hides the preheader from the body while leaving it for the inbox list", () => {
    const { html } = renderEmail(base);
    expect(html).toContain("Preview line");
    expect(html).toMatch(/display:none[^>]*>Preview line/);
  });

  it("writes a text alternative for clients that block images", () => {
    const { text } = renderEmail({
      ...base,
      details: [{ label: "Board", value: "Studio A" }],
    });
    expect(text).toContain("A task is overdue");
    expect(text).toContain("Hi Amina,");
    expect(text).toContain("Board: Studio A");
    expect(text).not.toContain("<");
  });

  it("colours the detail block by severity", () => {
    const overdue = renderEmail({ ...base, accent: "red", details: [{ label: "a", value: "b" }] });
    const dueToday = renderEmail({ ...base, accent: "amber", details: [{ label: "a", value: "b" }] });
    expect(overdue.html).toContain("#D93025");
    expect(dueToday.html).toContain("#F5A623");
  });

  it("keeps style attributes whole, which an inner double quote would truncate", () => {
    // The font stack has to quote 'Segoe UI' with single quotes. With double
    // quotes the style="..." attribute ends at the family name, every
    // declaration after it becomes a stray tag attribute, and the text silently
    // falls back to serif with the button losing its white-on-navy entirely.
    const { html } = renderEmail({ ...base, cta: { label: "Open", href: "https://x.test" } });
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(doc.querySelector("h1")?.getAttribute("style")).toContain("color:");
    expect(doc.querySelector("a")?.getAttribute("style")).toContain("text-decoration:none");
    // Nothing should have leaked out of a style attribute into the tag itself.
    expect(doc.querySelector("h1")?.hasAttribute("roboto")).toBe(false);
  });

  it("uses tables rather than flexbox, which Outlook does not support", () => {
    const { html } = renderEmail({ ...base, cta: { label: "Open", href: "https://x.test" } });
    expect(html).not.toContain("display:flex");
    expect(html).toContain('role="presentation"');
  });
});
