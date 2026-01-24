import { createAuthenticatedClient } from '../api-client';
import type {
  AlertResponse,
  AlertsListResponse,
  PaginationParams,
  AlertStatus,
  AlertAcknowledgeRequest,
  AlertResolveRequest,
} from '../api-types';

export const alertsApi = {
  /**
   * List alerts for organization with optional filters
   * GET /api/orgs/:orgId/alerts
   */
  listAlerts: async (
    orgId: string,
    params: PaginationParams & {
      status?: AlertStatus | AlertStatus[];
      unitId?: string;
      siteId?: string;
    },
    accessToken: string
  ): Promise<AlertResponse[]> => {
    const client = createAuthenticatedClient(accessToken);
    const searchParams = new URLSearchParams();
    
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      statuses.forEach(s => searchParams.append('status', s));
    }
    if (params.unitId) searchParams.set('unitId', params.unitId);
    if (params.siteId) searchParams.set('siteId', params.siteId);

    const queryString = searchParams.toString();
    const url = 'api/orgs/' + orgId + '/alerts' + (queryString ? '?' + queryString : '');
    
    return client.get(url).json<AlertResponse[]>();
  },

  /**
   * Get single alert by ID
   * GET /api/orgs/:orgId/alerts/:alertId
   */
  getAlert: async (
    orgId: string,
    alertId: string,
    accessToken: string
  ): Promise<AlertResponse> => {
    const client = createAuthenticatedClient(accessToken);
    return client.get('api/orgs/' + orgId + '/alerts/' + alertId).json<AlertResponse>();
  },

  /**
   * Acknowledge an alert
   * POST /api/orgs/:orgId/alerts/:alertId/acknowledge
   * Requires staff+ role
   */
  acknowledgeAlert: async (
    orgId: string,
    alertId: string,
    notes: string | undefined,
    accessToken: string
  ): Promise<AlertResponse> => {
    const client = createAuthenticatedClient(accessToken);
    const body: AlertAcknowledgeRequest = notes ? { notes } : {};
    return client.post('api/orgs/' + orgId + '/alerts/' + alertId + '/acknowledge', {
      json: body
    }).json<AlertResponse>();
  },

  /**
   * Resolve an alert with corrective action
   * POST /api/orgs/:orgId/alerts/:alertId/resolve
   * Requires staff+ role
   */
  resolveAlert: async (
    orgId: string,
    alertId: string,
    resolution: string,
    correctiveAction: string | undefined,
    accessToken: string
  ): Promise<AlertResponse> => {
    const client = createAuthenticatedClient(accessToken);
    const body: AlertResolveRequest = {
      resolution,
      correctiveAction
    };
    return client.post('api/orgs/' + orgId + '/alerts/' + alertId + '/resolve', {
      json: body
    }).json<AlertResponse>();
  },

  /**
   * List alerts for a specific unit
   * Convenience method using listAlerts with unitId filter
   */
  listUnitAlerts: async (
    orgId: string,
    unitId: string,
    params: PaginationParams & { status?: AlertStatus | AlertStatus[] },
    accessToken: string
  ): Promise<AlertResponse[]> => {
    return alertsApi.listAlerts(orgId, { ...params, unitId }, accessToken);
  },
};
