/**
 * Route Error Fallback
 *
 * Full-page error display for route-level error boundaries.
 * Shows a centered card with error details, retry, and navigation options.
 * Used when a route group crashes but the rest of the app remains functional.
 */

import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RouteErrorFallbackProps {
  error: Error | null;
  title?: string;
  onRetry?: () => void;
}

export function RouteErrorFallback({
  error,
  title = 'Page Error',
  onRetry,
}: RouteErrorFallbackProps) {
  const handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-lg border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <CardDescription>
            {error?.message || 'An unexpected error occurred while loading this page.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleGoHome}>
            <Home className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
