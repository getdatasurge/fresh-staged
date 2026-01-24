import { createAuthenticatedClient } from '../api-client';
import type { SiteResponse, CreateSiteRequest, UpdateSiteRequest } from '../api-types';

export const sitesApi = {
  /**
   * List sites for organization
   * GET /api/orgs/:orgId/sites
   */
  listSites: async (orgId: string, accessToken: string): Promise<SiteResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/sites`).json<SiteResponse[]>();
  },

  /**
   * Get site by ID
   * GET /api/orgs/:orgId/sites/:siteId
   */
  getSite: async (orgId: string, siteId: string, accessToken: string): Promise<SiteResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/sites/${siteId}`).json<SiteResponse>();
  },

  /**
   * Create site
   * POST /api/orgs/:orgId/sites
   * Requires admin role
   */
  createSite: async (
    orgId: string,
    data: CreateSiteRequest,
    accessToken: string
  ): Promise<SiteResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.post(`api/orgs/${orgId}/sites`, { json: data }).json<SiteResponse>();
  },

  /**
   * Update site
   * PUT /api/orgs/:orgId/sites/:siteId
   * Requires admin role
   */
  updateSite: async (
    orgId: string,
    siteId: string,
    data: UpdateSiteRequest,
    accessToken: string
  ): Promise<SiteResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.put(`api/orgs/${orgId}/sites/${siteId}`, { json: data }).json<SiteResponse>();
  },

  /**
   * Delete site (soft delete)
   * DELETE /api/orgs/:orgId/sites/:siteId
   * Requires admin role
   */
  deleteSite: async (orgId: string, siteId: string, accessToken: string): Promise<void> => {
    const client = createAuthenticatedClient(accessToken);
    // DELETE returns 204 No Content, use text() to handle empty response
    await client.delete(`api/orgs/${orgId}/sites/${siteId}`).text();
  },
};
