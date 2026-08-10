'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="border-destructive/50 bg-destructive/10 text-destructive flex min-h-[200px] w-full flex-col items-center justify-center gap-4 rounded-md border border-dashed p-6 text-center">
          <AlertCircle className="h-8 w-8 opacity-80" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Something went wrong</h3>
            <p className="max-w-[400px] truncate text-xs opacity-80">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReload}
            className="bg-background mt-2"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
