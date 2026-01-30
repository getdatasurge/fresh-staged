/**
 * TTN Gateway Management Service
 *
 * Handles TTN gateway CRUD operations with local database synchronization.
 * Manages the relationship between local gateway records and TTN.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { gateways, type Gateway } from '../db/schema/hierarchy.js';
import { ttnConnections, type TtnConnection } from '../db/schema/tenancy.js';
import { createTTNClient, TTNApiError, type TTNGateway, type TTNConfig } from './ttn.service.js';
import type {
  RegisterTTNGatewayRequest,
  UpdateTTNGatewayRequest,
  GatewayStatus,
} from '../schemas/ttn-gateways.js';

// Combined gateway response for API
export interface TTNGatewayWithLocation {
  id: string;
  gatewayId: string;
  gatewayEui: string;
  name: string | null;
  description: string | null;
  frequencyPlanId: string | null;
  status: GatewayStatus;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  siteId: string | null;
  lastSeenAt: Date | null;
  ttnSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get TTN connection for an organization
 */
export async function getTTNConnection(organizationId: string): Promise<TtnConnection | null> {
  const [connection] = await db
    .select()
    .from(ttnConnections)
    .where(
      and(eq(ttnConnections.organizationId, organizationId), eq(ttnConnections.isActive, true)),
    )
    .limit(1);

  return connection ?? null;
}

/**
 * Get TTN client configuration for an organization
 */
async function getTTNConfigForOrg(organizationId: string): Promise<TTNConfig | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection || !connection.applicationId) {
    return null;
  }

  const apiUrl = process.env.TTN_API_URL;
  if (!apiUrl) {
    return null;
  }

  return {
    apiUrl,
    applicationId: connection.applicationId,
    apiKey: connection.webhookSecret,
  };
}

/**
 * Convert database gateway to API response
 */
function gatewayToResponse(gateway: Gateway): TTNGatewayWithLocation {
  return {
    id: gateway.id,
    gatewayId: gateway.gatewayId,
    gatewayEui: gateway.gatewayEui,
    name: gateway.name,
    description: gateway.description,
    frequencyPlanId: gateway.frequencyPlanId,
    status: gateway.status as GatewayStatus,
    latitude: gateway.latitude ? parseFloat(gateway.latitude) : null,
    longitude: gateway.longitude ? parseFloat(gateway.longitude) : null,
    altitude: gateway.altitude,
    siteId: gateway.siteId,
    lastSeenAt: gateway.lastSeenAt,
    ttnSynced: true,
    createdAt: gateway.createdAt,
    updatedAt: gateway.updatedAt,
  };
}

/**
 * List all TTN gateways for an organization
 */
export async function listTTNGateways(organizationId: string): Promise<TTNGatewayWithLocation[]> {
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    return [];
  }

  const results = await db
    .select()
    .from(gateways)
    .where(and(eq(gateways.ttnConnectionId, connection.id), eq(gateways.isActive, true)));

  return results.map(gatewayToResponse);
}

/**
 * Get a specific TTN gateway by ID
 */
export async function getTTNGateway(
  gatewayId: string,
  organizationId: string,
): Promise<TTNGatewayWithLocation | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    return null;
  }

  // Try to find by database ID (UUID) first
  let [gateway] = await db
    .select()
    .from(gateways)
    .where(
      and(
        eq(gateways.id, gatewayId),
        eq(gateways.ttnConnectionId, connection.id),
        eq(gateways.isActive, true),
      ),
    )
    .limit(1);

  // If not found by UUID, try by TTN gateway ID
  if (!gateway) {
    [gateway] = await db
      .select()
      .from(gateways)
      .where(
        and(
          eq(gateways.gatewayId, gatewayId),
          eq(gateways.ttnConnectionId, connection.id),
          eq(gateways.isActive, true),
        ),
      )
      .limit(1);
  }

  // If still not found, try by gateway EUI
  if (!gateway) {
    [gateway] = await db
      .select()
      .from(gateways)
      .where(
        and(
          eq(gateways.gatewayEui, gatewayId.toUpperCase()),
          eq(gateways.ttnConnectionId, connection.id),
          eq(gateways.isActive, true),
        ),
      )
      .limit(1);
  }

  if (!gateway) {
    return null;
  }

  return gatewayToResponse(gateway);
}

/**
 * Register a new gateway in TTN and local database
 */
export async function registerTTNGateway(
  organizationId: string,
  data: RegisterTTNGatewayRequest,
): Promise<TTNGatewayWithLocation> {
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    throw new TTNConfigError('TTN connection not configured for organization');
  }

  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (!ttnConfig) {
    throw new TTNConfigError('TTN connection not configured for organization');
  }

  const client = createTTNClient(ttnConfig);

  // Register in TTN first
  let ttnGateway: TTNGateway;
  try {
    ttnGateway = await client.registerGateway({
      gatewayId: data.gatewayId,
      gatewayEui: data.gatewayEui,
      name: data.name,
      description: data.description,
      frequencyPlanId: data.frequencyPlanId,
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude,
    });
  } catch (error) {
    if (error instanceof TTNApiError) {
      throw new TTNRegistrationError(`Failed to register gateway in TTN: ${error.message}`);
    }
    throw error;
  }

  // Create local gateway record
  const [gateway] = await db
    .insert(gateways)
    .values({
      ttnConnectionId: connection.id,
      siteId: data.siteId || null,
      gatewayId: data.gatewayId,
      gatewayEui: data.gatewayEui.toUpperCase(),
      name: data.name || data.gatewayId,
      description: data.description || null,
      frequencyPlanId: data.frequencyPlanId,
      status: 'unknown',
      latitude: data.latitude?.toString() || null,
      longitude: data.longitude?.toString() || null,
      altitude: data.altitude ?? null,
    })
    .returning();

  return gatewayToResponse(gateway);
}

