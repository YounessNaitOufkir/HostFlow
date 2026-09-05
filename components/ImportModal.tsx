"use client";

import React, { useState, useRef } from "react";
import { useT } from "@/components/LanguageProvider";
import Papa from "papaparse";
import * as xlsx from "xlsx";
import { Upload, X, AlertCircle } from "lucide-react";
import { Board, Column } from "@/types";
import { parseDatabaseError } from "@/lib/errorReporting";

interface ImportModalProps {
  onClose: () => void;
  onImport: (config: ImportConfig) => Promise<void>;
  activeBoard: Board | null;
  activeBoardColumns: Column[];
}

/** One row of Monday's "updates" sheet, normalized. */
export interface ImportUpdate {
  /** Monday's item ID, used to attach the update to the imported item */
  mondayItemId: string;
  itemName: string;
  /** Monday display name of the author; matched against profiles.full_name */
  author: string;
  /** ISO timestamp, or null when Monday's date could not be parsed */
  createdAt: string | null;
  body: string;
  /** Monday's own post IDs, used to rebuild reply threading */
  postId: string;
  parentPostId: string;
  /** Set when Monday exported an attachment but no text */
  assetIds: string;
}

export interface ImportConfig {
  target: "new_board" | "existing_board";
  newBoardName?: string;
  data: any[];
  headers: string[];
  /** Parsed from the workbook's "updates" sheet, when present */
  updates?: ImportUpdate[];
}

const MONDAY_MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parses Monday's update timestamps, e.g. "18/February/2026  03:18:11 PM".
 * Treated as local wall-clock time. Falls back to Date parsing, then null.
 */
function parseMondayTimestamp(raw: any): string | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString();

  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/([A-Za-z]+)\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    const month = MONDAY_MONTHS[m[2].toLowerCase()];
    if (month !== undefined) {
      let hour = parseInt(m[4], 10) % 12;
      if (m[7].toUpperCase() === "PM") hour += 12;
      const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10), hour, parseInt(m[5], 10), parseInt(m[6], 10));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/**
 * Reads Monday's "updates" sheet. Locates the header row by looking for the
 * "Item ID" column rather than assuming a fixed offset, since Monday prefixes
 * the sheet with a board title row.
 */
function parseMondayUpdates(rawData: any[][]): ImportUpdate[] {
  if (!rawData || rawData.length === 0) return [];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const row = rawData[i] || [];
    if (row.some((c: any) => String(c || "").trim().toLowerCase() === "item id")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  // Monday emits two columns both named "Content Type"; indexOf keeps the first,
  // which is what we want for every field we actually read.
  const headers = (rawData[headerIdx] || []).map((h: any) => String(h || "").trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name);
  const idIdx = col("item id");
  const nameIdx = col("item name");
  const userIdx = col("user");
  const createdIdx = col("created at");
  const bodyIdx = col("update content");
  const assetIdx = col("asset ids");
  const postIdx = col("post id");
  const parentIdx = col("parent post id");

  const at = (row: any[], i: number) => (i >= 0 && row[i] != null ? String(row[i]).trim() : "");

  const updates: ImportUpdate[] = [];
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i] || [];
    const mondayItemId = at(row, idIdx);
    if (!mondayItemId) continue;

    updates.push({
      mondayItemId,
      itemName: at(row, nameIdx),
      author: at(row, userIdx),
      createdAt: parseMondayTimestamp(createdIdx >= 0 ? row[createdIdx] : null),
      body: bodyIdx >= 0 && row[bodyIdx] != null ? String(row[bodyIdx]) : "",
      postId: at(row, postIdx),
      parentPostId: at(row, parentIdx),
      assetIds: at(row, assetIdx),
    });
  }
  return updates;
}

