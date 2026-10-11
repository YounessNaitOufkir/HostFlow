"use client";

import React from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { addDaysOnly, today } from "@/lib/gantt/dates";
import type { OnSiteConflict } from "@/lib/mission/conflicts";
import type { Profile, Workspace } from "@/types";

interface ConflictBannerProps {
  conflicts: OnSiteConflict[];
  profiles: Profile[];
  workspaces: Workspace[];
  todayIdx: number;
  onOpenTask: (boardId: string, itemId: string) => void;
}

/** Someone due on site at two properties on the same day, one block per clash. */
export default function ConflictBanner({ conflicts, profiles, workspaces, todayIdx, onOpenTask }: ConflictBannerProps) {
  const { t, bcp47 } = useLanguage();
  if (!conflicts.length) return null;
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name]));
  const workspaceName = new Map(workspaces.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-3">
      {conflicts.map((c) => {
        const date = addDaysOnly(today(), c.dayIdx - todayIdx).toLocaleDateString(bcp47, {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
        });
        return (
          <section
            key={`${c.tasks[0].item.id}+${c.tasks[1].item.id}`}
            role="alert"
            className="rounded-xl border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/8 p-4"
          >
            <h2 className="font-semibold text-[var(--accent-danger)]">
              {t("mission.conflict.title", { name: nameOf.get(c.personId) ?? "?", date })}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.tasks.map(({ item, board }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenTask(board.id, item.id)}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] px-3 py-1.5 text-left text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
                >
                  {item.name}
                  <span className="text-[var(--text-secondary)]"> · {workspaceName.get(board.workspace_id ?? "") ?? board.name}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
