/**
 * TTN Settings Service
 * Ports manage-ttn-settings logic
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { ttnConnections } from "../../db/schema.js";
import { TtnClient } from "./client.js";
import { TtnCrypto } from "./crypto.js";
import { TtnTestResult } from "./types.js";

export class TtnSettingsService {
  /**
   * Get settings for an organization
   */
  static async getSettings(organizationId: string) {
    const record = await db.query.ttnConnections.findFirst({
      where: eq(ttnConnections.organizationId, organizationId),
    });

    if (!record) return null;

    return {
      isEnabled: record.isEnabled,
      connectionStatus: record.provisioningStatus,
      region: record.ttnRegion,
      applicationId: record.ttnApplicationId,
      hasApiKey: !!record.ttnApiKeyEncrypted,
      apiKeyLast4: record.ttnApiKeyLast4,
      webhookUrl: record.ttnWebhookUrl,
      webhookSecretLast4: record.ttnWebhookSecretLast4,
    };
  }

  /**
   * Test connection to TTN
   */
  static async testConnection(organizationId: string, deviceId?: string): Promise<TtnTestResult> {
    const record = await db.query.ttnConnections.findFirst({
      where: eq(ttnConnections.organizationId, organizationId),
    });

    if (!record || !record.ttnApiKeyEncrypted || !record.ttnApplicationId) {
      return {
        success: false,
        error: "Not configured",
        testedAt: new Date().toISOString(),
        endpointTested: "",
        effectiveApplicationId: "",
        clusterTested: "",
      }; 
    }

    const salt = process.env.TTN_ENCRYPTION_SALT || "default-salt";
    const apiKey = TtnCrypto.deobfuscateKey(record.ttnApiKeyEncrypted, salt);
    const appId = record.ttnApplicationId;

    // Test Application Access
    try {
      const appEndpoint = `/api/v3/applications/${appId}`;
      const appData = await TtnClient.getJson<any>(appEndpoint, apiKey);
      
      const result: TtnTestResult = {
        success: true,
        testedAt: new Date().toISOString(),
        endpointTested: appEndpoint,
        effectiveApplicationId: appId,
        clusterTested: record.ttnRegion,
        apiKeyLast4: record.ttnApiKeyLast4 || undefined,
        applicationName: appData.name || appId,
      };

      // Optional Device Test
      if (deviceId) {
        const deviceEndpoint = `/api/v3/applications/${appId}/devices/${deviceId}`;
        try {
          await TtnClient.getJson(deviceEndpoint, apiKey);
          result.deviceTest = { deviceId, exists: true };
        } catch (err: any) {
          result.deviceTest = { deviceId, exists: false, error: err.message };
          // If device check fails, the whole test is partial success or failure depending on UX needs.
          // The edge function marked it as failure if device was not found.
          result.success = false;
          result.error = "Device not found";
        }
      }

      return result;

    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        testedAt: new Date().toISOString(),
        endpointTested: `/api/v3/applications/${appId}`,
        effectiveApplicationId: appId,
        clusterTested: record.ttnRegion,
      };
    }
  }
}
