"use client";

import React, { useState, useRef } from "react";
import { Item, Column } from "@/types";
import { supabase } from "@/lib/supabase";
import { Paperclip, Loader2, X } from "lucide-react";

interface FilesCellProps {
  item: Item;
  column: Column;
  onUpdate: (itemId: string, columnId: string, value: any) => void;
}

export default function FilesCell({ item, column, onUpdate }: FilesCellProps) {
  // Files stored as array of URLs/Paths
  const files: string[] = Array.isArray(item.column_values?.[column.id]) 
    ? item.column_values[column.id] 
    : [];

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setIsUploading(true);
    try {
      const fileName = `${item.id}-${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);
        
      if (error) {
        console.error("Upload error:", error);
        alert("Failed to upload file. Ensure the 'attachments' bucket exists.");
      } else if (data) {
        // Get public URL
        const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(data.path);
        const newFiles = [...files, publicData.publicUrl];
        onUpdate(item.id, column.id, newFiles);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (e: React.MouseEvent, indexToRemove: number) => {
    e.stopPropagation();
    const newFiles = files.filter((_, idx) => idx !== indexToRemove);
    onUpdate(item.id, column.id, newFiles);
  };

  return (
    <div 
      className={`${column.width ? '' : 'w-40'} border-r border-gray-200 dark:border-slate-700 shrink-0 flex items-center justify-center p-2 relative group overflow-hidden cursor-pointer transition-colors`} style={{ width: column.width ? `${column.width}px` : undefined }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleUpload} 
        className="hidden" 
      />

      {isUploading ? (
        <Loader2 size={16} className="animate-spin text-blue-500" />
      ) : files.length > 0 ? (
        <div className="flex -space-x-2">
          {files.map((fileUrl, idx) => (
            <div 
              key={idx} 
              className={`${column.width ? '' : 'w-8'} h-8 rounded-full bg-gray-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 flex items-center justify-center relative group/file cursor-pointer`} style={{ width: column.width ? `${column.width}px` : undefined }}
              onClick={(e) => { e.stopPropagation(); window.open(fileUrl, '_blank'); }}
            >
              {/* If image, try to render. If not, render icon. For simplicity, just icon for now */}
              {fileUrl.match(/\.(jpeg|jpg|gif|png)$/i) != null ? (
                <img src={fileUrl} alt="attachment" className="w-full h-full object-cover rounded-full" />
              ) : (
                <Paperclip size={12} className="text-gray-500 dark:text-gray-400" />
              )}
              {/* Delete button (small X in corner) */}
              <button 
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover/file:opacity-100 flex items-center justify-center transition-opacity hover:bg-red-600"
                onClick={(e) => removeFile(e, idx)}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="p-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 hover:text-blue-500 hover:bg-blue-50 transition-colors">
            <Paperclip size={16} />
          </div>
        </div>
      )}
    </div>
  );
}
