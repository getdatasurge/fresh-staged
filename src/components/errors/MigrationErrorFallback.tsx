/**
 * Error Fallback
 *
 * Displays a user-friendly card when an error occurs.
 * Simplified from migration-specific to generic error fallback.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MigrationErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
}

export function MigrationErrorFallback({ error, onRetry }: MigrationErrorFallbackProps) {
  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-lg">Something Went Wrong</CardTitle>
        </div>
        <CardDescription>
          {error?.message || "An unexpected error occurred. Please try again."}
        </CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
