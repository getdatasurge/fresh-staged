/**
 * TTN Permissions Service
 * Ported from supabase/functions/_shared/ttnPermissions.ts
 */

// Actually, backend uses Node 20+, so global fetch is fine. Removing undici import to stick to standards.
import { TtnClient } from './client.js';
import { FetchRightsResult, PermissionReport, PreflightResult } from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAIN_USER_KEY_REQUIRED_RIGHTS = [
  'RIGHT_USER_ORGANIZATIONS_CREATE',
  'RIGHT_USER_APPLICATIONS_CREATE',
  'RIGHT_USER_GATEWAYS_CREATE',
];

export const REQUIRED_RIGHTS = {
  core: ['RIGHT_APPLICATION_INFO', 'RIGHT_APPLICATION_TRAFFIC_READ'],
  webhook: ['RIGHT_APPLICATION_SETTINGS_BASIC'],
  devices: ['RIGHT_APPLICATION_DEVICES_READ', 'RIGHT_APPLICATION_DEVICES_WRITE'],
  downlink: ['RIGHT_APPLICATION_TRAFFIC_DOWN_WRITE'],
};

export const PERMISSION_LABELS: Record<string, string> = {
  RIGHT_APPLICATION_INFO: 'Read application info',
  RIGHT_APPLICATION_LINK: 'Link application to Network Server',
  RIGHT_APPLICATION_TRAFFIC_READ: 'Read uplink messages',
  RIGHT_APPLICATION_SETTINGS_BASIC: 'Manage application settings (webhooks)',
  RIGHT_APPLICATION_DEVICES_READ: 'Read devices',
  RIGHT_APPLICATION_DEVICES_WRITE: 'Write devices',
  RIGHT_APPLICATION_TRAFFIC_DOWN_WRITE: 'Send downlink messages',
  RIGHT_USER_ORGANIZATIONS_CREATE: 'Create organizations',
  RIGHT_USER_APPLICATIONS_CREATE: 'Create applications',
  RIGHT_USER_GATEWAYS_CREATE: 'Create gateways',
};

// ============================================================================
// HELPERS
// ============================================================================

function hasRight(rights: string[], requiredRight: string): boolean {
  if (rights.includes(requiredRight)) return true;

  // Wildcards
  if (requiredRight.startsWith('RIGHT_APPLICATION_') && rights.includes('RIGHT_APPLICATION_ALL'))
    return true;
  if (requiredRight.startsWith('RIGHT_ORGANIZATION_') && rights.includes('RIGHT_ORGANIZATION_ALL'))
    return true;
  if (requiredRight.startsWith('RIGHT_GATEWAY_') && rights.includes('RIGHT_GATEWAY_ALL'))
    return true;
  if (requiredRight.startsWith('RIGHT_USER_') && rights.includes('RIGHT_USER_ALL')) return true;

  return false;
}

export function computePermissionReport(rights: string[]): PermissionReport {
  const missing_core = REQUIRED_RIGHTS.core.filter((r) => !hasRight(rights, r));
  const missing_webhook = REQUIRED_RIGHTS.webhook.filter((r) => !hasRight(rights, r));
  const missing_devices = REQUIRED_RIGHTS.devices.filter((r) => !hasRight(rights, r));
  const missing_downlink = REQUIRED_RIGHTS.downlink.filter((r) => !hasRight(rights, r));

  return {
    valid: missing_core.length === 0,
    rights,
    missing_core,
    missing_webhook,
    missing_devices,
    missing_downlink,
    can_configure_webhook: missing_webhook.length === 0,
    can_manage_devices: missing_devices.length === 0,
    can_send_downlinks: missing_downlink.length === 0,
  };
}

// ============================================================================
// SERVICES
// ============================================================================

