"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Board, Item, Group, ItemLink, Profile, STATUS_OPTIONS } from "@/types";
import { format, differenceInDays, addDays, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, min, max } from "date-fns";
import { ChevronDown, Palette } from "lucide-react";

interface GanttViewProps {
  board: Board | null;
  items: Item[];
  groups: Group[];
  itemLinks?: ItemLink[];
  onUpdateItem?: (itemId: string, columnId: string, value: any) => void;
  onMoveItem?: (sourceId: string, targetId: string) => void;
  collapsedGroups?: string[];
  onToggleGroupCollapse?: (groupId: string) => void;
  profiles?: Profile[];
}

export default function GanttView({ board, items, groups, itemLinks = [], onUpdateItem, onMoveItem, collapsedGroups, onToggleGroupCollapse, profiles }: GanttViewProps) {
  const DAY_WIDTH = 50;
  const [leftColumnWidth, setLeftColumnWidth] = useState(300);
  const [colorBy, setColorBy] = useState<'group' | 'status'>('group');
  const [showColorByMenu, setShowColorByMenu] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isLeftColCollapsed, setIsLeftColCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [dragItem, setDragItem] = useState<{ id: string, startX: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const ganttItemsRef = useRef<any[]>([]);

  // Resize state: track which bar edge is being dragged
  const [resizeItem, setResizeItem] = useState<{ id: string; edge: 'left' | 'right'; startX: number } | null>(null);
  const [resizeOffset, setResizeOffset] = useState(0);

  // Vertical Dragging (Reordering) state
  const [draggedVerticalId, setDraggedVerticalId] = useState<string | null>(null);
  const [dragOverVerticalId, setDragOverVerticalId] = useState<string | null>(null);

  // Panning state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  const [panScrollLeft, setPanScrollLeft] = useState(0);
  const [panScrollTop, setPanScrollTop] = useState(0);

  const handlePanStart = (e: React.MouseEvent) => {
    // Only pan on left click and if not resizing or dragging an item
    if (isResizing || dragItem || resizeItem || e.button !== 0) return;
    setIsPanning(true);
    setPanStartX(e.clientX);
    setPanStartY(e.clientY);
    if (scrollContainerRef.current) {
      setPanScrollLeft(scrollContainerRef.current.scrollLeft);
      setPanScrollTop(scrollContainerRef.current.scrollTop);
    }
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning || !scrollContainerRef.current) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    scrollContainerRef.current.scrollLeft = panScrollLeft - dx;
    scrollContainerRef.current.scrollTop = panScrollTop - dy;
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        // Calculate new width relative to container left, with min/max bounds
        let newWidth = e.clientX - containerRect.left;
        newWidth = Math.max(150, Math.min(newWidth, 600)); // min 150px, max 600px
        setLeftColumnWidth(newWidth);
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Handle Dragging (move entire bar)
  const handleItemMouseMove = useCallback((e: MouseEvent) => {
    if (dragItem) {
      setDragOffset(e.clientX - dragItem.startX);
    }
  }, [dragItem]);

  const handleItemMouseUp = useCallback((e: MouseEvent) => {
    if (dragItem && onUpdateItem) {
      const shiftDays = Math.round(dragOffset / DAY_WIDTH);
      if (shiftDays !== 0) {
        const gi = ganttItemsRef.current.find(g => g.item.id === dragItem.id);
        if (gi) {
           let newVal;
           if (gi.colType === "date") {
             newVal = format(addDays(gi.start, shiftDays), "yyyy-MM-dd");
           } else {
             newVal = {
               start: format(addDays(gi.start, shiftDays), "yyyy-MM-dd"),
               end: format(addDays(gi.end, shiftDays), "yyyy-MM-dd")
             };
           }
           onUpdateItem(gi.item.id, gi.columnId, newVal);
        }
      }
      setDragItem(null);
      setDragOffset(0);
    }
  }, [dragItem, dragOffset, onUpdateItem]);

  useEffect(() => {
    if (dragItem) {
      window.addEventListener("mousemove", handleItemMouseMove);
      window.addEventListener("mouseup", handleItemMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleItemMouseMove);
      window.removeEventListener("mouseup", handleItemMouseUp);
    };
  }, [dragItem, handleItemMouseMove, handleItemMouseUp]);

  // Handle Resizing (drag left/right edge)
  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (resizeItem) {
      setResizeOffset(e.clientX - resizeItem.startX);
    }
  }, [resizeItem]);

  const handleResizeMouseUp = useCallback(() => {
    if (resizeItem && onUpdateItem) {
      const shiftDays = Math.round(resizeOffset / DAY_WIDTH);
      if (shiftDays !== 0) {
        const gi = ganttItemsRef.current.find(g => g.item.id === resizeItem.id);
        if (gi && gi.colType === "timeline") {
          if (resizeItem.edge === 'left') {
            const newStart = addDays(gi.start, shiftDays);
            // Don't allow start to go past end
            if (newStart <= gi.end) {
              onUpdateItem(gi.item.id, gi.columnId, {
                start: format(newStart, "yyyy-MM-dd"),
                end: format(gi.end, "yyyy-MM-dd")
              });
            }
          } else {
            const newEnd = addDays(gi.end, shiftDays);
            // Don't allow end to go before start
            if (newEnd >= gi.start) {
              onUpdateItem(gi.item.id, gi.columnId, {
                start: format(gi.start, "yyyy-MM-dd"),
                end: format(newEnd, "yyyy-MM-dd")
              });
            }
          }
        } else if (gi && gi.colType === "date") {
          // For single date columns, just shift the date
          onUpdateItem(gi.item.id, gi.columnId, format(addDays(gi.start, shiftDays), "yyyy-MM-dd"));
        }
      }
    }
    setResizeItem(null);
    setResizeOffset(0);
  }, [resizeItem, resizeOffset, onUpdateItem]);

  useEffect(() => {
    if (resizeItem) {
      window.addEventListener("mousemove", handleResizeMouseMove);
      window.addEventListener("mouseup", handleResizeMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleResizeMouseMove);
      window.removeEventListener("mouseup", handleResizeMouseUp);
    };
  }, [resizeItem, handleResizeMouseMove, handleResizeMouseUp]);

  // Find date or timeline columns
  const dateColumns = useMemo(() => {
    return board?.columns.filter(c => c.type === "date" || c.type === "timeline") || [];
  }, [board]);

  // Extract plottable items
  // Helper to extract hex color from Tailwind bg class like "bg-[#fdab3d]"
  const extractHex = (bgClass: string): string => {
    const match = bgClass.match(/#[0-9a-fA-F]{3,8}/);
    return match ? match[0] : '#c4c4c4';
  };

  // Find status columns for color-by-status
  const statusColumns = useMemo(() => {
    return board?.columns.filter(c => c.type === 'status') || [];
  }, [board]);

  type GanttRow = 
    | { type: 'group'; id: string; group: Group; start: Date; end: Date; color: string; groupTitle: string; groupColor: string }
    | { type: 'item'; id: string; item: Item; start: Date; end: Date; color: string; groupTitle: string; columnId: string; colType: string; groupColor: string; statusColor: string };

  const ganttRows = useMemo(() => {
    const rows: GanttRow[] = [];
    if (dateColumns.length === 0) return rows;

    const sortedGroups = [...groups].sort((a, b) => a.position - b.position);

    sortedGroups.forEach(group => {
      const groupItems = items.filter(i => i.group_id === group.id).sort((a, b) => a.position - b.position);
      
      let groupStart: Date | null = null;
      let groupEnd: Date | null = null;
      const plottedItems: GanttRow[] = [];

      groupItems.forEach(item => {
        let start: Date | null = null;
        let end: Date | null = null;
        let usedColId = "";
        let usedColType = "";

        for (const col of dateColumns) {
          const val = item.column_values[col.id];
          if (!val) continue;

          if (col.type === "date") {
            start = new Date(val);
            end = new Date(val);
            usedColId = col.id;
            usedColType = col.type;
          } else if (col.type === "timeline" && val.start && val.end) {
            start = new Date(val.start);
            end = new Date(val.end);
            usedColId = col.id;
            usedColType = col.type;
          }
          if (start && end) break;
        }

        // Determine status color
        let itemStatusColor = '#c4c4c4'; // default gray
        if (statusColumns.length > 0) {
          const firstStatusCol = statusColumns[0];
          const statusVal = item.column_values[firstStatusCol.id];
          if (statusVal) {
            const options = firstStatusCol.settings?.statusLabels || STATUS_OPTIONS;
            const opt = options.find((o: any) => o.label === statusVal);
            if (opt) itemStatusColor = extractHex(opt.color);
          }
        }

        if (start && end) {
          if (!groupStart || start < groupStart) groupStart = start;
          if (!groupEnd || end > groupEnd) groupEnd = end;
          plottedItems.push({ type: 'item', id: item.id, item, start, end, color: group.color || "#579bfc", groupTitle: group.title, columnId: usedColId, colType: usedColType, groupColor: group.color || '#579bfc', statusColor: itemStatusColor });
        }
      });

      if (plottedItems.length > 0 && groupStart && groupEnd) {
        rows.push({ type: 'group', id: `group-${group.id}`, group, start: groupStart, end: groupEnd, color: group.color || "#579bfc", groupTitle: group.title, groupColor: group.color || '#579bfc' });
        if (!collapsedGroups?.includes(group.id)) {
          rows.push(...plottedItems);
        }
      }
    });
    
    ganttItemsRef.current = rows.filter(r => r.type === 'item') as any;

    return rows;
  }, [items, dateColumns, groups, collapsedGroups, statusColumns]);

  // Calculate global start and end bounds
  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    if (ganttRows.length === 0) {
      // Default to current month if no data
      const today = new Date();
      return { 
        chartStart: startOfWeek(today), 
        chartEnd: addDays(today, 30), 
        totalDays: 30 
      };
    }

    const startDates = ganttRows.map(gi => gi.start);
    const endDates = ganttRows.map(gi => gi.end);

    // Buffer by 3 days before earliest and 7 days after latest
    const minStart = addDays(min(startDates), -3);
    const maxEnd = addDays(max(endDates), 7);
    
    const days = differenceInDays(maxEnd, minStart) + 1;

    return { chartStart: minStart, chartEnd: maxEnd, totalDays: days > 14 ? days : 14 };
  }, [ganttRows]);

  const daysArray = useMemo(() => {
    return Array.from({ length: totalDays }).map((_, i) => addDays(chartStart, i));
  }, [chartStart, totalDays]);

  if (!board) return null;

  if (dateColumns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-8">
        <div className="text-center bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gantt Chart Needs Dates</h2>
          <p className="text-gray-500 dark:text-gray-400">Add a <strong>Timeline</strong> or <strong>Date</strong> column to your board to use the Gantt chart.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden relative text-gray-800 dark:text-slate-300">
      {/* Settings Toolbar */}
      <div className="flex items-center justify-end px-8 pt-4 pb-2 z-[100] relative">
        <div className="relative">
          <button 
            onClick={() => setShowColorByMenu(!showColorByMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-[#252a3f] transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <Palette size={14} className="text-gray-500 dark:text-gray-400" />
            Color by
          </button>
          {showColorByMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] rounded-md shadow-lg z-50 overflow-hidden">
              <div className="p-2">
                <button 
                  onClick={() => { setColorBy('group'); setShowColorByMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${colorBy === 'group' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-300'}`}
                >
                  Group
                </button>
                <button 
                  onClick={() => { setColorBy('status'); setShowColorByMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors mt-1 ${colorBy === 'status' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-[#252a3f] text-gray-700 dark:text-gray-300'}`}
                >
                  Status
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto px-8 pb-8 gantt-scroll-container"
        onMouseDown={handlePanStart}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        style={{ cursor: isPanning ? 'grabbing' : 'auto' }}
      >
        <div ref={containerRef} className="bg-gray-50 dark:bg-[#0e111a] rounded-xl border border-gray-200 dark:border-[#1e2333] shadow-lg dark:shadow-2xl overflow-hidden min-w-max relative" style={{ cursor: isResizing ? 'col-resize' : 'default' }}>
          
          {/* Header Row (Months / Weeks) */}
          <div className="flex border-b border-gray-200 dark:border-[#1e2333] bg-white dark:bg-[#131722]">
            {/* Left label spacing */}
            <div 
              className="shrink-0 border-r border-gray-200 dark:border-[#1e2333] p-4 flex items-center bg-gray-50 dark:bg-[#0e111a] z-30 sticky left-0 shadow-[4px_0_12px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.5)] group/header transition-all duration-200 overflow-visible"
              style={{ width: isLeftColCollapsed ? '0px' : `${leftColumnWidth}px`, padding: isLeftColCollapsed ? '0' : undefined }}
            >
              {!isLeftColCollapsed && (
                <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-widest flex-1 truncate">Task / Item</span>
              )}
              {/* Resizer Handle */}
              {!isLeftColCollapsed && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/50 transition-colors z-40"
                  onMouseDown={startResizing}
                />
              )}
              {/* Collapse/Expand toggle button */}
              <button
                onClick={(e) => { e.stopPropagation(); setIsLeftColCollapsed(v => !v); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute z-50 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-[#1e2333] border border-gray-200 dark:border-[#2d3555] shadow-md hover:bg-gray-100 dark:hover:bg-[#252a3f] transition-all"
                style={{ right: '-12px', top: '50%', transform: 'translateY(-50%)' }}
                title={isLeftColCollapsed ? 'Expand task panel' : 'Collapse task panel'}
              >
                <ChevronDown 
                  size={12} 
                  className="text-gray-500 dark:text-gray-400"
                  style={{ transform: isLeftColCollapsed ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}
                />
              </button>
            </div>
            
            {/* Days axis */}
            <div className="flex-1 flex" style={{ minWidth: `${totalDays * DAY_WIDTH}px` }}>
              {daysArray.map((date, i) => (
                <div key={i} className={`flex-1 min-w-[${DAY_WIDTH}px] flex flex-col items-center justify-end pb-3 border-r border-gray-200 dark:border-[#1e2333] last:border-r-0 pt-2`} style={{ minWidth: `${DAY_WIDTH}px` }}>
                  <span className="text-[10px] font-medium text-gray-500 dark:text-slate-500 uppercase">{format(date, "EEE")}</span>
                  <span className={`text-xs font-semibold mt-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                    isSameDay(date, new Date()) 
                      ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' 
                      : 'text-gray-700 dark:text-slate-300'
                  }`}>
                    {format(date, "d")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Grid Body */}
          <div className="flex flex-col relative" style={{ pointerEvents: isResizing ? 'none' : 'auto' }}>
            {/* Vertical lines for days (Background layer) */}
            <div className="absolute top-0 bottom-0 right-0 flex pointer-events-none opacity-40 z-0" style={{ left: `${isLeftColCollapsed ? 0 : leftColumnWidth}px`, minWidth: `${totalDays * DAY_WIDTH}px` }}>
              {daysArray.map((date, i) => {
                const isToday = isSameDay(date, new Date());
                return (
                  <div key={i} className={`flex-1 border-r border-gray-200 dark:border-[#1e2333] relative ${isToday ? 'bg-blue-100 dark:bg-blue-900/10' : ''}`} style={{ minWidth: `${DAY_WIDTH}px` }}>
                    {isToday && (
                      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-blue-500/60 shadow-[0_0_12px_rgba(59,130,246,1)] -translate-x-1/2 z-0"></div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Gantt Rows */}
            {ganttRows.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-slate-500 z-10 relative">No items with valid dates found.</div>
            ) : (
              ganttRows.map((gi) => {
                // Calculate grid column positioning
                const startIndex = differenceInDays(gi.start, chartStart);
                const endIndex = differenceInDays(gi.end, chartStart);
                
                // Ensure bounds
                const safeStart = Math.max(0, startIndex);
                const safeEnd = Math.min(totalDays - 1, endIndex);
                const duration = safeEnd - safeStart + 1;

                // Calculate percentages for CSS placement
                const leftPercent = (safeStart / totalDays) * 100;
                const widthPercent = (duration / totalDays) * 100;

                if (gi.type === 'group') {
                  return (
                    <div key={gi.id} className="flex h-[40px] border-b border-gray-200 dark:border-[#1e2333] bg-gray-100 dark:bg-[#1a1e2d] transition-colors z-20 relative group/row">
                       <div 
                         className="shrink-0 border-r border-gray-200 dark:border-[#1e2333] px-4 sticky left-0 flex items-center shadow-[4px_0_12px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.5)] cursor-pointer hover:bg-gray-200 dark:hover:bg-[#252a3f] transition-all z-30 bg-gray-50 dark:bg-[#0e111a] overflow-hidden duration-200"
                         style={{ width: isLeftColCollapsed ? '0px' : `${leftColumnWidth}px`, padding: isLeftColCollapsed ? '0' : undefined }}
                         onClick={() => onToggleGroupCollapse?.(gi.group.id)}
                       >
                         <ChevronDown 
                           size={16} 
                           className="mr-2 text-gray-500 dark:text-gray-400"
                           style={{ 
                             transform: collapsedGroups?.includes(gi.group.id) ? "rotate(-90deg)" : "rotate(0deg)",
                             transition: "transform 0.2s ease-in-out"
                           }} 
                         />
                         <div className="w-2.5 h-2.5 rounded-full mr-2.5 shrink-0 shadow-sm" style={{ backgroundColor: gi.color }}></div>
                         <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm truncate">{gi.groupTitle}</span>
                       </div>
                       
                       <div className="flex-1 relative py-2" style={{ minWidth: `${totalDays * DAY_WIDTH}px` }}>
                         {/* Summary bar: only visible when group is collapsed */}
                         {collapsedGroups?.includes(gi.group.id) && (
                           <div 
                             className="absolute top-1/2 rounded-full overflow-hidden opacity-40 pointer-events-none"
                             style={{ 
                               left: `calc(${leftPercent}% + 4px)`, 
                               width: `calc(${widthPercent}% - 8px)`,
                               height: '6px',
                               backgroundColor: gi.color,
                               transform: `translate(0, -50%)`,
                             }}
                           />
                         )}
                       </div>
                    </div>
                  );
                }

                const isDraggingThis = dragItem?.id === gi.item.id;
                const activeDragOffset = isDraggingThis ? dragOffset : 0;
                const isResizingThis = resizeItem?.id === gi.item.id;

                let assigneeNames = "";
                const peopleCols = board?.columns.filter(c => c.type === 'people') || [];
                const userIds: string[] = [];
                peopleCols.forEach(col => {
                  const val = gi.item.column_values[col.id];
                  if (val) {
                    let parsed = val;
                    if (typeof val === 'string' && val.startsWith('[')) {
                       try { parsed = JSON.parse(val); } catch(e){}
                    }
                    if (Array.isArray(parsed)) {
                      userIds.push(...parsed.filter(id => typeof id === 'string'));
                    } else if (typeof parsed === 'string') {
                      userIds.push(parsed);
                    }
                  }
                });
                if (userIds.length > 0 && profiles) {
                  const names = userIds.map(id => profiles.find(p => p.id === id)?.full_name || null).filter(Boolean);
                  assigneeNames = Array.from(new Set(names)).join(", ");
                }

                return (
                  <div key={gi.item.id} className={`flex h-[60px] border-b border-gray-200 dark:border-[#1e2333] hover:bg-white dark:hover:bg-[#131722] transition-colors relative group/row ${isResizingThis || isDraggingThis ? 'z-50' : 'z-10'}`}>
                    {/* Item Name */}
                    <div 
                      draggable={!!onMoveItem}
                      onDragStart={(e) => {
                        setDraggedVerticalId(gi.item.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const draggedGi = ganttRows.find(g => g.type === 'item' && g.item.id === draggedVerticalId) as any;
                        if (draggedGi && draggedGi.item.group_id !== gi.item.group_id) return; // Disallow dropping on different group
                        if (dragOverVerticalId !== gi.item.id && draggedVerticalId !== gi.item.id) {
                          setDragOverVerticalId(gi.item.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverVerticalId === gi.item.id) setDragOverVerticalId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const draggedGi = ganttRows.find(g => g.type === 'item' && g.item.id === draggedVerticalId) as any;
                        if (draggedGi && draggedGi.item.group_id !== gi.item.group_id) {
                          setDragOverVerticalId(null);
                          setDraggedVerticalId(null);
                          return;
                        }
                        if (draggedVerticalId && draggedVerticalId !== gi.item.id && onMoveItem) {
                          onMoveItem(draggedVerticalId, gi.item.id);
                        }
                        setDragOverVerticalId(null);
                        setDraggedVerticalId(null);
                      }}
                      onDragEnd={() => {
                        setDragOverVerticalId(null);
                        setDraggedVerticalId(null);
                      }}
                      className={`shrink-0 border-r border-gray-200 dark:border-[#1e2333] px-4 bg-gray-50 dark:bg-[#0e111a] group-hover/row:bg-white dark:group-hover/row:bg-[#131722] z-30 sticky left-0 flex items-center justify-between transition-all duration-200 shadow-[4px_0_12px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_12px_rgba(0,0,0,0.5)] overflow-hidden ${dragOverVerticalId === gi.item.id ? 'border-t-2 border-t-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''} ${draggedVerticalId === gi.item.id ? 'opacity-50' : ''}`}
                      style={{ width: isLeftColCollapsed ? '0px' : `${leftColumnWidth}px`, padding: isLeftColCollapsed ? '0' : undefined, cursor: onMoveItem ? 'grab' : 'default' }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col min-w-0 pr-2 pl-8 flex-1 relative">
                        {colorBy === 'status' && (
                          <div 
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full shadow-sm" 
                            style={{ backgroundColor: gi.groupColor }} 
                            title={`Group: ${gi.groupTitle}`} 
                          />
                        )}
                        <span className="truncate text-[13px] font-normal text-gray-700 dark:text-slate-300 group-hover/row:text-blue-600 dark:group-hover/row:text-white transition-colors" title={gi.item.name}>
                          {gi.item.name}
                        </span>
                      </div>
                      <div className="shrink-0 text-[13px] font-normal text-gray-600 dark:text-gray-400 whitespace-nowrap pl-2">
                        {isSameDay(gi.start, gi.end) 
                          ? format(gi.start, "MMM d") 
                          : `${format(gi.start, "MMM d")} - ${format(gi.end, gi.start.getMonth() === gi.end.getMonth() ? "d" : "MMM d")}`
                        }
                      </div>
                    </div>
                    
                    {/* Gantt Track */}
                    <div className="flex-1 relative py-2.5" style={{ minWidth: `${totalDays * DAY_WIDTH}px` }}>
                      {(() => {
                        const resizeEdge = isResizingThis ? resizeItem!.edge : null;
                        const activeResizeOffset = isResizingThis ? resizeOffset : 0;

                        // Compute adjusted left/width based on resize
                        let barLeftPx = (safeStart / totalDays) * 100;
                        let barWidthPx = (duration / totalDays) * 100;

                        if (isResizingThis) {
                          const dayShift = activeResizeOffset / DAY_WIDTH;
                          const dayShiftPercent = (dayShift / totalDays) * 100;
                          if (resizeEdge === 'left') {
                            barLeftPx += dayShiftPercent;
                            barWidthPx -= dayShiftPercent;
                          } else {
                            barWidthPx += dayShiftPercent;
                          }
                        }

                        const activeColor = colorBy === 'status' ? gi.statusColor : gi.groupColor;

                        return (
                          <>
                            <div 
                              className={`absolute top-1/2 rounded-sm group/bar flex items-center border border-white/20 transition-all ${onUpdateItem && !isResizingThis ? 'cursor-grab active:cursor-grabbing' : ''} ${isDraggingThis ? 'opacity-80 scale-105 shadow-xl z-50' : ''}`}
                              style={{ 
                                left: `calc(${barLeftPx}% + 4px)`, 
                                width: `calc(${barWidthPx}% - 8px)`,
                                backgroundColor: activeColor,
                                boxShadow: `0 0 14px 1px ${activeColor}60`,
                                transform: isDraggingThis ? `translate(${activeDragOffset}px, -50%)` : `translate(0, -50%)`,
                                transitionDuration: (isDraggingThis || isResizingThis) ? '0ms' : '200ms',
                                minWidth: '8px',
                              }}
                              onMouseDown={(e) => {
                                if (!onUpdateItem) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setDragItem({ id: gi.item.id, startX: e.clientX });
                                setDragOffset(0);
                              }}
                            >
                              {/* Left resize handle */}
                              {onUpdateItem && gi.colType === 'timeline' && (
                                <div 
                                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-white/30 transition-colors rounded-l-sm"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setResizeItem({ id: gi.item.id, edge: 'left', startX: e.clientX });
                                    setResizeOffset(0);
                                  }}
                                />
                              )}
                              
                              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/bar:opacity-100 transition-opacity"></div>
                              <span className="text-[10px] text-white font-bold px-2 truncate drop-shadow-md z-10 relative opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none">
                                {format(gi.start, "MMM d")} - {format(gi.end, "MMM d")}
                              </span>
                              {/* Shimmer effect */}
                              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover/bar:animate-[shimmer_1.5s_infinite] z-0 pointer-events-none"></div>

                              {/* Right resize handle */}
                              {onUpdateItem && gi.colType === 'timeline' && (
                                <div 
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-white/30 transition-colors rounded-r-sm"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setResizeItem({ id: gi.item.id, edge: 'right', startX: e.clientX });
                                    setResizeOffset(0);
                                  }}
                                />
                              )}
                            </div>

                            {/* Resize tooltip */}
                            {isResizingThis && (() => {
                              const leftDayShift = Math.round(activeResizeOffset / DAY_WIDTH);
                              const previewStart = resizeEdge === 'left' ? addDays(gi.start, leftDayShift) : gi.start;
                              const previewEnd = resizeEdge === 'right' ? addDays(gi.end, leftDayShift) : gi.end;
                              const durationDays = differenceInDays(previewEnd, previewStart) + 1;
                              return (
                                <div 
                                  className="absolute z-[100] pointer-events-none"
                                  style={{ 
                                    left: `calc(${barLeftPx}% + 4px)`, 
                                    width: `calc(${barWidthPx}% - 8px)`,
                                    bottom: '50%',
                                    marginBottom: '22px',
                                  }}
                                >
                                  <div className="bg-gray-900 text-white rounded-md px-3 py-1.5 shadow-lg flex items-center justify-between gap-3 text-xs font-semibold whitespace-nowrap min-w-max mx-auto" style={{ width: 'fit-content' }}>
                                    <span className="text-gray-400">{durationDays}d</span>
                                    <span>{format(previewStart, "MMM d")}</span>
                                    <span className="text-gray-500">—</span>
                                    <span>{format(previewEnd, "MMM d")}</span>
                                  </div>
                                </div>
                              );
                            })()}

                            {assigneeNames && (
                              <span 
                                className="absolute top-1/2 -translate-y-1/2 text-[12px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap pl-3"
                                style={{ left: `calc(${barLeftPx + barWidthPx}%)` }}
                              >
                                {assigneeNames}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )}

            <svg className="absolute inset-0 pointer-events-none z-20" style={{ width: '100%', height: '100%', minHeight: `${ganttRows.reduce((sum, r) => sum + (r.type === 'group' ? 40 : 60), 0)}px` }}>
              {(() => {
                const dependencyColumns = board?.columns.filter(c => c.type === "dependency") || [];
                if (dependencyColumns.length === 0) return null;

                const itemsOnly = ganttRows.filter(r => r.type === 'item') as Extract<typeof ganttRows[0], { type: 'item' }>[];
                const linksToDraw: { id: string; source: typeof itemsOnly[0]; target: typeof itemsOnly[0]; sourceIndex: number; targetIndex: number }[] = [];

                itemsOnly.forEach((targetGi, targetIndex) => {
                  dependencyColumns.forEach(col => {
                    let val = targetGi.item.column_values[col.id];
                    if (!val) return;
                    if (typeof val === "string" && val.startsWith("[")) {
                      try { val = JSON.parse(val); } catch (e) {}
                    }
                    
                    const sourceIds = Array.isArray(val) ? val : (typeof val === "string" ? [val] : []);
                    
                    sourceIds.forEach(sourceId => {
                      const sourceGi = itemsOnly.find(gi => gi.item.id === sourceId);
                      if (sourceGi) {
                        const sourceIndex = ganttRows.findIndex(r => r.id === sourceGi.id);
                        const actualTargetIndex = ganttRows.findIndex(r => r.id === targetGi.id);
                        linksToDraw.push({ id: `${sourceId}-${targetGi.item.id}`, source: sourceGi, target: targetGi, sourceIndex, targetIndex: actualTargetIndex });
                      }
                    });
                  });
                });

                // Also draw manual links from state
                itemLinks.forEach(link => {
                  const sourceGi = itemsOnly.find(gi => gi.item.id === link.source_item_id);
                  const targetGi = itemsOnly.find(gi => gi.item.id === link.target_item_id);
                  if (sourceGi && targetGi) {
                    const sourceIndex = ganttRows.findIndex(r => r.id === sourceGi.id);
                    const actualTargetIndex = ganttRows.findIndex(r => r.id === targetGi.id);
                    // Avoid duplicate lines if it was already drawn via column
                    if (!linksToDraw.find(l => l.source.item.id === sourceGi.item.id && l.target.item.id === targetGi.item.id)) {
                      linksToDraw.push({ id: link.id, source: sourceGi, target: targetGi, sourceIndex, targetIndex: actualTargetIndex });
                    }
                  }
                });

                return linksToDraw.map(link => {
                  const sourceGi = link.source;
                  const targetGi = link.target;
                  const sourceIndex = link.sourceIndex;
                  const targetIndex = link.targetIndex;

                  const effectiveLeftWidth = isLeftColCollapsed ? 0 : leftColumnWidth;

                  const sourceSafeStart = Math.max(0, differenceInDays(sourceGi.start, chartStart));
                  const sourceSafeEnd = Math.min(totalDays - 1, differenceInDays(sourceGi.end, chartStart));
                  const sourceDuration = sourceSafeEnd - sourceSafeStart + 1;
                  const sourceEndX = effectiveLeftWidth + (sourceSafeStart + sourceDuration) * DAY_WIDTH - 4;
                  
                  let sourceY = 0;
                  for (let i = 0; i < sourceIndex; i++) {
                    sourceY += ganttRows[i].type === 'group' ? 40 : 60;
                  }
                  sourceY += 30; // middle of item row

                  const targetSafeStart = Math.max(0, differenceInDays(targetGi.start, chartStart));
                  const targetStartX = effectiveLeftWidth + (targetSafeStart * DAY_WIDTH) + 4;
                  
                  let targetY = 0;
                  for (let i = 0; i < targetIndex; i++) {
                    targetY += ganttRows[i].type === 'group' ? 40 : 60;
                  }
                  targetY += 30;

                  // Orthogonal routing logic
                  const x1 = sourceEndX;
                  const y1 = sourceY;
                  const x2 = targetStartX;
                  const y2 = targetY;
                  const margin = 12;

                  let pathD = "";
                  const r = 5; // corner radius

                  if (x2 > x1 + margin * 2) {
                    // Target is comfortably to the right
                    const midX = x1 + margin;
                    const dirY = y2 > y1 ? 1 : -1;
                    
                    if (Math.abs(y2 - y1) < 2 * r) {
                      pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 - 2} ${y2}`;
                    } else {
                      pathD = `M ${x1} ${y1} L ${midX - r} ${y1} Q ${midX} ${y1}, ${midX} ${y1 + dirY * r} L ${midX} ${y2 - dirY * r} Q ${midX} ${y2}, ${midX + r} ${y2} L ${x2 - 2} ${y2}`;
                    }
                  } else {
                    // Target is behind or overlapping
                    const midX1 = x1 + margin;
                    const midY = (y1 + y2) / 2;
                    const midX2 = x2 - margin;
                    const dirY1 = midY > y1 ? 1 : -1;
                    const dirY2 = y2 > midY ? 1 : -1;

                    if (Math.abs(midY - y1) < 2 * r || Math.abs(midX1 - midX2) < 2 * r) {
                      pathD = `M ${x1} ${y1} L ${midX1} ${y1} L ${midX1} ${midY} L ${midX2} ${midY} L ${midX2} ${y2} L ${x2 - 2} ${y2}`;
                    } else {
                      pathD = `M ${x1} ${y1} L ${midX1 - r} ${y1} Q ${midX1} ${y1}, ${midX1} ${y1 + dirY1 * r} L ${midX1} ${midY - dirY1 * r} Q ${midX1} ${midY}, ${midX1 - r} ${midY} L ${midX2 + r} ${midY} Q ${midX2} ${midY}, ${midX2} ${midY + dirY2 * r} L ${midX2} ${y2 - dirY2 * r} Q ${midX2} ${y2}, ${midX2 + r} ${y2} L ${x2 - 2} ${y2}`;
                    }
                  }

                  return (
                    <g key={link.id}>
                      <defs>
                        <marker
                          id={`arrowhead-${link.id}`}
                          markerWidth="8"
                          markerHeight="8"
                          refX="8"
                          refY="4"
                          orient="auto"
                        >
                          <path d="M 0 0 L 8 4 L 0 8 z" fill={sourceGi.color} />
                        </marker>
                      </defs>
                      <path
                        d={pathD}
                        fill="none"
                        stroke={sourceGi.color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        markerEnd={`url(#arrowhead-${link.id})`}
                        className="transition-all duration-300"
                        style={{ filter: `drop-shadow(0 0 4px ${sourceGi.color}80)` }}
                      />
                    </g>
                  );
                });
              })()}
            </svg>
          </div>

        </div>
      </div>
    </div>
  );
}
