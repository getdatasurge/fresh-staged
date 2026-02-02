/**
 * useAuthAndOnboarding Hook
 *
 * MIGRATED: Now uses Stack Auth + useEffectiveIdentity instead of Supabase
 *
 * Unified hook for auth + onboarding state.
 * Prevents route flicker by ensuring both session and org status are resolved
 * before any routing decisions are made.
 */

import { useUser } from '@stackframe/react';
import { useEffectiveIdentity } from './useEffectiveIdentity';

interface AuthOnboardingState {
  isInitializing: boolean;
  isAuthenticated: boolean;
  isOnboardingComplete: boolean;
  isSuperAdmin: boolean;
  session: { user: { id: string } } | null; // Minimal session shape for compatibility
  organizationId: string | null;
}

/**
 * Unified hook for auth + onboarding state.
 * Prevents route flicker by ensuring both session and org status are resolved
 * before any routing decisions are made.
 */
export function useAuthAndOnboarding(): AuthOnboardingState {
  const stackUser = useUser();
  const { effectiveOrgId, isInitialized, realUserId } = useEffectiveIdentity();

  // Check if user is authenticated
  const isAuthenticated = !!stackUser;

  // Check if onboarding is complete (user has an organization)
  const isOnboardingComplete = !!effectiveOrgId;

  // TODO: Phase 6 - Super Admin check needs to be migrated
  // For now, we'll assume non-super-admin until backend supports this
  const isSuperAdmin = false;

  // Create minimal session object for compatibility
  const session = stackUser ? { user: { id: stackUser.id } } : null;

  return {
    isInitializing: !isInitialized,
    isAuthenticated,
    isOnboardingComplete,
    isSuperAdmin,
    session,
    organizationId: effectiveOrgId,
  };
}
