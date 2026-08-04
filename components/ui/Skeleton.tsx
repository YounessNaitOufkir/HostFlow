"use client";

import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: "default" | "circular" | "text";
}

export function Skeleton({ className = "", variant = "default", ...props }: SkeletonProps) {
  const baseClasses = "animate-pulse bg-gray-200/80 dark:bg-slate-700/80 transition-colors";
  const variantClasses = {
    default: "rounded-md",
    circular: "rounded-full",
    text: "rounded h-4 w-full",
  }[variant];

  return (
    <div
      className={`${baseClasses} ${variantClasses} ${className}`}
      {...props}
    />
  );
}

export default Skeleton;