export class TtnPermissionService {
  /**
   * Validate Main User API Key
   */
  static async validateMainUserApiKey(apiKey: string, requestId: string): Promise<PreflightResult> {
    const endpoint = '/api/v3/auth_info';
    console.log(`[ttnPermissions] [${requestId}] Preflight: Identity Server at ${endpoint}`);

    try {
      const response = await TtnClient.fetch(endpoint, apiKey);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[ttnPermissions] [${requestId}] Preflight failed: ${response.status} ${errorText}`,
        );

        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid Main User API Key',
            hint: 'The TTN_ADMIN_API_KEY is invalid or expired.',
            statusCode: 401,
          };
        }

        return {
          success: false,
          error: `Preflight failed: HTTP ${response.status}`,
          hint: errorText.substring(0, 200),
          statusCode: response.status,
        };
      }

      const data = (await response.json()) as any;

      // Extract rights (logic ported from _shared/ttnPermissions.ts)
      const outer = data.api_key;
      const inner = outer?.api_key;
      const rights = inner?.rights ?? outer?.rights ?? data.universal_rights ?? [];

      const entityIds = outer?.entity_ids ?? {};
      const entityType = Object.keys(entityIds)[0] || null;
      const userId = entityIds?.user_ids?.user_id ?? 'unknown';
      const isAdmin = data.is_admin || false;

      if (isAdmin) {
        return {
          success: true,
          user_id: userId,
          is_admin: true,
          granted_rights: ['ADMIN_ALL_RIGHTS'],
          missing_rights: [],
        };
      }

      // Reject scoped keys
      if (
        entityType === 'application_ids' ||
        entityType === 'organization_ids' ||
        entityType === 'gateway_ids'
      ) {
        return {
          success: false,
          user_id: userId,
          granted_rights: rights,
          missing_rights: MAIN_USER_KEY_REQUIRED_RIGHTS,
          error: 'Scoped API key detected',
          hint: 'Provisioning requires a Personal API Key (user-scoped).',
        };
      }

      // Check required rights
      const missingRights = MAIN_USER_KEY_REQUIRED_RIGHTS.filter((r) => !rights.includes(r));

      if (missingRights.length > 0) {
        return {
          success: false,
          user_id: userId,
          granted_rights: rights,
          missing_rights: missingRights,
          error: 'Personal API key is missing required rights',
          hint: `Missing: ${missingRights.join(', ')}`,
        };
      }

      return {
        success: true,
        user_id: userId,
        is_admin: false,
        granted_rights: rights,
        missing_rights: [],
      };
    } catch (err: any) {
      console.error(`[ttnPermissions] [${requestId}] Preflight exception:`, err);
      return {
        success: false,
        error: err.message || 'Network error',
        hint: 'Check network connectivity.',
      };
    }
  }

  /**
   * Fetch rights for an Application Key
   */
  static async fetchTtnRights(
    applicationId: string,
    apiKey: string,
    requestId: string,
  ): Promise<FetchRightsResult> {
    const endpoint = `/api/v3/applications/${applicationId}/rights`;

    try {
      const response = await TtnClient.fetch(endpoint, apiKey);

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 401)
          return { success: false, error: 'Invalid API key', statusCode: 401 };
        if (response.status === 403)
          return { success: false, error: 'Access denied', statusCode: 403 };
        if (response.status === 404)
          return { success: false, error: 'Application not found', statusCode: 404 };

        return {
          success: false,
          error: `TTN API error (${response.status})`,
          hint: errorText,
          statusCode: response.status,
        };
      }

      const data = (await response.json()) as any;
      return {
        success: true,
        rights: data.rights || [],
        method: 'direct',
      };
    } catch (err: any) {
      return {
        success: false,
        error: 'Network error',
        hint: err.message,
      };
    }
  }

  /**
   * Validate and analyze rights
   */
  static async validateAndAnalyzePermissions(
    applicationId: string,
    apiKey: string,
    requestId: string,
  ): Promise<{
    success: boolean;
    report?: PermissionReport;
    error?: string;
    hint?: string;
    statusCode?: number;
  }> {
    const rightsResult = await this.fetchTtnRights(applicationId, apiKey, requestId);

    if (!rightsResult.success) {
      return {
        success: false,
        error: rightsResult.error,
        hint: rightsResult.hint,
        statusCode: rightsResult.statusCode,
      };
    }

    const report = computePermissionReport(rightsResult.rights || []);
    return { success: true, report };
  }
}
