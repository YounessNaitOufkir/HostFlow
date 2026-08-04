"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";
import * as xlsx from "xlsx";
import { Upload, X, AlertCircle } from "lucide-react";
import { Board, Column } from "@/types";

interface ImportModalProps {
  onClose: () => void;
  onImport: (config: ImportConfig) => Promise<void>;
  activeBoard: Board | null;
  activeBoardColumns: Column[];
}

export interface ImportConfig {
  target: "new_board" | "existing_board";
  newBoardName?: string;
  data: any[];
  headers: string[];
}

export default function ImportModal({ onClose, onImport, activeBoard, activeBoardColumns }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
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

    if (extension === "csv") {
      Papa.parse(uploadedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setError("Error parsing CSV file.");
            return;
          }
          setData(results.data);
          setHeaders(results.meta.fields || []);
        },
        error: (err) => {
          setError(err.message);
        }
      });
    } else if (extension === "xlsx" || extension === "xls") {
      try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const workbook = xlsx.read(arrayBuffer, { type: "array", cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse as 2D array to handle Monday.com's weird visual grouping
        const rawData = xlsx.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
        
        let currentGroup = "Imported Group";
        let finalHeaders: string[] = [];
        let parsedData: any[] = [];
        let foundHeaders = false;

        for (const row of rawData) {
          // Skip completely empty rows
          if (!row || row.length === 0 || row.every((cell: any) => cell === "" || cell === null)) continue;
          
          const nonEmpties = row.filter((cell: any) => cell !== "" && cell !== null).length;
          
          // Check if this row looks like a header row (e.g. starts with "Name", "Item Name", or "Task")
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
            const rowObj: any = {};
            for (let i = 0; i < finalHeaders.length; i++) {
              if (finalHeaders[i] !== "Group") {
                let cellVal = row[i];
                // Format dates properly if xlsx parsed them as Date objects
                if (cellVal instanceof Date) {
                  cellVal = cellVal.toISOString().split('T')[0];
                }
                rowObj[finalHeaders[i]] = cellVal;
              }
            }
            rowObj["Group"] = currentGroup;
            parsedData.push(rowObj);
          }
        }
        
        if (parsedData.length > 0) {
          setData(parsedData);
          setHeaders(finalHeaders);
        } else {
          setError("Could not find any valid data in the spreadsheet.");
        }
      } catch (err: any) {
        setError(err.message || "Error reading Excel file.");
      }
    } else {
      setError("Unsupported file format. Please upload CSV or Excel files.");
    }
  };

  const handleImport = async () => {
    if (target === "new_board" && !newBoardName.trim()) {
      setError("Please provide a name for the new board.");
      return;
    }
    
    setIsImporting(true);
    setError("");
    
    try {
      await onImport({
        target,
        newBoardName,
        data,
        headers
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to import data.");
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
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
              <p className="text-gray-900 dark:text-white font-medium mb-1">Click to upload Data</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Drag and drop your .csv or .xlsx file here, or click to browse
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
                    <p className="text-xs text-gray-500">{data.length} rows detected</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setFile(null); setData([]); setHeaders([]); }}
                  className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white underline"
                >
                  Change File
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Import Destination</h3>
                
                <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <input 
                    type="radio" 
                    name="target" 
                    className="mt-1"
                    checked={target === "new_board"}
                    onChange={() => setTarget("new_board")}
                  />
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">Create New Board</p>
                    <p className="text-xs text-gray-500">A new board will be created with columns generated from your CSV headers.</p>
                  </div>
                </label>

                {target === "new_board" && (
                  <div className="pl-7 pr-3 pb-3">
                    <input 
                      type="text" 
                      placeholder="New Board Name"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    <p className="font-medium text-sm text-gray-900 dark:text-white">Import into Current Board</p>
                    <p className="text-xs text-gray-500">
                      {activeBoard ? `Append data to "${activeBoard.name}". We will try to map columns automatically.` : "No active board selected."}
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
            Cancel
          </button>
          <button 
            onClick={handleImport}
            disabled={!file || isImporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing...
              </>
            ) : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
