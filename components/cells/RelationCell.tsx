"use client";

import React, { useState, useRef, useEffect } from "react";
import { Item, Column, ItemLink } from "@/types";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { useBoardStore } from "@/hooks/useBoardStore";
import { Link2, Plus, X, Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

interface RelationCellProps {
  item: Item;
  column: Column;
}

export default function RelationCell({ item, column }: RelationCellProps) {
  const { state, addLink, removeLink } = useBoardStore();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [linkedItemsData, setLinkedItemsData] = useState<Item[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Find the links for this item
  const myLinks = React.useMemo(() => state.itemLinks.filter(
    (l) => (l.source_item_id === item.id || l.target_item_id === item.id) && l.link_type === "relation"
  ), [state.itemLinks, item.id]);

  // 2. We need the names of the linked items. Since they might be on other boards, 
  // we fetch them if they aren't in state.items.
  useEffect(() => {
    const fetchLinkedItems = async () => {
      if (myLinks.length === 0) {
        setLinkedItemsData([]);
        return;
      }
      
      const linkedIds = myLinks.map(l => l.source_item_id === item.id ? l.target_item_id : l.source_item_id);
      
      // Some might be on this board
      const localItems = state.items.filter(i => linkedIds.includes(i.id));
      const missingIds = linkedIds.filter(id => !localItems.find(i => i.id === id));
      
      let fetchedItems: Item[] = [];
      if (missingIds.length > 0) {
        const { data } = await supabase.from("items").select("*").in("id", missingIds);
        if (data) fetchedItems = data;
      }
      
      setLinkedItemsData([...localItems, ...fetchedItems]);
    };
    
    fetchLinkedItems();
  }, [myLinks.length, item.id, state.items]);

  // Handle outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const search = async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from("items")
        .select("*")
        .ilike("name", `%${searchQuery}%`)
        .limit(10);
      
      if (data) {
        // Filter out items already linked or self
        const linkedIds = myLinks.map(l => l.source_item_id === item.id ? l.target_item_id : l.source_item_id);
        setSearchResults(data.filter(i => i.id !== item.id && !linkedIds.includes(i.id)));
      }
      setIsSearching(false);
    };
    
    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, item.id, myLinks]);

  const handleAddLink = (targetItem: Item) => {
    addLink(item.id, targetItem.id, "relation");
    setSearchQuery("");
  };

  const handleRemoveLink = (e: React.MouseEvent, targetItemId: string) => {
    e.stopPropagation();
    const link = myLinks.find(l => l.source_item_id === targetItemId || l.target_item_id === targetItemId);
    if (link) removeLink(link.id);
  };

  return (
    <div className={`${column.width ? '' : 'w-48'} border-r border-gray-200 dark:border-slate-700/60 shrink-0 relative flex items-center p-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group`} style={{ width: column.width ? `${column.width}px` : undefined }}>
      <div
        className="w-full h-full flex items-center overflow-hidden min-h-[28px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {linkedItemsData.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            {linkedItemsData.map((linkedItem) => (
              <motion.span
                layoutId={`link-badge-${linkedItem.id}`}
                key={linkedItem.id}
                className="group/badge relative flex items-center text-[11px] bg-indigo-50/80 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 font-medium pl-2 pr-1 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-500/20 shadow-sm"
              >
                <TruncatedText className="truncate max-w-[80px]">{linkedItem.name}</TruncatedText>
                <button
                  onClick={(e) => handleRemoveLink(e, linkedItem.id)}
                  className="ml-1 text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors opacity-0 group-hover/badge:opacity-100"
                >
                  <X size={12} />
                </button>
              </motion.span>
            ))}
          </div>
        ) : (
          <div className="flex items-center text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
            <Plus size={14} className="mr-1" />
            <span className="text-xs">Add Relation</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            ref={dropdownRef}
            className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-800/95 backdrop-blur-xl border border-gray-100 dark:border-slate-700/60 shadow-xl rounded-xl z-50 overflow-hidden"
          >
            <div className="p-2 border-b border-gray-100 dark:border-slate-700/60 flex items-center bg-gray-50/50 dark:bg-slate-900/50">
              <Search size={14} className="text-gray-400 ml-1" />
              <input
                autoFocus
                type="text"
                placeholder="Search to link..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none focus:ring-0 text-sm px-2 text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
              />
              {isSearching && <Loader2 size={14} className="text-indigo-500 animate-spin mr-1" />}
            </div>

            <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
              {searchQuery && searchResults.length === 0 && !isSearching && (
                <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                  No matching items found
                </div>
              )}
              
              {!searchQuery && (
                <div className="p-3 text-center text-xs text-gray-400 dark:text-gray-500">
                  Type to search across all boards
                </div>
              )}

              {searchResults.map((res) => (
                <button
                  key={res.id}
                  onClick={() => handleAddLink(res)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg flex items-center justify-between group/btn transition-colors"
                >
                  <TruncatedText className="text-gray-700 dark:text-gray-200 truncate">{res.name}</TruncatedText>
                  <Link2 size={14} className="text-indigo-500 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