export default function ImportModal({ onClose, onImport, activeBoard, activeBoardColumns }: ImportModalProps) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [updates, setUpdates] = useState<ImportUpdate[]>([]);
  const [target, setTarget] = useState<"new_board" | "existing_board">("new_board");
  const [newBoardName, setNewBoardName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    
    // Set a default board name from the filename
    setNewBoardName(uploadedFile.name.replace(/\.[^/.]+$/, ""));

    const extension = uploadedFile.name.split('.').pop()?.toLowerCase();

    const parseMondayRawData = (rawData: any[][]) => {
      let currentGroup = t("imp.importedGroup");
      let finalHeaders: string[] = [];
      let parsedData: any[] = [];
      let foundHeaders = false;

      for (const row of rawData) {
        // Skip completely empty rows
        if (!row || row.length === 0 || row.every((cell: any) => cell === "" || cell === null)) continue;
        
        const nonEmpties = row.filter((cell: any) => cell !== "" && cell !== null).length;
        
        // Check if this row looks like a header row
        const firstCellStr = String(row[0] || "").toLowerCase().trim();
        if (!foundHeaders && nonEmpties > 2 && (firstCellStr === "name" || firstCellStr === "item name" || firstCellStr === "task")) {
          finalHeaders = row.map((h: any, i: number) => h ? String(h).trim() : `Column_${i}`);
          if (!finalHeaders.find(h => h.toLowerCase() === "group")) {
             finalHeaders.push("Group");
          }
          foundHeaders = true;
          continue;
        }

        // If we already found headers, and this row is just repeating them (Monday repeats headers for each group), skip it
        if (foundHeaders && String(row[0]).trim() === finalHeaders[0]) {
          continue;
        }

        // If it's a row with only 1 value in the first column, it's likely a Group Title or Board Description
        if (nonEmpties === 1 && row[0]) {
          currentGroup = String(row[0]).trim();
          continue;
        }

        // If it's a data row and we have headers
        if (foundHeaders && nonEmpties > 0) {
          // SKIP summary rows (Monday often puts empty names for group summaries)
          if (!row[0] || String(row[0]).trim() === "") continue;

          const rowObj: any = {};
          for (let i = 0; i < finalHeaders.length; i++) {
            if (finalHeaders[i] !== "Group") {
              let cellVal = row[i];
              // Format dates properly if xlsx parsed them as Date objects.
              // xlsx builds Dates at LOCAL midnight, so toISOString() would shift
              // them to the previous day for any timezone east of UTC. Read the
              // local calendar parts instead so the date matches what the sheet shows.
              if (cellVal instanceof Date) {
                const y = cellVal.getFullYear();
                const m = String(cellVal.getMonth() + 1).padStart(2, "0");
                const d = String(cellVal.getDate()).padStart(2, "0");
                cellVal = `${y}-${m}-${d}`;
              }
              rowObj[finalHeaders[i]] = cellVal;
            }
          }
          rowObj["Group"] = currentGroup;
          parsedData.push(rowObj);
        }
      }
      
      return { parsedData, finalHeaders };
    };

    if (extension === "csv") {
      Papa.parse(uploadedFile, {
        header: false, // Must be false so we can parse Monday's weird structure
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setError(t("imp.errCsv"));
            return;
          }
          const { parsedData, finalHeaders } = parseMondayRawData(results.data as any[][]);
          if (parsedData.length > 0) {
            setData(parsedData);
            setHeaders(finalHeaders);
          } else {
            setError(t("imp.errCsvEmpty"));
          }
        },
        error: (err) => {
          setError(err.message);
        }
      });
    } else if (extension === "xlsx" || extension === "xls") {
      try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const workbook = xlsx.read(arrayBuffer, { type: "array", cellDates: true });
        
        // Find the sheet that likely contains the tasks (avoiding the Updates sheet)
        let sheetName = workbook.SheetNames[0];
        const taskSheet = workbook.SheetNames.find(s => !s.toLowerCase().includes("update"));
        if (taskSheet) {
          sheetName = taskSheet;
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const rawData = xlsx.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        
        const { parsedData, finalHeaders } = parseMondayRawData(rawData);

        // Monday exports item updates on a separate sheet, keyed by item ID
        const updatesSheet = workbook.SheetNames.find(s => s.toLowerCase().includes("update"));
        const parsedUpdates = updatesSheet
          ? parseMondayUpdates(xlsx.utils.sheet_to_json<any[]>(workbook.Sheets[updatesSheet], { header: 1, defval: "" }))
          : [];

        if (parsedData.length > 0) {
          setData(parsedData);
          setHeaders(finalHeaders);
          setUpdates(parsedUpdates);
        } else {
          setError(t("imp.errXlsxEmpty"));
        }
      } catch (err: any) {
        setError(err.message || t("imp.errXlsx"));
      }
    } else {
      setError(t("imp.errFormat"));
    }
  };

  const handleImport = async () => {
    if (target === "new_board" && !newBoardName.trim()) {
      setError(t("imp.errName"));
      return;
    }
    
    setIsImporting(true);
    setError("");
    
    try {
      await onImport({
        target,
        newBoardName,
        data,
        headers,
        updates
      });
      onClose();
    } catch (err: any) {
      setError(parseDatabaseError(err, err.message || t("imp.errImport")));
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("imp.title")}</h2>
          <button onClick={onClose} aria-label={t("imp.close")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 flex items-start gap-2 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!file ? (
            <div 
              className="border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={32} className="text-blue-500 mb-3" />
              <p className="text-gray-900 dark:text-white font-medium mb-1">{t("imp.drop")}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t("imp.dropHint")}
              </p>
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-green-100 text-green-600 flex items-center justify-center">
                    <span className="font-bold text-xs uppercase">{file.name.split('.').pop() || 'FILE'}</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {data.length === 1
                        ? t("imp.rowsOne")
                        : t("imp.rows", { count: data.length })}
                      {updates.length > 0 &&
                        ` · ${updates.length === 1
                          ? t("imp.updatesOne")
                          : t("imp.updates", { count: updates.length })}`}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setFile(null); setData([]); setHeaders([]); setUpdates([]); }}
                  className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white underline"
                >
                  {t("imp.changeFile")}
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{t("imp.destination")}</h3>
                
                <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <input 
                    type="radio" 
                    name="target" 
                    className="mt-1"
                    checked={target === "new_board"}
                    onChange={() => setTarget("new_board")}
                  />
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{t("imp.newBoard")}</p>
                    <p className="text-xs text-gray-500">{t("imp.newBoardHint")}</p>
                  </div>
                </label>

                {target === "new_board" && (
                  <div className="pl-7 pr-3 pb-3">
                    <input 
                      type="text" 
                      placeholder={t("imp.newBoardName")}
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                <label className={`flex items-start gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg ${activeBoard ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50' : 'opacity-50 cursor-not-allowed'}`}>
                  <input 
                    type="radio" 
                    name="target" 
                    className="mt-1"
                    checked={target === "existing_board"}
                    onChange={() => {
                      if (activeBoard) setTarget("existing_board");
                    }}
                    disabled={!activeBoard}
                  />
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{t("imp.current")}</p>
                    <p className="text-xs text-gray-500">
                      {activeBoard
                        ? t("imp.currentHint", { board: activeBoard.name })
                        : t("imp.noBoard")}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3 bg-gray-50 dark:bg-slate-800/30 rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            {t("imp.cancel")}
          </button>
          <button 
            onClick={handleImport}
            disabled={!file || isImporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("imp.importing")}
              </>
            ) : t("imp.import")}
          </button>
        </div>
      </div>
    </div>
  );
}
