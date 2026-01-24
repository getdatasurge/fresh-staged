/**
 * Auth API module for user identity and profile management
 */

import { apiClient } from '../api-client';

export interface AuthMeResponse {
  userId: string;
  email: string | null;
  displayName: string | null;
  primaryOrganizationId: string | null;
  organizations: Array<{
    organizationId: string;
    role: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
  }>;
}

/**
 * Auth API functions
 */
export const authApi = {
  /**
   * Get current user's profile and organization memberships
   *
   * @param accessToken - Stack Auth access token
   * @returns User profile with org context
   */
  getMe: async (accessToken: string): Promise<AuthMeResponse> => {
    return apiClient
      .get('api/auth/me', {
        headers: { 'x-stack-access-token': accessToken },
      })
      .json<AuthMeResponse>();
  },
};
