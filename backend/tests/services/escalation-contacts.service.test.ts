import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  listEscalationContacts,
  createEscalationContact,
  getEscalationContact,
  updateEscalationContact,
  softDeleteEscalationContact,
  escalationContactExists,
} from '../../src/services/escalation-contacts.service.js';

vi.mock('../../src/db/client.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-001',
    organization_id: 'org-001',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '+15551234567',
    priority: 1,
    notification_channels: ['email', 'sms'],
    is_active: true,
    user_id: 'user-001',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('escalation-contacts.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listEscalationContacts', () => {
    it('should return active contacts for the organization', async () => {
      const contacts = [
        makeContact(),
        makeContact({ id: 'contact-002', name: 'Bob', priority: 2 }),
      ];
      vi.mocked(db.execute).mockResolvedValue({ rows: contacts, rowCount: 2 } as any);

      const result = await listEscalationContacts('org-001');

      expect(result).toEqual(contacts);
      expect(result).toHaveLength(2);
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('should return empty array when no contacts exist', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await listEscalationContacts('org-001');

      expect(result).toEqual([]);
    });
  });

  describe('createEscalationContact', () => {
    it('should create a contact and return it', async () => {
      const contact = makeContact();
      vi.mocked(db.execute).mockResolvedValue({ rows: [contact], rowCount: 1 } as any);

      const result = await createEscalationContact('org-001', {
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '+15551234567',
        priority: 1,
        notification_channels: ['email', 'sms'],
        is_active: true,
        user_id: 'user-001',
      });

      expect(result).toEqual(contact);
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('should handle empty notification_channels array', async () => {
      const contact = makeContact({ notification_channels: [] });
      vi.mocked(db.execute).mockResolvedValue({ rows: [contact], rowCount: 1 } as any);

      const result = await createEscalationContact('org-001', {
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '+15551234567',
        priority: 1,
        notification_channels: [],
        is_active: true,
        user_id: null,
      });

      expect(result).toEqual(contact);
    });

    it('should throw when no rows returned', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await expect(
        createEscalationContact('org-001', {
          name: 'Alice Smith',
          email: null,
          phone: null,
          priority: 1,
          notification_channels: ['email'],
          is_active: true,
          user_id: null,
        }),
      ).rejects.toThrow('Failed to create escalation contact');
    });
  });

  describe('getEscalationContact', () => {
    it('should return contact when found', async () => {
      const contact = makeContact();
      vi.mocked(db.execute).mockResolvedValue({ rows: [contact], rowCount: 1 } as any);

      const result = await getEscalationContact('contact-001', 'org-001');

      expect(result).toEqual(contact);
    });

    it('should return null when not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await getEscalationContact('nonexistent', 'org-001');

      expect(result).toBeNull();
    });
  });

  describe('updateEscalationContact', () => {
    it('should return true when update succeeds', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const result = await updateEscalationContact('contact-001', 'org-001', {
        name: 'Alice Updated',
      });

      expect(result).toBe(true);
    });

    it('should return false when contact not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await updateEscalationContact('nonexistent', 'org-001', {
        name: 'Nope',
      });

      expect(result).toBe(false);
    });

    it('should return true when no fields to update', async () => {
      const result = await updateEscalationContact('contact-001', 'org-001', {});

      expect(result).toBe(true);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('should handle updating notification_channels', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const result = await updateEscalationContact('contact-001', 'org-001', {
        notification_channels: ['email'],
      });

      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('should handle updating multiple fields', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const result = await updateEscalationContact('contact-001', 'org-001', {
        name: 'Updated Name',
        email: 'new@example.com',
        phone: '+15559999999',
        priority: 2,
        is_active: false,
        user_id: 'user-002',
      });

      expect(result).toBe(true);
    });

    it('should handle empty notification_channels array', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const result = await updateEscalationContact('contact-001', 'org-001', {
        notification_channels: [],
      });

      expect(result).toBe(true);
    });
  });

  describe('softDeleteEscalationContact', () => {
    it('should return true when contact is soft-deleted', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const result = await softDeleteEscalationContact('contact-001', 'org-001');

      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it('should return false when contact not found', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await softDeleteEscalationContact('nonexistent', 'org-001');

      expect(result).toBe(false);
    });
  });

  describe('escalationContactExists', () => {
    it('should return true when contact exists', async () => {
      vi.mocked(db.execute).mockResolvedValue({
        rows: [{ id: 'contact-001' }],
        rowCount: 1,
      } as any);

      const result = await escalationContactExists('contact-001', 'org-001');

      expect(result).toBe(true);
    });

    it('should return false when contact does not exist', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await escalationContactExists('nonexistent', 'org-001');

      expect(result).toBe(false);
    });
  });
});
