/**
 * Escalation Contacts tRPC Router
 *
 * Provides type-safe procedures for escalation contact management:
 * - list: List active escalation contacts for organization
 * - create: Create a new escalation contact (manager+ only)
 * - update: Modify escalation contact settings (manager+ only)
 * - delete: Soft delete an escalation contact (manager+ only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import {
  EscalationContactSchema,
  CreateEscalationContactSchema,
  UpdateEscalationContactSchema,
} from '../schemas/escalation-contacts.js';
import * as escalationContactsService from '../services/escalation-contacts.service.js';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Input schema for org-scoped procedures
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for contact-specific operations
 */
const ContactIdInput = z.object({
  organizationId: z.string().uuid(),
  contactId: z.string().uuid(),
});

/**
 * Input schema for create with data payload
 */
const CreateInput = z.object({
  organizationId: z.string().uuid(),
  data: CreateEscalationContactSchema,
});

/**
 * Input schema for update with data payload
 */
const UpdateInput = z.object({
  organizationId: z.string().uuid(),
  contactId: z.string().uuid(),
  data: UpdateEscalationContactSchema,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Role check for manager+ access
 * Managers, admins, and owners can manage escalation contacts
 */
function checkManagerRole(role: string): void {
  if (!['manager', 'admin', 'owner'].includes(role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only managers and above can manage escalation contacts',
    });
  }
}

// ============================================================================
// Router Definition
// ============================================================================

export const escalationContactsRouter = router({
  /**
   * List all active escalation contacts for organization
   * Equivalent to: GET /api/orgs/:organizationId/escalation-contacts
   *
   * Returns active contacts ordered by priority (ascending).
   * All authenticated org members can view contacts.
   */
  list: orgProcedure
    .input(OrgInput)
    .output(z.array(EscalationContactSchema))
    .query(async ({ input }) => {
      const contacts = await escalationContactsService.listEscalationContacts(input.organizationId);
      return contacts;
    }),

  /**
   * Create a new escalation contact
   * Equivalent to: POST /api/orgs/:organizationId/escalation-contacts
   *
   * Requires manager, admin, or owner role.
   */
  create: orgProcedure
    .input(CreateInput)
    .output(EscalationContactSchema)
    .mutation(async ({ input, ctx }) => {
      checkManagerRole(ctx.user.role);

      const contact = await escalationContactsService.createEscalationContact(
        input.organizationId,
        input.data,
      );

      return contact;
    }),

  /**
   * Update an existing escalation contact
   * Equivalent to: PATCH /api/orgs/:organizationId/escalation-contacts/:contactId
   *
   * Requires manager, admin, or owner role.
   * Verifies contact belongs to organization before updating.
   */
  update: orgProcedure
    .input(UpdateInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      checkManagerRole(ctx.user.role);

      // Verify contact exists and belongs to org
      const exists = await escalationContactsService.escalationContactExists(
        input.contactId,
        input.organizationId,
      );

      if (!exists) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Escalation contact not found',
        });
      }

      await escalationContactsService.updateEscalationContact(
        input.contactId,
        input.organizationId,
        input.data,
      );

      return { success: true };
    }),

  /**
   * Delete an escalation contact (soft delete)
   * Equivalent to: DELETE /api/orgs/:organizationId/escalation-contacts/:contactId
   *
   * Requires manager, admin, or owner role.
   * Soft deletes by setting is_active = false.
   */
  delete: orgProcedure
    .input(ContactIdInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      checkManagerRole(ctx.user.role);

      // Verify contact exists and belongs to org
      const exists = await escalationContactsService.escalationContactExists(
        input.contactId,
        input.organizationId,
      );

      if (!exists) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Escalation contact not found',
        });
      }

      await escalationContactsService.softDeleteEscalationContact(
        input.contactId,
        input.organizationId,
      );

      return { success: true };
    }),
});

// Export the type for use in frontend type inference
export type EscalationContactsRouter = typeof escalationContactsRouter;
