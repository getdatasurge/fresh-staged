/**
 * useEffectiveIdentity Hook
 *
 * Single source of truth for "who is the current effective user/org" for data fetching.
 * When a Super Admin is impersonating a user, this returns the impersonated user's
 * identity. Otherwise, returns the real authenticated user's identity.
 *
 * MIGRATED: Now uses Stack Auth + /api/auth/me instead of Supabase
 *
 * This hook should be used by all data-fetching components to ensure proper scoping.
 */

import { useCallback, useMemo } from 'react';
import { useUser } from '@stackframe/react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useSuperAdmin } from '@/contexts/SuperAdminContext';

export interface EffectiveIdentity {
  // Effective identity (impersonated if active, else real user)
  effectiveUserId: string | null;
  effectiveOrgId: string | null;
  effectiveOrgName: string | null;
  effectiveUserEmail: string | null;
  effectiveUserName: string | null;

  // Real user identity (always the authenticated user)
  realUserId: string | null;
  realOrgId: string | null;

  // Impersonation metadata
  isImpersonating: boolean;
  impersonationExpiresAt: Date | null;
  impersonationSessionId: string | null;

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;
  impersonationChecked: boolean; // True after server-side impersonation check completes

  // Actions
  refresh: () => Promise<void>;
}

export function useEffectiveIdentity(): EffectiveIdentity {
  const stackUser = useUser();
  const {
    isSuperAdmin,
    rolesLoaded,
    impersonation,
    isSupportModeActive
  } = useSuperAdmin();

  // Fetch user profile with org context from Stack Auth + new API
  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: qk.user(stackUser?.id ?? null).profile(),
    queryFn: async () => {
      if (!stackUser) return null;
      const authJson = await stackUser.getAuthJson();
      return authApi.getMe(authJson.accessToken);
    },
    enabled: !!stackUser,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  // Real user identity from Stack Auth
  const realUserId = stackUser?.id ?? null;
  const realOrgId = profile?.primaryOrganizationId ?? null;

  // TODO: Phase 6 - Implement impersonation support
  // For now, we use SuperAdminContext state but don't have server-side validation
  // The impersonation RPC calls need to be migrated to new backend
  const hasContextImpersonation = impersonation?.isImpersonating && impersonation?.impersonatedOrgId;

  // Determine if we have a valid impersonation from context
  const isImpersonating = Boolean(
    isSuperAdmin &&
    isSupportModeActive &&
    hasContextImpersonation
  );

  // Effective identity: Use impersonation if active, otherwise real user
  const effectiveUserId = isImpersonating
    ? (impersonation.impersonatedUserId ?? realUserId)
    : realUserId;

  const effectiveOrgId = isImpersonating
    ? (impersonation.impersonatedOrgId ?? realOrgId)
    : realOrgId;

  const effectiveOrgName = isImpersonating
    ? (impersonation.impersonatedOrgName ?? null)
    : null;

  const effectiveUserEmail = isImpersonating
    ? (impersonation.impersonatedUserEmail ?? null)
    : (stackUser?.primaryEmail ?? null);

  const effectiveUserName = isImpersonating
    ? (impersonation.impersonatedUserName ?? null)
    : (stackUser?.displayName ?? null);

  // Compute isInitialized: We're ready when:
  // 1. Stack Auth user state is loaded, AND
  // 2. Profile data is loaded (or confirmed unavailable)
  // 3. For Super Admins in support mode, impersonation context is loaded
  const isInitialized = useMemo(() => {
    if (!rolesLoaded) return false;
    if (stackUser && isLoading) return false; // Still loading profile

    // In support mode, need impersonation context ready
    if (isSupportModeActive) {
      // Context provides impersonation state synchronously
      return true;
    }

    return true;
  }, [rolesLoaded, stackUser, isLoading, isSupportModeActive]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    effectiveUserId,
    effectiveOrgId,
    effectiveOrgName,
    effectiveUserEmail,
    effectiveUserName,
    realUserId,
    realOrgId,
    isImpersonating,
    impersonationExpiresAt: null, // TODO: Phase 6
    impersonationSessionId: null, // TODO: Phase 6
    isLoading,
    isInitialized,
    impersonationChecked: true, // TODO: Phase 6 - server-side validation
    refresh,
  };
}
