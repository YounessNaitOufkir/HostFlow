"use client";

import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: "default" | "circular" | "text";
}

export function Skeleton({ className = "", variant = "default", ...props }: SkeletonProps) {
  const baseClasses = "skeleton transition-colors";
  const variantClasses = {
    default: "rounded-[6px]",
    circular: "rounded-full",
    text: "rounded-[6px] h-4 w-full",
  }[variant];

  return (
    <div
      className={`${baseClasses} ${variantClasses} ${className}`}
      {...props}
    />
  );
}

export default Skeleton;
