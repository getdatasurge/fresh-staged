import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import { getAlertHistory, createHistory } from '../../src/services/alert-history.service.js';

vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

describe('alert-history.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAlertHistory', () => {
    function mockSelectChain(resolvedValue: unknown[]) {
      const limit = vi.fn().mockResolvedValue(resolvedValue);
      const orderBy = vi.fn().mockReturnValue({ limit });
      const where = vi.fn().mockReturnValue({ orderBy });
      const leftJoin = vi.fn().mockReturnValue({ where });
      const innerJoin = vi.fn().mockReturnValue({ leftJoin });
      const from = vi.fn().mockReturnValue({ innerJoin });
      vi.mocked(db.select).mockReturnValue({ from } as any);
      return { from, innerJoin, leftJoin, where, orderBy, limit };
    }

    it('should return history entries with userName defaulting to System when null', async () => {
      const raw = [
        {
          id: 'h-1',
          alertRuleId: 'rule-1',
          changeType: 'created',
          oldValues: null,
          newValues: '{}',
          changedAt: new Date('2026-01-15'),
          changedBy: null,
          userEmail: null,
          userName: null,
        },
      ];
      mockSelectChain(raw);

      const result = await getAlertHistory({ organizationId: 'org-1' });

      expect(result).toHaveLength(1);
      expect(result[0].userName).toBe('System');
    });

    it('should preserve userName when it exists', async () => {
      const raw = [
        {
          id: 'h-2',
          alertRuleId: 'rule-1',
          changeType: 'updated',
          oldValues: '{}',
          newValues: '{}',
          changedAt: new Date('2026-01-16'),
          changedBy: 'user-1',
          userEmail: 'alice@example.com',
          userName: 'Alice',
        },
      ];
      mockSelectChain(raw);

      const result = await getAlertHistory({ organizationId: 'org-1' });

      expect(result[0].userName).toBe('Alice');
    });

    it('should return empty array when no history exists', async () => {
      mockSelectChain([]);

      const result = await getAlertHistory({ siteId: 'site-1' });

      expect(result).toEqual([]);
    });

    it('should use default limit of 20', async () => {
      const chain = mockSelectChain([]);

      await getAlertHistory({ organizationId: 'org-1' });

      expect(chain.limit).toHaveBeenCalledWith(20);
    });

    it('should accept custom limit', async () => {
      const chain = mockSelectChain([]);

      await getAlertHistory({ organizationId: 'org-1' }, 50);

      expect(chain.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('createHistory', () => {
    it('should insert a history record', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

      await createHistory('user-1', {
        alertRuleId: 'rule-1',
        changeType: 'updated',
        oldValues: { maxTemp: 40 },
        newValues: { maxTemp: 45 },
      });

      expect(db.insert).toHaveBeenCalledOnce();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          alertRuleId: 'rule-1',
          changedBy: 'user-1',
          changeType: 'updated',
          oldValues: JSON.stringify({ maxTemp: 40 }),
          newValues: JSON.stringify({ maxTemp: 45 }),
        }),
      );
    });

    it('should store null for oldValues when not provided', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

      await createHistory('user-1', {
        alertRuleId: 'rule-1',
        changeType: 'created',
        newValues: { maxTemp: 45 },
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: null,
          newValues: JSON.stringify({ maxTemp: 45 }),
        }),
      );
    });
  });
});
