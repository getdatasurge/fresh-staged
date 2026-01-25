/**
 * Tests for Escalation Contacts tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List active escalation contacts for organization
 * - create: Create new escalation contact (manager+ only)
 * - update: Update escalation contact (manager+ only)
 * - delete: Soft delete escalation contact (manager+ only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { escalationContactsRouter } from '../../src/routers/escalation-contacts.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the escalation contacts service
vi.mock('../../src/services/escalation-contacts.service.js', () => ({
  listEscalationContacts: vi.fn(),
  createEscalationContact: vi.fn(),
  updateEscalationContact: vi.fn(),
  softDeleteEscalationContact: vi.fn(),
  escalationContactExists: vi.fn(),
}));

describe('Escalation Contacts tRPC Router', () => {
  const createCaller = createCallerFactory(escalationContactsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListEscalationContacts: ReturnType<typeof vi.fn>;
  let mockCreateEscalationContact: ReturnType<typeof vi.fn>;
  let mockUpdateEscalationContact: ReturnType<typeof vi.fn>;
  let mockSoftDeleteEscalationContact: ReturnType<typeof vi.fn>;
  let mockEscalationContactExists: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const contactId = '223e4567-e89b-12d3-a456-426614174001';

  // Sample escalation contact data
  const mockContact = {
    id: contactId,
    organization_id: orgId,
    name: 'Primary Contact',
    email: 'primary@example.com',
    phone: '+1234567890',
    priority: 1,
    notification_channels: ['email', 'sms'],
    is_active: true,
    user_id: null,
    created_at: '2024-01-01T00:00:00Z',
  };

  // Create context that simulates authenticated user
  const createOrgContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules to get references to mocked functions
    const userService = await import('../../src/services/user.service.js');
    const escalationContactsService = await import('../../src/services/escalation-contacts.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListEscalationContacts = escalationContactsService.listEscalationContacts as any;
    mockCreateEscalationContact = escalationContactsService.createEscalationContact as any;
    mockUpdateEscalationContact = escalationContactsService.updateEscalationContact as any;
    mockSoftDeleteEscalationContact = escalationContactsService.softDeleteEscalationContact as any;
    mockEscalationContactExists = escalationContactsService.escalationContactExists as any;

    // Default to manager role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('manager');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('list', () => {
    it('should return empty array when no contacts exist', async () => {
      mockListEscalationContacts.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual([]);
      expect(mockListEscalationContacts).toHaveBeenCalledWith(orgId);
    });

    it('should return contacts ordered by priority', async () => {
      const mockContacts = [
        { ...mockContact, priority: 1 },
        { ...mockContact, id: '323e4567-e89b-12d3-a456-426614174002', priority: 2, name: 'Secondary Contact' },
      ];
      mockListEscalationContacts.mockResolvedValue(mockContacts);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toHaveLength(2);
      expect(result[0].priority).toBe(1);
      expect(result[1].priority).toBe(2);
    });

    it('should work for staff role (read access allowed)', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockListEscalationContacts.mockResolvedValue([mockContact]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toHaveLength(1);
    });

    it('should work for viewer role (read access allowed)', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');
      mockListEscalationContacts.mockResolvedValue([mockContact]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    const createInput = {
      organizationId: orgId,
      data: {
        name: 'New Contact',
        email: 'new@example.com',
        phone: '+1234567890',
        priority: 1,
        notification_channels: ['email'],
        is_active: true,
        user_id: null,
      },
    };

    it('should create contact when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockCreateEscalationContact.mockResolvedValue({ ...mockContact, ...createInput.data });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create(createInput);

      expect(result.name).toBe('New Contact');
      expect(mockCreateEscalationContact).toHaveBeenCalledWith(orgId, createInput.data);
    });

    it('should create contact when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockCreateEscalationContact.mockResolvedValue({ ...mockContact, ...createInput.data });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create(createInput);

      expect(result.name).toBe('New Contact');
    });

    it('should create contact when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockCreateEscalationContact.mockResolvedValue({ ...mockContact, ...createInput.data });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create(createInput);

      expect(result.name).toBe('New Contact');
    });

    it('should throw FORBIDDEN when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.create(createInput)).rejects.toThrow(TRPCError);

      await expect(caller.create(createInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only managers and above can manage escalation contacts',
      });
    });

    it('should throw FORBIDDEN when user is viewer', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.create(createInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('update', () => {
    const updateInput = {
      organizationId: orgId,
      contactId: contactId,
      data: { name: 'Updated Name' },
    };

    it('should update contact when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockEscalationContactExists.mockResolvedValue(true);
      mockUpdateEscalationContact.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update(updateInput);

      expect(result).toEqual({ success: true });
      expect(mockUpdateEscalationContact).toHaveBeenCalledWith(
        contactId,
        orgId,
        updateInput.data
      );
    });

    it('should update contact when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockEscalationContactExists.mockResolvedValue(true);
      mockUpdateEscalationContact.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update(updateInput);

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when contact does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockEscalationContactExists.mockResolvedValue(false);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.update(updateInput)).rejects.toThrow(TRPCError);

      await expect(caller.update(updateInput)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Escalation contact not found',
      });
    });

    it('should throw FORBIDDEN when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.update(updateInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('delete', () => {
    const deleteInput = {
      organizationId: orgId,
      contactId: contactId,
    };

    it('should soft delete contact when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockEscalationContactExists.mockResolvedValue(true);
      mockSoftDeleteEscalationContact.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete(deleteInput);

      expect(result).toEqual({ success: true });
      expect(mockSoftDeleteEscalationContact).toHaveBeenCalledWith(contactId, orgId);
    });

    it('should soft delete contact when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockEscalationContactExists.mockResolvedValue(true);
      mockSoftDeleteEscalationContact.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete(deleteInput);

      expect(result).toEqual({ success: true });
    });

    it('should soft delete contact when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockEscalationContactExists.mockResolvedValue(true);
      mockSoftDeleteEscalationContact.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete(deleteInput);

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when contact does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockEscalationContactExists.mockResolvedValue(false);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.delete(deleteInput)).rejects.toThrow(TRPCError);

      await expect(caller.delete(deleteInput)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Escalation contact not found',
      });
    });

    it('should throw FORBIDDEN when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.delete(deleteInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when user is viewer', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.delete(deleteInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
