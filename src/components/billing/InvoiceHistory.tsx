import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink } from 'lucide-react';

interface InvoiceHistoryProps {
  subscriptionId: string;
  onOpenPortal?: () => void;
}

/**
 * InvoiceHistory component
 *
 * Displays a message directing users to the Stripe billing portal
 * for invoice history. The listInvoices procedure is not yet implemented
 * in the payments router.
 */
export const InvoiceHistory = ({ subscriptionId, onOpenPortal }: InvoiceHistoryProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Invoice History
        </CardTitle>
        <CardDescription>View and download past invoices</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-center py-4">
          Invoice history is available in the billing portal.
        </p>
        {onOpenPortal && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={onOpenPortal}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Billing Portal
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
