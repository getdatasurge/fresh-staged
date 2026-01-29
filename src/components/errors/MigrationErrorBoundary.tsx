/**
 * Migration Error Boundary
 *
 * Catches render-time errors from Supabase placeholder calls and displays
 * a user-friendly fallback. Non-migration errors are re-thrown to parent
 * error boundaries.
 */

import React, { Component, ReactNode } from "react";
import { isSupabaseMigrationError } from "@/lib/supabase-placeholder";
import { MigrationErrorFallback } from "./MigrationErrorFallback";

interface MigrationErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface MigrationErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isMigrationError: boolean;
}

export class MigrationErrorBoundary extends Component<
  MigrationErrorBoundaryProps,
  MigrationErrorBoundaryState
> {
  constructor(props: MigrationErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isMigrationError: false };
  }

  static getDerivedStateFromError(error: Error): MigrationErrorBoundaryState {
    return {
      hasError: true,
      error,
      isMigrationError: isSupabaseMigrationError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[MigrationErrorBoundary]", {
      error: error.message,
      isMigration: isSupabaseMigrationError(error),
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, isMigrationError: false });
  };

  render() {
    if (this.state.hasError && this.state.isMigrationError) {
      return (
        this.props.fallback || (
          <MigrationErrorFallback
            error={this.state.error}
            onRetry={this.handleRetry}
          />
        )
      );
    }

    // Re-throw non-migration errors to parent boundaries
    if (this.state.hasError) {
      throw this.state.error;
    }

    return this.props.children;
  }
}
