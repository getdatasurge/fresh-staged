import { createAuthenticatedClient } from '../api-client';
import type { ReadingResponse, ReadingsListResponse, PaginationParams } from '../api-types';

export const readingsApi = {
  /**
   * List readings for a unit with pagination
   * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings
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
