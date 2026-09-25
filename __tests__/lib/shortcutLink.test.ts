import { describe, it, expect, beforeEach } from "vitest";
import { readShortcutView, clearShortcutView, SHORTCUT_VIEWS } from "@/lib/shortcutLink";

const goTo = (url: string) => window.history.replaceState(null, "", url);

describe("readShortcutView", () => {
  beforeEach(() => goTo("/"));

  it("reads each valid shortcut target", () => {
    for (const view of SHORTCUT_VIEWS) {
      goTo(`/?view=${view}`);
      expect(readShortcutView()).toBe(view);
    }
  });

  it("ignores an absent or unrecognized value", () => {
    goTo("/");
    expect(readShortcutView()).toBeNull();
    goTo("/?view=not-a-real-view");
    expect(readShortcutView()).toBeNull();
  });

  it("survives other query parameters alongside it", () => {
    goTo("/?utm_source=taskbar&view=my_work");
    expect(readShortcutView()).toBe("my_work");
  });
});

describe("clearShortcutView", () => {
  it("removes only the view param, keeping the rest of the URL", () => {
    goTo("/?view=portfolio_overview&board=abc");
    clearShortcutView();
    const url = new URL(window.location.href);
    expect(url.searchParams.has("view")).toBe(false);
    expect(url.searchParams.get("board")).toBe("abc");
  });

  it("does nothing when there is no view param", () => {
    goTo("/?board=abc");
    const before = window.location.href;
    clearShortcutView();
    expect(window.location.href).toBe(before);
  });
});
