/**
 * Escalation Contacts Zod Schemas
 *
 * Provides validation schemas for escalation contact operations:
 * - EscalationContactSchema: Full contact shape from database
 * - CreateEscalationContactSchema: Input for creating new contacts
 * - UpdateEscalationContactSchema: Partial updates to existing contacts
 */

import { z } from 'zod';

/**
 * Valid notification channel types
 */
const NotificationChannelSchema = z.enum(['WEB_TOAST', 'IN_APP_CENTER', 'EMAIL', 'SMS']);

/**
 * Full escalation contact schema matching database columns
 */
export const EscalationContactSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  priority: z.number().int().min(1),
  notification_channels: z.array(NotificationChannelSchema),
  is_active: z.boolean(),
  user_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

/**
 * Schema for creating new escalation contacts
 * organization_id is set from context, not user input
 */
export const CreateEscalationContactSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  priority: z.number().int().min(1),
  notification_channels: z.array(NotificationChannelSchema).default(['EMAIL']),
  is_active: z.boolean().default(true),
  user_id: z.string().uuid().nullable(),
});

/**
 * Schema for updating existing escalation contacts
 * All fields optional for partial updates
 */
export const UpdateEscalationContactSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  priority: z.number().int().min(1).optional(),
  notification_channels: z.array(NotificationChannelSchema).optional(),
  is_active: z.boolean().optional(),
  user_id: z.string().uuid().nullable().optional(),
});

// Type exports for use in services and routers
export type EscalationContact = z.infer<typeof EscalationContactSchema>;
export type CreateEscalationContact = z.infer<typeof CreateEscalationContactSchema>;
export type UpdateEscalationContact = z.infer<typeof UpdateEscalationContactSchema>;
