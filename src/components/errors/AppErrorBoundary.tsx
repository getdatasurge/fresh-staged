/**
 * App Error Boundary
 *
 * Catches render-time errors and displays a user-friendly fallback.
 * Supports both static `fallback` ReactNode and dynamic `fallbackRender`
 * function that receives the error and a retry callback.
 */

import React, { Component, ReactNode } from 'react';
import { ErrorFallback } from './ErrorFallback';

export interface FallbackRenderProps {
  error: Error | null;
  onRetry: () => void;
}

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Static fallback element (error/retry not passed through) */
  fallback?: ReactNode;
  /** Dynamic fallback render function that receives error and retry handler */
  fallbackRender?: (props: FallbackRenderProps) => ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          onRetry: this.handleRetry,
        });
      }
      return (
        this.props.fallback || <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />
      );
    }

    return this.props.children;
  }
}
