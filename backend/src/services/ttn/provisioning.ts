/**
 * TTN Provisioning Service
 * Ports ttn-bootstrap logic
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { ttnConnections } from "../../db/schema.js";
import { AppError } from "../../lib/error.js";
import { TtnCrypto } from "./crypto.js";
import { TtnPermissionService } from "./permissions.js";
import { PermissionReport } from "./types.js";
import { TtnWebhookService } from "./webhook.js";

export class TtnProvisioningService {
  /**
   * Validate API Key configuration without saving
   */
  static async validateConfiguration(
    apiKey: string,
    applicationId: string,
    region: string
  ): Promise<{ valid: boolean; permissions?: PermissionReport; error?: string }> {
    const requestId = crypto.randomUUID();
    
    // Validate key format locally
    if (!apiKey.startsWith("NNSXS.")) {
      return { valid: false, error: "Invalid API key format. Must start with NNSXS." };
    }

    // Call TTN
    const result = await TtnPermissionService.validateAndAnalyzePermissions(
      applicationId, 
      apiKey, 
      requestId
    );

    if (!result.success) {
      return { 
        valid: false, 
        error: result.error || "Validation failed",
        permissions: result.report 
      };
    }

    if (!result.report?.valid) {
      return {
        valid: false,
        error: "Missing required permissions",
        permissions: result.report
      };
    }

    return { valid: true, permissions: result.report };
  }

  /**
   * Save configuration and set up webhook
   */
  static async provisionOrganization(
    organizationId: string,
    apiKey: string,
    applicationId: string,
    region: string
  ): Promise<{ 
    success: boolean; 
    webhookAction: "created" | "updated" | "unchanged";
    config: any;
  }> {
    const requestId = crypto.randomUUID();
    const encryptionSalt = process.env.TTN_ENCRYPTION_SALT || "default-salt"; // Env var

    // 1. Validate first
    const validation = await this.validateConfiguration(apiKey, applicationId, region);
    if (!validation.valid) {
      throw new AppError("TTN_VALIDATION_FAILED", validation.error || "Configuration invalid", 400);
    }

    // 2. Encrypt Key
    const encryptedKey = TtnCrypto.obfuscateKey(apiKey, encryptionSalt);

    // 3. Upsert Connection
    // Check if exists
    const existing = await db.select().from(ttnConnections).where(eq(ttnConnections.organizationId, organizationId)).limit(1);
    
    if (existing.length === 0) {
      await db.insert(ttnConnections).values({
        organizationId,
        ttnRegion: region,
        ttnApplicationId: applicationId,
        ttnApiKeyEncrypted: encryptedKey,
        ttnApiKeyLast4: apiKey.slice(-4),
        isEnabled: true,
        provisioningStatus: "complete",
      });
    } else {
      await db.update(ttnConnections)
        .set({
          ttnRegion: region,
          ttnApplicationId: applicationId,
          ttnApiKeyEncrypted: encryptedKey,
          ttnApiKeyLast4: apiKey.slice(-4),
          isEnabled: true,
          provisioningStatus: "complete",
        })
        .where(eq(ttnConnections.organizationId, organizationId));
    }

    // 4. Configure Webhook (via WebhookService)
    const webhookResult = await TtnWebhookService.ensureWebhook(organizationId, apiKey, applicationId);

    return {
      success: true,
      webhookAction: webhookResult.action,
      config: {
        application_id: applicationId,
        api_key_last4: apiKey.slice(-4),
        webhook_url: webhookResult.url,
      }
    };
  }
}
