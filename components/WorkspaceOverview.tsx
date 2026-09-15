"use client";

import React from "react";
import { useT } from "@/components/LanguageProvider";
import { Workspace, Board } from "@/types";
import { LayoutGrid, MoreHorizontal } from "lucide-react";
import { TruncatedText } from "@/components/ui/TruncatedText";

interface WorkspaceOverviewProps {
  workspace: Workspace | null;
  workspaces: Workspace[];
  boards: Board[];
  onSelectBoard: (board: Board) => void;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateBoard?: () => void;
  onCreateWorkspace?: () => void;
  onImportData?: () => void;
}

export default function WorkspaceOverview({ workspace, workspaces, boards, onSelectBoard, onSelectWorkspace, onCreateBoard, onCreateWorkspace, onImportData }: WorkspaceOverviewProps) {
  const t = useT();
  if (!workspace) {
    return (
      <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#181b34] overflow-hidden">
        {/* Header */}
        <div className="pt-8 px-8 pb-4 shrink-0 border-b border-gray-200 dark:border-slate-800">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t("ws.title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">{t("ws.subtitle")}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-[#0e111a]">
          <div className="p-8 max-w-5xl mx-auto">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">{t("ws.all")}</h2>
            {workspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-gray-300 dark:border-slate-700 rounded-2xl bg-white/50 dark:bg-slate-900/20">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-4">
                  <LayoutGrid className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("ws.none")}</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                  {t("ws.noneBody")}
                </p>
                <button
                  onClick={onCreateWorkspace}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors"
                >
                  {t("ws.create")}
                </button>
              </div>
            ) : (
              /* Each workspace with the boards it contains, so this is somewhere
                 you can actually get work from rather than a list of names that
                 costs a click before it tells you anything. */
              <div className="space-y-8">
                {workspaces.map((ws) => {
                  const wsBoards = boards.filter((b) => b.workspace_id === ws.id);
                  return (
                    <section key={ws.id}>
                      <div className="flex items-center justify-between mb-3">
                        <button
                          onClick={() => onSelectWorkspace(ws)}
                          className="flex items-center gap-2 min-w-0 group text-left"
                        >
                          <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 group-hover:scale-105 transition-transform">
                            <LayoutGrid size={16} />
                          </span>
                          <h3 className="font-semibold text-gray-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            <TruncatedText className="truncate block">{ws.name}</TruncatedText>
                          </h3>
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3">
                          {wsBoards.length === 1
                            ? t("ws.boardCountOne")
                            : t("ws.boardCount", { count: wsBoards.length })}
                        </span>
                      </div>

                      {wsBoards.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-slate-700 rounded-xl px-4 py-5">
                          {t("ws.noBoardsYet")}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {wsBoards.map((board) => (
                            <div
                              key={board.id}
                              onClick={() => onSelectBoard(board)}
                              className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-5 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20 transition-all cursor-pointer group"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                                  <LayoutGrid size={20} />
                                </div>
                              </div>
                              <h3 className="font-semibold text-gray-800 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                                <TruncatedText className="truncate block">{board.name}</TruncatedText>
                              </h3>
                              <TruncatedText as="p" className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {board.description || t("ws.noDescription")}
                              </TruncatedText>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#181b34] overflow-hidden">
      {/* Header */}
      <div className="pt-8 px-8 pb-4 shrink-0 border-b border-gray-200 dark:border-slate-800">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {t("ws.overviewTitle", { name: workspace.name })}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-[#0e111a]">
        <div className="p-8 max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t("ws.recentBoards")}</h2>
            {boards.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={onImportData}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg shadow-sm transition-colors text-sm"
                >
                  {t("ws.importBoard")}
                </button>
                <button
                  onClick={onCreateBoard}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors text-sm"
                >
                  {t("ws.newBoard")}
                </button>
              </div>
            )}
          </div>

          {boards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-gray-300 dark:border-slate-700 rounded-2xl bg-white/50 dark:bg-slate-900/20">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4">
                <LayoutGrid className="w-8 h-8 text-blue-500 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("ws.noBoards")}</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                {t("ws.noBoardsBody")}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onCreateBoard}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors"
                >
                  {t("ws.createBoard")}
                </button>
                <button
                  onClick={onImportData}
                  className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg shadow-sm transition-colors"
                >
                  {t("ws.importBoard")}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.map(board => (
                <div
                  key={board.id}
                  onClick={() => onSelectBoard(board)}
                  className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-5 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                      <LayoutGrid size={20} />
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                  <h3 className="font-semibold text-gray-800 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                    <TruncatedText className="truncate block">{board.name}</TruncatedText>
                  </h3>
                  <TruncatedText as="p" className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {board.description || t("ws.noDescription")}
                  </TruncatedText>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
