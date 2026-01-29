/**
 * Error Boundary
 *
 * Catches render-time errors and displays a user-friendly fallback.
 * Simplified from migration-specific handling to generic error boundary.
 */

import React, { Component, ReactNode } from "react";
import { MigrationErrorFallback } from "./MigrationErrorFallback";

interface MigrationErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface MigrationErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class MigrationErrorBoundary extends Component<
  MigrationErrorBoundaryProps,
  MigrationErrorBoundaryState
> {
  constructor(props: MigrationErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): MigrationErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <MigrationErrorFallback
            error={this.state.error}
            onRetry={this.handleRetry}
          />
        )
      );
    }

    return this.props.children;
  }
}
