/**
 * Gateway Provisioning Preflight Hooks
 *
 * Status: BLOCKED - Requires backend implementation
 *
 * Current implementation:
 * - Uses ttn-gateway-preflight edge function to validate API key permissions
 * - Checks if API key has gateway provisioning rights (personal/org key vs app key)
 *
 * Migration blockers:
 * - Backend needs TTN SDK integration to validate API key type and permissions
 * - Backend needs procedure to inspect API key rights
 *
 * Edge functions used:
 * - ttn-gateway-preflight (validates API key type and gateway rights)
 *
 * Migration path:
 * 1. Add TTN SDK to backend
 * 2. Create ttnSettings.validateGatewayRights procedure
 * 3. Migrate this hook to use tRPC procedure
 *
 * Estimated effort: Medium (requires TTN API integration)
 * Priority: Low (only used for gateway provisioning validation)
 */
import { useState, useCallback, useEffect } from 'react';
import { useUser } from '@stackframe/react';

export interface PreflightError {
  code: 'WRONG_KEY_TYPE' | 'MISSING_GATEWAY_RIGHTS' | 'API_KEY_INVALID' | 'TTN_NOT_CONFIGURED';
  message: string;
  hint: string;
  fix_steps: string[];
}

export interface PreflightResult {
  ok: boolean;
  request_id: string;
  allowed: boolean;
  key_type: 'personal' | 'organization' | 'application' | 'unknown';
  owner_scope: 'user' | 'organization' | null;
  scope_id: string | null;
  has_gateway_rights: boolean;
  missing_rights: string[];
  error?: PreflightError;
}

export interface UseGatewayProvisioningPreflightReturn {
  status: 'idle' | 'checking' | 'ready' | 'blocked' | 'error';
  result: PreflightResult | null;
  keyType: 'personal' | 'organization' | 'application' | 'unknown' | null;
  ownerScope: 'user' | 'organization' | null;
  hasGatewayRights: boolean;
  missingRights: string[];
  error: PreflightError | null;
  runPreflight: () => Promise<PreflightResult | null>;
  isLoading: boolean;
}

/**
 * Hook to check if gateway provisioning is allowed based on TTN API key type and permissions
 */
export function useGatewayProvisioningPreflight(
  organizationId: string | null,
  options: { autoRun?: boolean } = {},
): UseGatewayProvisioningPreflightReturn {
  const { autoRun = false } = options;
  const user = useUser();

  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'blocked' | 'error'>('idle');
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runPreflight = useCallback(async (): Promise<PreflightResult | null> => {
    if (!organizationId || !user) {
      setStatus('idle');
      return null;
    }

    setStatus('checking');
    setIsLoading(true);

    try {
      const preflightResult: PreflightResult = {
        ok: false,
        request_id: 'supabase-removed',
        allowed: false,
        key_type: 'unknown',
        owner_scope: null,
        scope_id: null,
        has_gateway_rights: false,
        missing_rights: [],
        error: {
          code: 'TTN_NOT_CONFIGURED',
          message: 'Gateway preflight unavailable',
          hint: 'Supabase-based gateway checks have been removed.',
          fix_steps: ['Retry after backend TTN preflight is implemented.'],
        },
      };

      setResult(preflightResult);
      setStatus('blocked');
      return preflightResult;
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, user]);

  // Auto-run preflight if enabled
  useEffect(() => {
    if (autoRun && organizationId && user && status === 'idle') {
      runPreflight();
    }
  }, [autoRun, organizationId, user, status, runPreflight]);

  return {
    status,
    result,
    keyType: result?.key_type ?? null,
    ownerScope: result?.owner_scope ?? null,
    hasGatewayRights: result?.has_gateway_rights ?? false,
    missingRights: result?.missing_rights ?? [],
    error: result?.error ?? null,
    runPreflight,
    isLoading,
  };
}
