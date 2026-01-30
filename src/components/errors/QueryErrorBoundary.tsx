/**
 * Query Error Boundary
 *
 * Combines TanStack Query's QueryErrorResetBoundary with AppErrorBoundary
 * so that clicking "Try Again" both resets the error boundary state AND
 * tells TanStack Query to retry failed queries.
 *
 * Use this around data-heavy routes where queries are the primary failure mode.
 */

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { AppErrorBoundary } from './AppErrorBoundary';
import { RouteErrorFallback } from './RouteErrorFallback';
import type { ReactNode } from 'react';

interface QueryErrorBoundaryProps {
  children: ReactNode;
  /** Title displayed in the error fallback card */
  title?: string;
}

export function QueryErrorBoundary({
  children,
  title = 'Data Loading Error',
}: QueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <AppErrorBoundary
          fallbackRender={({ error, onRetry }) => (
            <RouteErrorFallback
              error={error}
              title={title}
              onRetry={() => {
                reset();
                onRetry();
              }}
            />
          )}
        >
          {children}
        </AppErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
