"use client";

import React from "react";
import { X, Eye, Check, Type, Sparkles } from "lucide-react";
import { useFont } from "@/components/FontProvider";

interface ReadabilityModalProps {
  onClose: () => void;
}

export default function ReadabilityModal({ onClose }: ReadabilityModalProps) {
  const { currentFont, setFont, fontOptions } = useFont();

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/60 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Eye size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Readability & Appearance
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                  <Sparkles size={11} />
                  Live Preview
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Customize typography and legibility to fit your workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Section: Typography */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Type size={18} className="text-gray-700 dark:text-gray-300" />
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">
                  Typography & Legibility
                </h3>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Select your preferred font family
              </span>
            </div>

            {/* Font Grid (styled just like the Readability screenshot!) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {fontOptions.map((option) => {
                const isSelected = currentFont === option.id;
                return (
                  <div
                    key={option.id}
                    onClick={() => setFont(option.id)}
                    className={`group relative rounded-xl border-2 p-5 cursor-pointer transition-all flex flex-col justify-between select-none ${
                      isSelected
                        ? "border-blue-600 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-md ring-2 ring-blue-500/20"
                        : "border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/40 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm"
                    }`}
                  >
                    {/* Badge */}
                    <div className="flex items-center justify-between mb-3">
                      {option.badge ? (
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {option.badge}
                        </span>
                      ) : (
                        <span />
                      )}

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                          <Check size={14} className="stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Sample Text Preview inside card */}
                    <div
                      className="py-6 px-3 text-center rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700/60 my-2 min-h-[90px] flex items-center justify-center"
                      style={{ fontFamily: option.cssValue }}
                    >
                      <p className="text-sm md:text-base text-gray-800 dark:text-gray-100 leading-relaxed font-normal">
                        {option.sampleText}
                      </p>
                    </div>

                    {/* Font Name */}
                    <div className="mt-3 text-center">
                      <p
                        className="text-base font-bold text-gray-900 dark:text-white"
                        style={{ fontFamily: option.cssValue }}
                      >
                        {option.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                        {option.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Table Row Preview */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Live Table Preview
            </h4>
            <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
              <div className="grid grid-cols-12 bg-gray-50 dark:bg-slate-900/60 px-4 py-2 border-b border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-gray-300">
                <div className="col-span-6">Task Name</div>
                <div className="col-span-3 text-center">Status</div>
                <div className="col-span-3 text-center">Priority</div>
              </div>
              <div className="grid grid-cols-12 items-center px-4 py-3 text-sm text-gray-800 dark:text-gray-100">
                <div className="col-span-6 font-medium">
                  🚀 Launch HostFlow Design Upgrade
                </div>
                <div className="col-span-3 flex justify-center">
                  <span className="px-3 py-1 rounded bg-green-500 text-white text-xs font-semibold shadow-xs">
                    Done
                  </span>
                </div>
                <div className="col-span-3 flex justify-center">
                  <span className="px-3 py-1 rounded bg-red-500 text-white text-xs font-semibold shadow-xs">
                    High
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
