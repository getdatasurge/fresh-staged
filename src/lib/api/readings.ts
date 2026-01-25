import { createAuthenticatedClient } from '../api-client';
import type { ReadingResponse, ReadingsListResponse, PaginationParams } from '../api-types';

/**
 * @deprecated Use tRPC hooks from src/hooks/useReadings.ts instead.
 * These Ky-based API wrappers are being migrated to tRPC for type safety.
 *
 * Migration:
 * - listReadings -> useReadings() hook
 * - getLatestReading -> useLatestReading() hook
 *
 * NOTE: Bulk ingestion stays as REST (POST /api/ingest/readings) with API key auth.
 */
export const readingsApi = {
  /**
   * List readings for a unit with pagination
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings
   * @deprecated Use useReadings() hook from src/hooks/useReadings.ts
   */
  listReadings: async (
    orgId: string,
    siteId: string,
    areaId: string,
    unitId: string,
    params: PaginationParams & { start?: string; end?: string },
    accessToken: string
  ): Promise<ReadingResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    const searchParams = new URLSearchParams();
    
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.start) searchParams.set('start', params.start);
    if (params.end) searchParams.set('end', params.end);

    const queryString = searchParams.toString();
    const url = 'api/orgs/' + orgId + '/sites/' + siteId + '/areas/' + areaId + '/units/' + unitId + '/readings' + (queryString ? '?' + queryString : '');
    
    return client.get(url).json<ReadingResponse[]>();
  },

  /**
   * Get latest reading for a unit
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings?limit=1
   * @deprecated Use useLatestReading() hook from src/hooks/useReadings.ts
   */
  getLatestReading: async (
    orgId: string,
    siteId: string,
    areaId: string,
    unitId: string,
    accessToken: string
  ): Promise<ReadingResponse | null> => {
    const client = createAuthenticatedClient(accessToken);
    const url = 'api/orgs/' + orgId + '/sites/' + siteId + '/areas/' + areaId + '/units/' + unitId + '/readings?limit=1';
    
    const readings = await client.get(url).json<ReadingResponse[]>();
    return readings[0] || null;
  },
};
