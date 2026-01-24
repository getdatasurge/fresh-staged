import type { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { ttnConnections } from '../db/schema/tenancy.js';

// Augment FastifyRequest to include orgContext for API key auth
declare module 'fastify' {
  interface FastifyRequest {
    orgContext?: {
      organizationId: string;
      connectionId: string;
    };
  }
}

/**
 * Secure comparison for API keys using constant-time algorithm
 * Prevents timing attacks during key validation
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * API Key Authentication Middleware
 *
 * Validates API keys from X-API-Key or X-Webhook-Secret headers
 * against stored organization webhook secrets in ttnConnections table.
 *
 * On success: attaches orgContext to request with organizationId and connectionId
 * On failure: returns 401 Unauthorized
 *
 * Usage: Apply as preHandler to routes requiring API key authentication
 */
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract API key from headers
  const providedKey =
    request.headers['x-api-key'] ||
    request.headers['x-webhook-secret'];

  if (!providedKey || typeof providedKey !== 'string') {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key',
      },
    });
  }

  // Query all active TTN connections
  // We need to check all connections to find the matching one
  // (can't filter by webhookSecret directly due to constant-time comparison requirement)
  const connections = await db
    .select({
      id: ttnConnections.id,
      organizationId: ttnConnections.organizationId,
      webhookSecret: ttnConnections.webhookSecret,
    })
    .from(ttnConnections)
    .where(and(
      eq(ttnConnections.isActive, true)
    ));

  // Find matching connection using constant-time comparison
  const matchingConnection = connections.find((conn) =>
    secureCompare(conn.webhookSecret, providedKey)
  );

  if (!matchingConnection) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
      },
    });
  }

  // Update last used timestamp
  await db
    .update(ttnConnections)
    .set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ttnConnections.id, matchingConnection.id));

  // Attach org context to request for downstream handlers
  request.orgContext = {
    organizationId: matchingConnection.organizationId,
    connectionId: matchingConnection.id,
  };
}
