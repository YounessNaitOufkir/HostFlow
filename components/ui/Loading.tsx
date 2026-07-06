// ============================================================
// Modern Loading Components
// Inspired by Aceternity UI and modern design patterns
// ============================================================

"use client";

import React from "react";

// ============================================================
// Skeleton Loaders
// ============================================================

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ 
  className = "", 
  variant = "rounded",
  width,
  height 
}: SkeletonProps) {
  const variantClasses = {
    text: "rounded",
    circular: "rounded-full",
    rectangular: "rounded-none",
    rounded: "rounded-lg",
  };

  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 bg-[length:200%_100%] ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  );
}

// Board skeleton
export function BoardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton width={200} height={28} />
          <Skeleton width={150} height={16} />
        </div>
        <div className="flex gap-3">
          <Skeleton width={100} height={36} variant="rounded" />
          <Skeleton width={100} height={36} variant="rounded" />
        </div>
      </div>

      {/* Groups skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Group header */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
              <Skeleton width={16} height={16} variant="circular" />
              <Skeleton width={120} height={20} />
            </div>
            {/* Items */}
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {[1, 2, 3].map((j) => (
                <div key={j} className="p-4 flex items-center gap-4">
                  <Skeleton width={24} height={24} variant="circular" />
                  <Skeleton width="100%" height={20} className="flex-1" />
                  <Skeleton width={80} height={20} />
                  <Skeleton width={80} height={20} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Item card skeleton
export function ItemCardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
      <div className="flex items-start gap-3">
        <Skeleton width={20} height={20} variant="circular" />
        <div className="flex-1 space-y-2">
          <Skeleton width="70%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
    </div>
  );
}

// Kanban column skeleton
export function KanbanColumnSkeleton() {
  return (
    <div className="w-[280px] shrink-0">
      <div className="rounded-t-xl p-3 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-600">
        <Skeleton width={100} height={20} className="mx-auto" />
      </div>
      <div className="bg-gray-100 dark:bg-slate-700/50 rounded-b-xl p-3 space-y-3 min-h-[200px]">
        {[1, 2, 3].map((i) => (
          <ItemCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Spinner Components
// ============================================================

export function Spinner({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-3",
  };

  return (
    <div className={`${sizes[size]} ${className}`}>
      <div className="w-full h-full rounded-full border-gray-200 border-t-blue-500 animate-spin" />
    </div>
  );
}

// Gradient spinner
export function GradientSpinner({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 animate-spin" 
           style={{ animation: 'spin 1.5s linear infinite' }} />
      <div className="absolute inset-0 w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 animate-pulse opacity-50 blur-lg" />
    </div>
  );
}

// ============================================================
// Progress Indicators
// ============================================================

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  color?: "blue" | "green" | "purple" | "orange";
}

export function ProgressBar({ 
  value, 
  max = 100, 
  showLabel = false, 
  size = "md",
  color = "blue" 
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const heights = { sm: "h-1", md: "h-2", lg: "h-3" };
  const colors = {
    blue: "bg-gradient-to-r from-blue-500 to-blue-600",
    green: "bg-gradient-to-r from-green-500 to-green-600",
    purple: "bg-gradient-to-r from-purple-500 to-pink-500",
    orange: "bg-gradient-to-r from-orange-500 to-red-500",
  };

  return (
    <div className="w-full">
      <div className={`w-full ${heights[size]} bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden`}>
        <div 
          className={`${heights[size]} ${colors[color]} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{value}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}

// Circular progress
export function CircularProgress({ 
  value, 
  max = 100, 
  size = 64,
  strokeWidth = 4,
  color = "#8b5cf6"
}: { 
  value: number; 
  max?: number; 
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-slate-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-gray-700 dark:text-gray-200">
        {Math.round(percentage)}%
      </span>
    </div>
  );
}

// ============================================================
// Empty States
// ============================================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mb-4 text-gray-400 dark:text-gray-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-lg shadow-lg shadow-blue-500/25 transition-all transform hover:scale-105"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Toast / Notification
// ============================================================

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  onClose?: () => void;
}

export function Toast({ message, type = "info", onClose }: ToastProps) {
  const typeStyles = {
    success: "bg-gradient-to-r from-green-500 to-emerald-500",
    error: "bg-gradient-to-r from-red-500 to-rose-500",
    info: "bg-gradient-to-r from-blue-500 to-indigo-500",
    warning: "bg-gradient-to-r from-yellow-500 to-orange-500",
  };

  const icons = {
    success: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };

  return (
    <div className={`fixed bottom-4 right-4 ${typeStyles[type]} text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom fade-in z-50`}>
      {icons[type]}
      <span className="font-medium">{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-2 hover:opacity-80 transition-opacity">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ============================================================
// Glassmorphism Card
// ============================================================

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  blur?: "sm" | "md" | "lg";
}

export function GlassCard({ children, className = "", blur = "md" }: GlassCardProps) {
  const blurClasses = {
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
  };

  return (
    <div className={`bg-white/80 dark:bg-slate-800/80 border border-white/20 dark:border-slate-700/20 shadow-xl ${blurClasses[blur]} ${className}`}>
      {children}
    </div>
  );
}

// ============================================================
// Button Variants
// ============================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ 
  children, 
  variant = "primary", 
  size = "md", 
  loading = false,
  icon,
  className = "",
  disabled,
  ...props 
}: ButtonProps) {
  const variants = {
    primary: "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-500/25",
    secondary: "bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200",
    ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300",
    danger: "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-lg shadow-red-500/25",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2.5",
  };

  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

// ============================================================
// Badge
// ============================================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  className?: string;
}

export function Badge({ children, variant = "default", size = "sm", className = "" }: BadgeProps) {
  const variants = {
    default: "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}
