/**
 * Escalation Contacts Service
 *
 * Provides data access operations for escalation contact management.
 * Uses raw SQL since escalation_contacts table is not in Drizzle schema.
 *
 * Operations:
 * - listEscalationContacts: List active contacts for organization
 * - createEscalationContact: Create a new contact
 * - updateEscalationContact: Update contact fields
 * - softDeleteEscalationContact: Mark contact as inactive
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import type {
  EscalationContact,
  CreateEscalationContact,
  UpdateEscalationContact,
} from '../schemas/escalation-contacts.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw database row type with index signature for Drizzle compatibility
 */
type RawEscalationContactRow = Record<string, unknown> & {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  priority: number;
  notification_channels: string[];
  is_active: boolean;
  user_id: string | null;
  created_at: string;
};

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List active escalation contacts for an organization
 * @returns Array of EscalationContact ordered by priority ascending
 */
export async function listEscalationContacts(
  organizationId: string
): Promise<EscalationContact[]> {
  const result = await db.execute<RawEscalationContactRow>(sql`
    SELECT
      id,
      organization_id,
      name,
      email,
      phone,
      priority,
      notification_channels,
      is_active,
      user_id,
      created_at::text as created_at
    FROM escalation_contacts
    WHERE organization_id = ${organizationId}
      AND is_active = true
    ORDER BY priority ASC
  `);

  return result.rows;
}

/**
 * Create a new escalation contact
 * @returns The created EscalationContact
 */
export async function createEscalationContact(
  organizationId: string,
  data: CreateEscalationContact
): Promise<EscalationContact> {
  // Build the notification_channels array literal for PostgreSQL
  const channelsArray = data.notification_channels.length > 0
    ? `ARRAY[${data.notification_channels.map(c => `'${c}'`).join(',')}]::text[]`
    : "ARRAY[]::text[]";

  const result = await db.execute<RawEscalationContactRow>(sql`
    INSERT INTO escalation_contacts (
      organization_id,
      name,
      email,
      phone,
      priority,
      notification_channels,
      is_active,
      user_id
    ) VALUES (
      ${organizationId},
      ${data.name},
      ${data.email},
      ${data.phone},
      ${data.priority},
      ${sql.raw(channelsArray)},
      ${data.is_active},
      ${data.user_id}
    )
    RETURNING
      id,
      organization_id,
      name,
      email,
      phone,
      priority,
      notification_channels,
      is_active,
      user_id,
      created_at::text as created_at
  `);

  if (result.rows.length === 0) {
    throw new Error('Failed to create escalation contact');
  }

  return result.rows[0];
}

/**
 * Get an escalation contact by ID
 * @returns EscalationContact or null if not found
 */
export async function getEscalationContact(
  contactId: string,
  organizationId: string
): Promise<EscalationContact | null> {
  const result = await db.execute<RawEscalationContactRow>(sql`
    SELECT
      id,
      organization_id,
      name,
      email,
      phone,
      priority,
      notification_channels,
      is_active,
      user_id,
      created_at::text as created_at
    FROM escalation_contacts
    WHERE id = ${contactId}
      AND organization_id = ${organizationId}
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Update an existing escalation contact
 * Only updates provided fields
 * @returns true if updated, false if not found
 */
export async function updateEscalationContact(
  contactId: string,
  organizationId: string,
  data: UpdateEscalationContact
): Promise<boolean> {
  // Build SET clause dynamically based on provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    setClauses.push(`name = $${values.length + 1}`);
    values.push(data.name);
  }

  if (data.email !== undefined) {
    setClauses.push(`email = $${values.length + 1}`);
    values.push(data.email);
  }

  if (data.phone !== undefined) {
    setClauses.push(`phone = $${values.length + 1}`);
    values.push(data.phone);
  }

  if (data.priority !== undefined) {
    setClauses.push(`priority = $${values.length + 1}`);
    values.push(data.priority);
  }

  if (data.notification_channels !== undefined) {
    const channelsArray = data.notification_channels.length > 0
      ? `ARRAY[${data.notification_channels.map(c => `'${c}'`).join(',')}]::text[]`
      : "ARRAY[]::text[]";
    setClauses.push(`notification_channels = ${channelsArray}`);
  }

  if (data.is_active !== undefined) {
    setClauses.push(`is_active = $${values.length + 1}`);
    values.push(data.is_active);
  }

  if (data.user_id !== undefined) {
    setClauses.push(`user_id = $${values.length + 1}`);
    values.push(data.user_id);
  }

  if (setClauses.length === 0) {
    return true; // Nothing to update
  }

  const setClause = setClauses.join(', ');
  const result = await db.execute(sql`
    UPDATE escalation_contacts
    SET ${sql.raw(setClause)}
    WHERE id = ${contactId}
      AND organization_id = ${organizationId}
  `);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Soft delete an escalation contact by marking is_active = false
 * @returns true if updated, false if not found
 */
export async function softDeleteEscalationContact(
  contactId: string,
  organizationId: string
): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE escalation_contacts
    SET is_active = false
    WHERE id = ${contactId}
      AND organization_id = ${organizationId}
  `);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Check if escalation contact exists in organization
 * @returns true if exists, false otherwise
 */
export async function escalationContactExists(
  contactId: string,
  organizationId: string
): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    SELECT id FROM escalation_contacts
    WHERE id = ${contactId}
      AND organization_id = ${organizationId}
    LIMIT 1
  `);

  return result.rows.length > 0;
}
