import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryErrorBoundary } from '../QueryErrorBoundary';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

/** Component that throws on render to trigger the error boundary. */
function ThrowingChild({ error }: { error: Error }) {
  throw error;
}

function GoodChild() {
  return <div>Content loaded successfully</div>;
}

describe('QueryErrorBoundary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    // Suppress console.error from React error boundary logging
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QueryErrorBoundary>
          <GoodChild />
        </QueryErrorBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Content loaded successfully')).toBeDefined();
  });

  it('renders error fallback with default title when child throws', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QueryErrorBoundary>
          <ThrowingChild error={new Error('Query failed')} />
        </QueryErrorBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Data Loading Error')).toBeDefined();
    expect(screen.getByText('Query failed')).toBeDefined();
  });

  it('renders error fallback with custom title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QueryErrorBoundary title="Custom Error Title">
          <ThrowingChild error={new Error('Something broke')} />
        </QueryErrorBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Custom Error Title')).toBeDefined();
  });

  it('shows retry button that resets the boundary', () => {
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) {
        throw new Error('Temporary failure');
      }
      return <div>Recovered successfully</div>;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <QueryErrorBoundary>
          <ConditionalChild />
        </QueryErrorBoundary>
      </QueryClientProvider>,
    );

    // Error state is shown
    expect(screen.getByText('Temporary failure')).toBeDefined();

    // Fix the error condition
    shouldThrow = false;

    // Click "Try Again" button
    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    // After retry, children render successfully
    expect(screen.getByText('Recovered successfully')).toBeDefined();
  });

  it('shows "Go to Dashboard" navigation button in error state', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <QueryErrorBoundary>
          <ThrowingChild error={new Error('Nav test')} />
        </QueryErrorBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeDefined();
  });
});
