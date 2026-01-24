import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, useStackApp } from '@stackframe/react';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLogger';
import { useToast } from '@/hooks/use-toast';

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

interface DeletionResult {
  success: boolean;
  job_id?: string;
  request_id?: string;
  error?: string;
  error_code?: string;
  sensors_queued?: number;
  gateways_deleted?: number;
  org_deleted?: boolean;
  org_had_other_users?: boolean;
}

export function useAccountDeletion() {
  const user = useUser();
  const stackApp = useStackApp();
  const [progress, setProgress] = useState<DeletionProgress>({
    status: 'idle',
    currentStep: ''
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
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
      userId: userId.slice(-4) // Only log last 4 chars
    });

    setProgress({
      status: 'preparing',
      currentStep: 'Preparing deletion...',
      requestId
    });

    try {
      // Get Stack Auth token for future backend call
      const { accessToken } = await user.getAuthJson();

      // TODO: Migrate to new backend endpoint
      // Account deletion needs secure backend handling
      // For Stack Auth, account deletion should go through Stack Auth API
      // The backend then cleans up local data
      console.warn('[useAccountDeletion] TODO: migrate to new backend');

      // Call the RPC function (TEMPORARY - keep existing logic)
      const { data, error } = await supabase.rpc('delete_user_account', {
        p_user_id: userId
      });

      if (error) {
        throw new Error(error.message);
      }

      const result = data as unknown as DeletionResult;

      if (!result.success) {
        debugLog.error('auth', 'Account deletion failed', { 
          error: result.error, 
          errorCode: result.error_code,
          requestId,
          jobId: result.job_id
        });
        
        setProgress({ 
          status: 'error', 
          currentStep: 'Deletion failed', 
          error: result.error || 'Unknown error',
          errorCode: result.error_code,
          requestId,
          jobId: result.job_id
        });
        setIsDeleting(false);
        return false;
      }

      debugLog.info('auth', 'Account deletion completed', { 
        step: 'completed',
        requestId,
        jobId: result.job_id,
        sensorsQueued: result.sensors_queued,
        gatewaysDeleted: result.gateways_deleted,
        orgDeleted: result.org_deleted
      });

      setProgress({
        status: 'signing_out',
        currentStep: 'Signing out...',
        requestId,
        jobId: result.job_id
      });

      // Sign out the user via Stack Auth
      await stackApp.signOut();

      setProgress({ 
        status: 'complete', 
        currentStep: 'Account deleted', 
        requestId,
        jobId: result.job_id
      });

      // Navigate to confirmation page
      navigate('/account-deleted', { replace: true });
      return true;

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      
      debugLog.error('auth', 'Account deletion exception', { 
        error: message, 
        requestId 
      });
      
      setProgress({ 
        status: 'error', 
        currentStep: 'Deletion failed', 
        error: message, 
        requestId 
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
    reset 
  };
}
