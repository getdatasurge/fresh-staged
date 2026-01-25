import { createAuthenticatedClient } from '../api-client';
import type { UnitResponse, CreateUnitRequest, UpdateUnitRequest } from '../api-types';

/**
 * @deprecated Use tRPC hooks from src/hooks/useUnits.ts instead.
 * These Ky-based API wrappers are being migrated to tRPC for type safety.
 *
 * Migration:
 * - listUnits -> useUnits() hook
 * - getUnit -> useUnit() hook
 * - createUnit -> useCreateUnit() hook
 * - updateUnit -> useUpdateUnit() hook
 * - deleteUnit -> useDeleteUnit() hook
 */
export const unitsApi = {
  /**
   * List units for area
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units
   * @deprecated Use useUnits() hook from src/hooks/useUnits.ts
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
   * @deprecated Use useUnit() hook from src/hooks/useUnits.ts
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
   * @deprecated Use useCreateUnit() hook from src/hooks/useUnits.ts
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
   * @deprecated Use useUpdateUnit() hook from src/hooks/useUnits.ts
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
   * @deprecated Use useDeleteUnit() hook from src/hooks/useUnits.ts
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
