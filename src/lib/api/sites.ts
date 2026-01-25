import { createAuthenticatedClient } from '../api-client';
import type { SiteResponse, CreateSiteRequest, UpdateSiteRequest } from '../api-types';

/**
 * @deprecated Use tRPC hooks from src/hooks/useSites.ts instead.
 * These Ky-based API wrappers are being migrated to tRPC for type safety.
 *
 * Migration:
 * - listSites -> useSites() hook
 * - getSite -> useSite() hook
 * - createSite -> useCreateSite() hook
 * - updateSite -> useUpdateSite() hook
 * - deleteSite -> useDeleteSite() hook
 */
export const sitesApi = {
  /**
   * List sites for organization
   * GET /api/orgs/:orgId/sites
   * @deprecated Use useSites() hook from src/hooks/useSites.ts
   */
  listSites: async (orgId: string, accessToken: string): Promise<SiteResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/sites`).json<SiteResponse[]>();
  },

  /**
   * Get site by ID
   * GET /api/orgs/:orgId/sites/:siteId
   * @deprecated Use useSite() hook from src/hooks/useSites.ts
   */
  getSite: async (orgId: string, siteId: string, accessToken: string): Promise<SiteResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/sites/${siteId}`).json<SiteResponse>();
  },

  /**
   * Create site
   * POST /api/orgs/:orgId/sites
   * Requires admin role
   * @deprecated Use useCreateSite() hook from src/hooks/useSites.ts
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
   * @deprecated Use useUpdateSite() hook from src/hooks/useSites.ts
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
   * @deprecated Use useDeleteSite() hook from src/hooks/useSites.ts
   */
  deleteSite: async (orgId: string, siteId: string, accessToken: string): Promise<void> => {
    const client = createAuthenticatedClient(accessToken);
    // DELETE returns 204 No Content, use text() to handle empty response
    await client.delete(`api/orgs/${orgId}/sites/${siteId}`).text();
  },
};
