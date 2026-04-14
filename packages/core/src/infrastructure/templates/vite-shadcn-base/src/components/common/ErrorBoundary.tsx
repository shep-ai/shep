import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** React error boundary with a dark-theme fallback card. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-foreground text-sm font-semibold">Something went sideways</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
        </div>
      </div>
    );
  }
}
