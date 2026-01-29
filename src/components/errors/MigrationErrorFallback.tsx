/**
 * Migration Error Fallback
 *
 * Displays a user-friendly card when a feature is unavailable due to
 * Supabase migration. Matches DashboardErrorBoundary styling.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMigrationError } from "@/lib/supabase-placeholder";

interface MigrationErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
}

export function MigrationErrorFallback({ error, onRetry }: MigrationErrorFallbackProps) {
  const migrationError = error as SupabaseMigrationError | null;
  const featureName = migrationError?.featureName;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-lg">Feature Temporarily Unavailable</CardTitle>
        </div>
        <CardDescription>
          {featureName
            ? `The "${featureName}" feature is being migrated to our new backend.`
            : "This feature is being migrated to our new backend."}
          {" "}It will be available again soon.
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