/**
 * Update a TTN gateway
 */
export async function updateTTNGateway(
  gatewayId: string,
  organizationId: string,
  data: UpdateTTNGatewayRequest,
): Promise<TTNGatewayWithLocation | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    return null;
  }

  // Find the gateway
  let [existingGateway] = await db
    .select()
    .from(gateways)
    .where(
      and(
        eq(gateways.id, gatewayId),
        eq(gateways.ttnConnectionId, connection.id),
        eq(gateways.isActive, true),
      ),
    )
    .limit(1);

  // Try by TTN gateway ID if not found by UUID
  if (!existingGateway) {
    [existingGateway] = await db
      .select()
      .from(gateways)
      .where(
        and(
          eq(gateways.gatewayId, gatewayId),
          eq(gateways.ttnConnectionId, connection.id),
          eq(gateways.isActive, true),
        ),
      )
      .limit(1);
  }

  if (!existingGateway) {
    return null;
  }

  // Update TTN if relevant fields changed
  const ttnUpdateNeeded =
    data.name !== undefined ||
    data.description !== undefined ||
    data.frequencyPlanId !== undefined ||
    data.latitude !== undefined ||
    data.longitude !== undefined;

  if (ttnUpdateNeeded) {
    const ttnConfig = await getTTNConfigForOrg(organizationId);
    if (ttnConfig) {
      const client = createTTNClient(ttnConfig);
      try {
        await client.updateGateway(existingGateway.gatewayId, {
          name: data.name,
          description: data.description,
          frequencyPlanId: data.frequencyPlanId,
          latitude: data.latitude,
          longitude: data.longitude,
          altitude: data.altitude,
        });
      } catch (error) {
        // Log but don't fail - local update can still proceed
        console.error('Failed to update gateway in TTN:', error);
      }
    }
  }

  // Build update data
  const updateData: Partial<Gateway> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
  }
  if (data.frequencyPlanId !== undefined) {
    updateData.frequencyPlanId = data.frequencyPlanId;
  }
  if (data.siteId !== undefined) {
    updateData.siteId = data.siteId;
  }
  if (data.latitude !== undefined) {
    updateData.latitude = data.latitude?.toString() || null;
  }
  if (data.longitude !== undefined) {
    updateData.longitude = data.longitude?.toString() || null;
  }
  if (data.altitude !== undefined) {
    updateData.altitude = data.altitude;
  }

  const [updatedGateway] = await db
    .update(gateways)
    .set(updateData)
    .where(eq(gateways.id, existingGateway.id))
    .returning();

  return gatewayToResponse(updatedGateway);
}

/**
 * Deregister (delete) a gateway from TTN and local database
 */
export async function deregisterTTNGateway(
  gatewayId: string,
  organizationId: string,
): Promise<boolean> {
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    return false;
  }

  // Find the gateway
  let [existingGateway] = await db
    .select()
    .from(gateways)
    .where(
      and(
        eq(gateways.id, gatewayId),
        eq(gateways.ttnConnectionId, connection.id),
        eq(gateways.isActive, true),
      ),
    )
    .limit(1);

  // Try by TTN gateway ID if not found by UUID
  if (!existingGateway) {
    [existingGateway] = await db
      .select()
      .from(gateways)
      .where(
        and(
          eq(gateways.gatewayId, gatewayId),
          eq(gateways.ttnConnectionId, connection.id),
          eq(gateways.isActive, true),
        ),
      )
      .limit(1);
  }

  if (!existingGateway) {
    return false;
  }

  // Delete from TTN
  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (ttnConfig) {
    const client = createTTNClient(ttnConfig);
    try {
      await client.deregisterGateway(existingGateway.gatewayId);
    } catch (error) {
      if (!(error instanceof TTNApiError && error.statusCode === 404)) {
        console.error('Failed to deregister gateway from TTN:', error);
        // Continue with local deletion anyway
      }
    }
  }

  // Soft delete local gateway
  await db
    .update(gateways)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(gateways.id, existingGateway.id));

  return true;
}

/**
 * Update gateway status from TTN
 */
export async function updateGatewayStatus(
  gatewayId: string,
  organizationId: string,
): Promise<TTNGatewayWithLocation | null> {
  const connection = await getTTNConnection(organizationId);
  if (!connection) {
    return null;
  }

  // Find the gateway
  const [existingGateway] = await db
    .select()
    .from(gateways)
    .where(
      and(
        eq(gateways.gatewayId, gatewayId),
        eq(gateways.ttnConnectionId, connection.id),
        eq(gateways.isActive, true),
      ),
    )
    .limit(1);

  if (!existingGateway) {
    return null;
  }

  const ttnConfig = await getTTNConfigForOrg(organizationId);
  if (!ttnConfig) {
    return gatewayToResponse(existingGateway);
  }

  const client = createTTNClient(ttnConfig);

  try {
    const status = await client.getGatewayStatus(existingGateway.gatewayId);

    const updateData: Partial<Gateway> = {
      status: status?.online ? 'online' : 'offline',
      updatedAt: new Date(),
    };

    if (status?.last_seen_at) {
      updateData.lastSeenAt = new Date(status.last_seen_at);
    }

    const [updatedGateway] = await db
      .update(gateways)
      .set(updateData)
      .where(eq(gateways.id, existingGateway.id))
      .returning();

    return gatewayToResponse(updatedGateway);
  } catch (error) {
    console.error('Failed to get gateway status from TTN:', error);
    return gatewayToResponse(existingGateway);
  }
}

/**
 * Custom error for TTN configuration issues
 */
export class TTNConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTNConfigError';
  }
}

/**
 * Custom error for TTN registration failures
 */
export class TTNRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTNRegistrationError';
  }
}
