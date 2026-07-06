// ============================================================
// Error Boundary Component
// Catches React errors and displays a fallback UI
// ============================================================

"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// ============================================================
// Error Boundary Class Component
// ============================================================

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback 
          error={this.state.error} 
          onRetry={this.handleRetry} 
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================
// Error Fallback UI
// ============================================================

interface ErrorFallbackProps {
  error: Error | null;
  onRetry: () => void;
}

function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            We encountered an unexpected error. This has been logged and we'll look into it.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Error Details
            </h3>
            <p className="text-sm font-mono text-red-600 dark:text-red-400 break-all">
              {error.message || "Unknown error"}
            </p>
            {process.env.NODE_ENV === "development" && error.stack && (
              <pre className="mt-2 text-xs text-gray-500 dark:text-gray-400 overflow-auto max-h-32 whitespace-pre-wrap">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-medium rounded-lg shadow-lg shadow-blue-500/25 transition-all transform hover:scale-105"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Async Error Handler Hook
// For handling async errors in components
// ============================================================

export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((err: unknown) => {
    if (err instanceof Error) {
      setError(err);
    } else {
      setError(new Error(String(err)));
    }
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}

// ============================================================
// API Error Handler
// For handling API errors consistently
// ============================================================

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

export function handleApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as any).code,
      status: (error as any).status,
    };
  }
  
  if (typeof error === "object" && error !== null) {
    return {
      message: (error as any).message || "An unexpected error occurred",
      code: (error as any).code,
      status: (error as any).status,
    };
  }

  return {
    message: "An unexpected error occurred",
  };
}

// ============================================================
// Error Toast Component
// For displaying errors in a toast notification
// ============================================================

interface ErrorToastProps {
  error: Error | ApiError;
  onDismiss: () => void;
}

export function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  const message = "message" in error ? error.message : error.toString();

  return (
    <div className="fixed bottom-4 right-4 bg-gradient-to-r from-red-500 to-rose-500 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom fade-in z-50 max-w-md">
      <AlertTriangle size={20} className="shrink-0" />
      <div className="flex-1">
        <p className="font-medium text-sm">{message}</p>
        {"code" in error && error.code && (
          <p className="text-xs opacity-75 mt-0.5">Code: {error.code}</p>
        )}
      </div>
      <button 
        onClick={onDismiss}
        className="shrink-0 p-1 hover:bg-white/20 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
