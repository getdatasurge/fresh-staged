import { createAuthenticatedClient } from '../api-client';
import type { AreaResponse, CreateAreaRequest, UpdateAreaRequest } from '../api-types';

export const areasApi = {
  /**
   * List areas for site
   * GET /api/orgs/:orgId/sites/:siteId/areas
   */
  listAreas: async (
    orgId: string,
    siteId: string,
    accessToken: string
  ): Promise<AreaResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get(`api/orgs/${orgId}/sites/${siteId}/areas`).json<AreaResponse[]>();
  },

  /**
   * Get area by ID
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId
   */
  getArea: async (
    orgId: string,
    siteId: string,
    areaId: string,
    accessToken: string
  ): Promise<AreaResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .get(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}`)
      .json<AreaResponse>();
  },

  /**
   * Create area
   * POST /api/orgs/:orgId/sites/:siteId/areas
   * Requires admin role
   */
  createArea: async (
    orgId: string,
    siteId: string,
    data: CreateAreaRequest,
    accessToken: string
  ): Promise<AreaResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .post(`api/orgs/${orgId}/sites/${siteId}/areas`, { json: data })
      .json<AreaResponse>();
  },

  /**
   * Update area
   * PUT /api/orgs/:orgId/sites/:siteId/areas/:areaId
   * Requires admin role
   */
  updateArea: async (
    orgId: string,
    siteId: string,
    areaId: string,
    data: UpdateAreaRequest,
    accessToken: string
  ): Promise<AreaResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .put(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}`, { json: data })
      .json<AreaResponse>();
  },

  /**
   * Delete area (soft delete)
   * DELETE /api/orgs/:orgId/sites/:siteId/areas/:areaId
   * Requires admin role
   */
  deleteArea: async (
    orgId: string,
    siteId: string,
    areaId: string,
    accessToken: string
  ): Promise<void> => {
    const client = createAuthenticatedClient(accessToken);
    // DELETE returns 204 No Content, use text() to handle empty response
    await client.delete(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}`).text();
  },
};
