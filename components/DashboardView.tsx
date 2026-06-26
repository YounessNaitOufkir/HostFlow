"use client";

import React, { useMemo } from "react";
import { Board, Group, Item, STATUS_OPTIONS } from "@/types";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { CheckCircle, AlertTriangle, ListTodo, CalendarClock } from "lucide-react";

interface DashboardViewProps {
  board: Board | null;
  groups: Group[];
  items: Item[];
}

export default function DashboardView({ board, groups, items }: DashboardViewProps) {
  
  // Calculate Analytics Data
  const analytics = useMemo(() => {
    let totalItems = items.length;
    let completed = 0;
    let stuck = 0;
    let empty = 0;
    let working = 0;

    const statusCounts: Record<string, number> = {};

    items.forEach(item => {
      // Find status columns
      const statusCols = board?.columns.filter(c => c.type === "status") || [];
      if (statusCols.length > 0) {
        // Just look at the first status column for primary metrics
        const mainStatusCol = statusCols[0];
        const val = item.column_values[mainStatusCol.id] || "Empty";
        
        statusCounts[val] = (statusCounts[val] || 0) + 1;

        if (val === "Done") completed++;
        else if (val === "Stuck") stuck++;
        else if (val === "Empty") empty++;
        else if (val === "Working on it") working++;
      }
    });

    // Format for Recharts
    const statusData = Object.keys(statusCounts).map(key => ({
      name: key,
      value: statusCounts[key],
      color: STATUS_OPTIONS.find(opt => opt.label === key)?.color?.replace("bg-[", "").replace("]", "") || "#c4c4c4"
    }));

    return { totalItems, completed, stuck, working, empty, statusData };
  }, [items, board]);

  if (!board) return null;

  return (
    <div className="flex-1 overflow-auto bg-[#f5f6f8] dark:bg-slate-950 p-8">
      <div className="max-w-[1200px] mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
            {board.name} Analytics
          </h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: Just now
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm">Total Tasks</h3>
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <ListTodo size={20} className="text-blue-500" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">{analytics.totalItems}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm">Completed</h3>
              <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-lg">
                <CheckCircle size={20} className="text-[#00c875]" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">{analytics.completed}</div>
            <div className="text-xs text-green-500 font-medium mt-2">
              {analytics.totalItems ? Math.round((analytics.completed / analytics.totalItems) * 100) : 0}% of total
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm">Working On It</h3>
              <div className="p-2 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                <CalendarClock size={20} className="text-[#fdab3d]" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">{analytics.working}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm">Stuck</h3>
              <div className="p-2 bg-red-50 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle size={20} className="text-[#e2445c]" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">{analytics.stuck}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6">Status Breakdown</h3>
            <div className="h-64">
              {analytics.statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {analytics.statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">No status data available</div>
              )}
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
              {analytics.statusData.map((s, i) => (
                <div key={i} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                  <div className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: s.color }}></div>
                  {s.name} ({s.value})
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6">Group Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={groups.map(g => ({
                    name: g.title,
                    tasks: items.filter(i => i.group_id === g.id).length,
                    color: g.color
                  }))}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="tasks" radius={[4, 4, 0, 0]}>
                    {groups.map((g, idx) => (
                      <Cell key={`cell-${idx}`} fill={g.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
