import { describe, it, expect } from "vitest";
import { buildBoardFromTemplate, getTemplate } from "@/lib/boardTemplates";
import { translate } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

const t = (key: TranslationKey) => translate("fr", key);

describe("project template", () => {
  it("tracks who a task is waiting on and whether it needs someone on site, after the dependency", () => {
    const { columns } = buildBoardFromTemplate(getTemplate("project"), t);
    const types = columns.map((c) => c.type);
    expect(types.filter((x) => x === "waiting_on")).toHaveLength(1);
    expect(types.filter((x) => x === "on_site")).toHaveLength(1);
    const dep = types.indexOf("dependency");
    expect(types.indexOf("waiting_on")).toBe(dep + 1);
    expect(types.indexOf("on_site")).toBe(dep + 2);
    expect(columns.find((c) => c.type === "waiting_on")?.title).toBe("En attente de");
    expect(columns.find((c) => c.type === "on_site")?.title).toBe("Sur place");
  });
});
