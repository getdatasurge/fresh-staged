import { createAuthenticatedClient } from '../api-client';
import type { UnitResponse, CreateUnitRequest, UpdateUnitRequest } from '../api-types';

export const unitsApi = {
  /**
   * List units for area
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units
   */
  listUnits: async (
    orgId: string,
    siteId: string,
    areaId: string,
    accessToken: string
  ): Promise<UnitResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .get(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}/units`)
      .json<UnitResponse[]>();
  },

  /**
   * Get unit by ID
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId
   */
  getUnit: async (
    orgId: string,
    siteId: string,
    areaId: string,
    unitId: string,
    accessToken: string
  ): Promise<UnitResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .get(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}/units/${unitId}`)
      .json<UnitResponse>();
  },

  /**
   * Create unit
   * POST /api/orgs/:orgId/sites/:siteId/areas/:areaId/units
   * Requires manager role
   */
  createUnit: async (
    orgId: string,
    siteId: string,
    areaId: string,
    data: CreateUnitRequest,
    accessToken: string
  ): Promise<UnitResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .post(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}/units`, { json: data })
      .json<UnitResponse>();
  },

  /**
   * Update unit
   * PUT /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId
   * Requires manager role
   */
  updateUnit: async (
    orgId: string,
    siteId: string,
    areaId: string,
    unitId: string,
    data: UpdateUnitRequest,
    accessToken: string
  ): Promise<UnitResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client
      .put(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}/units/${unitId}`, { json: data })
      .json<UnitResponse>();
  },

  /**
   * Delete unit (soft delete)
   * DELETE /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId
   * Requires manager role
   */
  deleteUnit: async (
    orgId: string,
    siteId: string,
    areaId: string,
    unitId: string,
    accessToken: string
  ): Promise<void> => {
    const client = createAuthenticatedClient(accessToken);
    // DELETE returns 204 No Content, use text() to handle empty response
    await client
      .delete(`api/orgs/${orgId}/sites/${siteId}/areas/${areaId}/units/${unitId}`)
      .text();
  },
};
