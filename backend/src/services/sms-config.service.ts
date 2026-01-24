/**
 * SMS Configuration Service
 *
 * Manages Telnyx SMS configuration per organization.
 * Handles CRUD operations for SMS settings with secure API key handling.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { smsConfigs, type SmsConfig, type InsertSmsConfig } from '../db/schema/index.js';
import type { SmsConfigCreate, SmsConfigUpdate, SmsConfigResponse } from '../schemas/sms-config.js';

/**
 * Custom error for SMS config operations
 */
export class SmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsConfigError';
  }
}

/**
 * Transform database SmsConfig to API response
 * Redacts API key for security
 */
function toResponse(config: SmsConfig): SmsConfigResponse {
  return {
    id: config.id,
    organizationId: config.organizationId,
    telnyxApiKeyConfigured: !!config.telnyxApiKey,
    telnyxPhoneNumber: config.telnyxPhoneNumber,
    telnyxMessagingProfileId: config.telnyxMessagingProfileId,
    isEnabled: config.isEnabled,
    lastTestAt: config.lastTestAt,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Get SMS configuration for an organization
 *
 * @param organizationId - Organization UUID
 * @returns SmsConfigResponse if configured, null otherwise
 */
export async function getSmsConfig(
  organizationId: string
): Promise<SmsConfigResponse | null> {
  const [config] = await db
    .select()
    .from(smsConfigs)
    .where(eq(smsConfigs.organizationId, organizationId))
    .limit(1);

  return config ? toResponse(config) : null;
}

/**
 * Create or update SMS configuration for an organization
 * Uses upsert pattern - creates if not exists, updates if exists
 *
 * @param organizationId - Organization UUID
 * @param data - SMS configuration data
 * @returns Created or updated SMS config response
 */
export async function upsertSmsConfig(
  organizationId: string,
  data: SmsConfigCreate
): Promise<SmsConfigResponse> {
  // Check if config already exists
  const existing = await db
    .select()
    .from(smsConfigs)
    .where(eq(smsConfigs.organizationId, organizationId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    const [updated] = await db
      .update(smsConfigs)
      .set({
        telnyxApiKey: data.telnyxApiKey,
        telnyxPhoneNumber: data.telnyxPhoneNumber,
        telnyxMessagingProfileId: data.telnyxMessagingProfileId ?? null,
        isEnabled: data.isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(smsConfigs.organizationId, organizationId))
      .returning();

    return toResponse(updated);
  }

  // Create new
  const insertData: InsertSmsConfig = {
    organizationId,
    telnyxApiKey: data.telnyxApiKey,
    telnyxPhoneNumber: data.telnyxPhoneNumber,
    telnyxMessagingProfileId: data.telnyxMessagingProfileId ?? null,
    isEnabled: data.isEnabled,
  };

  const [created] = await db.insert(smsConfigs).values(insertData).returning();

  return toResponse(created);
}

/**
 * Update SMS configuration partially
 *
 * @param organizationId - Organization UUID
 * @param data - Partial SMS configuration data
 * @returns Updated SMS config response or null if not found
 */
export async function updateSmsConfig(
  organizationId: string,
  data: SmsConfigUpdate
): Promise<SmsConfigResponse | null> {
  // Build update object with only provided fields
  const updateData: Partial<InsertSmsConfig> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (data.telnyxApiKey !== undefined) {
    updateData.telnyxApiKey = data.telnyxApiKey;
  }
  if (data.telnyxPhoneNumber !== undefined) {
    updateData.telnyxPhoneNumber = data.telnyxPhoneNumber;
  }
  if (data.telnyxMessagingProfileId !== undefined) {
    updateData.telnyxMessagingProfileId = data.telnyxMessagingProfileId;
  }
  if (data.isEnabled !== undefined) {
    updateData.isEnabled = data.isEnabled;
  }

  const [updated] = await db
    .update(smsConfigs)
    .set(updateData)
    .where(eq(smsConfigs.organizationId, organizationId))
    .returning();

  return updated ? toResponse(updated) : null;
}

/**
 * Delete SMS configuration for an organization
 *
 * @param organizationId - Organization UUID
 * @returns true if deleted, false if not found
 */
export async function deleteSmsConfig(organizationId: string): Promise<boolean> {
  const result = await db
    .delete(smsConfigs)
    .where(eq(smsConfigs.organizationId, organizationId))
    .returning({ id: smsConfigs.id });

  return result.length > 0;
}

/**
 * Get raw SMS config with API key (for internal use only)
 * Used by notification workers to send SMS
 *
 * @param organizationId - Organization UUID
 * @returns Full SmsConfig including API key, or null if not found
 */
export async function getSmsConfigWithCredentials(
  organizationId: string
): Promise<SmsConfig | null> {
  const [config] = await db
    .select()
    .from(smsConfigs)
    .where(eq(smsConfigs.organizationId, organizationId))
    .limit(1);

  return config || null;
}

/**
 * Update last test timestamp
 *
 * @param organizationId - Organization UUID
 */
export async function updateLastTestAt(organizationId: string): Promise<void> {
  await db
    .update(smsConfigs)
    .set({ lastTestAt: new Date() })
    .where(eq(smsConfigs.organizationId, organizationId));
}
