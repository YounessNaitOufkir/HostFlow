import { describe, it, expect, beforeEach } from "vitest";
import { STORAGE_KEYS, migrateLegacyStorageKeys } from "@/lib/storageKeys";

/** A localStorage stand-in, so these assertions do not depend on a DOM. */
function makeStore(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  } as Storage;
}

describe("renaming the browser preference keys", () => {
  let store: Storage;

  beforeEach(() => {
    store = makeStore();
  });

  it("carries an existing preference across to the new name", () => {
    // The regression this guards: renaming the key without moving the value
    // silently resets the sidebar and the hidden columns of everyone who has
    // ever used the app, which reads as a bug rather than a rename.
    const s = makeStore({
      monday_clone_sidebar: "false",
      monday_clone_hidden_columns: '{"board-1":["col-a"]}',
    });

    migrateLegacyStorageKeys(s);

    expect(s.getItem(STORAGE_KEYS.sidebar)).toBe("false");
    expect(s.getItem(STORAGE_KEYS.hiddenColumns)).toBe('{"board-1":["col-a"]}');
  });

  it("removes the old name once the value has moved", () => {
    const s = makeStore({ monday_clone_sidebar: "true" });
    migrateLegacyStorageKeys(s);
    expect(s.getItem("monday_clone_sidebar")).toBe(null);
  });

  it("never overwrites a newer value with a stale one", () => {
    const s = makeStore({
      monday_clone_sidebar: "false",
      [STORAGE_KEYS.sidebar]: "true",
    });

    migrateLegacyStorageKeys(s);

    expect(s.getItem(STORAGE_KEYS.sidebar)).toBe("true");
    expect(s.getItem("monday_clone_sidebar")).toBe(null);
  });

  it("is safe to run repeatedly", () => {
    const s = makeStore({ monday_clone_hidden_columns: '{"b":["c"]}' });
    migrateLegacyStorageKeys(s);
    s.setItem(STORAGE_KEYS.hiddenColumns, '{"b":["c","d"]}');
    migrateLegacyStorageKeys(s);
    expect(s.getItem(STORAGE_KEYS.hiddenColumns)).toBe('{"b":["c","d"]}');
  });

  it("does nothing for a browser that has never stored anything", () => {
    migrateLegacyStorageKeys(store);
    expect(store.getItem(STORAGE_KEYS.sidebar)).toBe(null);
    expect(store.length).toBe(0);
  });

  it("leaves the retired navigation keys alone", () => {
    // lib/navState.ts replaced these with one per-user record and names them
    // only in order to delete them. Renaming those strings would strand them.
    const s = makeStore({ monday_clone_main_view: "kanban" });
    migrateLegacyStorageKeys(s);
    expect(s.getItem("monday_clone_main_view")).toBe("kanban");
    expect(s.getItem("hostflow_main_view")).toBe(null);
  });

  it("survives a storage that throws, as private browsing does", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;

    expect(() => migrateLegacyStorageKeys(hostile)).not.toThrow();
  });
});
