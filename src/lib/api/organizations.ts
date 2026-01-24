import { createAuthenticatedClient } from '../api-client';
import type { OrganizationResponse, UpdateOrganizationRequest, MemberResponse } from '../api-types';

export const organizationsApi = {
  /**
   * Get organization by ID
   * GET /api/orgs/:orgId
   */
  getOrganization: async (orgId: string, accessToken: string): Promise<OrganizationResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}`).json<OrganizationResponse>();
  },

  /**
   * Update organization
   * PUT /api/orgs/:orgId
   * Requires owner role
   */
  updateOrganization: async (
    orgId: string,
    updates: UpdateOrganizationRequest,
    accessToken: string
  ): Promise<OrganizationResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.put(`api/orgs/${orgId}`, { json: updates }).json<OrganizationResponse>();
  },

  /**
   * List organization members
   * GET /api/orgs/:orgId/members
   */
  listMembers: async (orgId: string, accessToken: string): Promise<MemberResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/members`).json<MemberResponse[]>();
  },
};
