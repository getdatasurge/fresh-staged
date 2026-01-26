/**
 * TTN Service Types
 * Ported from supabase/functions/_shared/ttnConfig.ts
 */

export interface TtnConfig {
  region: string;
  apiKey: string;
  applicationId: string;       // Per-org TTN application ID
  clusterBaseUrl: string;      // THE ONLY TTN URL - all planes use this
  webhookSecret?: string;
  webhookUrl?: string;
  isEnabled: boolean;
  provisioningStatus: string;
  // Gateway-specific API key (user-scoped, has gateway rights)
  gatewayApiKey?: string;
  hasGatewayKey: boolean;
}

export interface TtnConnectionRow {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  ttn_region: string;
  // TTN Organization (created first for better permission isolation)
  ttn_organization_id: string | null;
  ttn_organization_name: string | null;
  ttn_org_api_key_encrypted: string | null;
  ttn_org_api_key_last4: string | null;
  ttn_org_api_key_id: string | null;
  // TTN Application (created under organization)
  ttn_application_id: string | null;
  ttn_application_name: string | null;
  ttn_api_key_encrypted: string | null;
  ttn_api_key_last4: string | null;
  ttn_api_key_id: string | null;
  // Gateway-specific API key (org-scoped for gateway provisioning)
  ttn_gateway_api_key_encrypted: string | null;
  ttn_gateway_api_key_last4: string | null;
  ttn_gateway_api_key_id: string | null;
  ttn_gateway_rights_verified: boolean | null;
  // Webhook credentials
  ttn_webhook_secret_encrypted: string | null;
  ttn_webhook_secret_last4: string | null;
  ttn_webhook_url: string | null;
  provisioning_status: string | null;
  provisioning_error: string | null;
  ttn_application_provisioned_at: string | null;
}

export interface TtnTestResult {
  success: boolean;
  error?: string;
  hint?: string;
  statusCode?: number;
  applicationName?: string;
  testedAt: string;
  endpointTested: string;
  effectiveApplicationId: string;
  apiKeyLast4?: string;
  clusterTested: string;
  deviceTest?: {
    deviceId: string;
    exists: boolean;
    error?: string;
  };
}

export interface PermissionReport {
  valid: boolean;
  rights: string[];
  missing_core: string[];
  missing_webhook: string[];
  missing_devices: string[];
  missing_downlink: string[];
  can_configure_webhook: boolean;
  can_manage_devices: boolean;
  can_send_downlinks: boolean;
}

export interface FetchRightsResult {
  success: boolean;
  rights?: string[];
  error?: string;
  hint?: string;
  statusCode?: number;
  method?: "direct" | "probe";
}

export interface PreflightResult {
  success: boolean;
  user_id?: string;
  granted_rights?: string[];
  missing_rights?: string[];
  is_admin?: boolean;
  error?: string;
  hint?: string;
  statusCode?: number;
}
