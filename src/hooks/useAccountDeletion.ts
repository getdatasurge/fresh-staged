import { useUser } from '@stackframe/react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debugLogger';

export type DeletionStatus =
  | 'idle'
  | 'preparing'
  | 'deleting_sensors'
  | 'deleting_gateways'
  | 'removing_membership'
  | 'anonymizing'
  | 'signing_out'
  | 'complete'
  | 'error';

export interface DeletionProgress {
  status: DeletionStatus;
  currentStep: string;
  error?: string;
  errorCode?: string;
  requestId?: string;
  jobId?: string;
}

export function useAccountDeletion() {
  const user = useUser();
  const [progress, setProgress] = useState<DeletionProgress>({
    status: 'idle',
    currentStep: '',
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const deleteAccount = async (userId: string) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const requestId = crypto.randomUUID();
    setIsDeleting(true);

    debugLog.info('auth', 'Account deletion started', {
      step: 'started',
      requestId,
      userId: userId.slice(-4), // Only log last 4 chars
    });

    setProgress({
      status: 'preparing',
      currentStep: 'Preparing deletion...',
      requestId,
    });

    try {
      // TODO: Migrate to new backend endpoint
      // Account deletion needs secure backend handling
      // For Stack Auth, account deletion should go through Stack Auth API
      // The backend then cleans up local data
      console.warn('[useAccountDeletion] TODO: migrate to new backend');

      setProgress({
        status: 'error',
        currentStep: 'Account deletion unavailable',
        error: 'Account deletion requires backend migration after Supabase removal',
        requestId,
      });
      setIsDeleting(false);
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      debugLog.error('auth', 'Account deletion exception', {
        error: message,
        requestId,
      });

      setProgress({
        status: 'error',
        currentStep: 'Deletion failed',
        error: message,
        requestId,
      });

      toast({
        title: 'Deletion Failed',
        description: message,
        variant: 'destructive',
      });

      setIsDeleting(false);
      return false;
    }
  };

  const reset = () => {
    setProgress({ status: 'idle', currentStep: '' });
    setIsDeleting(false);
  };

  return {
    progress,
    isDeleting,
    deleteAccount,
    reset,
  };
}
