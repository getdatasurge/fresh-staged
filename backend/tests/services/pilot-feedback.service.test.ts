import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import { upsertFeedback, listFeedback } from '../../src/services/pilot-feedback.service.js';

// Mock the database client — vi.mock is hoisted automatically by Vitest
vi.mock('../../src/db/client.js', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

/**
 * Pilot Feedback Service Tests
 *
 * Tests cover:
 * - upsertFeedback: insert with onConflictDoUpdate returning a single result
 * - listFeedback: select with where clause and orderBy
 */

describe('Pilot Feedback Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertFeedback', () => {
    it('should upsert feedback and return the result', async () => {
      const inputData = {
        organizationId: 'org-111',
        siteId: 'site-222',
        weekStart: '2026-01-26',
        loggingSpeedRating: 4,
        alertFatigueRating: 3,
        reportUsefulnessRating: 5,
        notes: 'Great week overall',
        submittedBy: 'user-333',
      };

      const expectedRow = {
        id: 'fb-001',
        ...inputData,
        createdAt: new Date('2026-01-27T00:00:00Z'),
      };

      const mockReturning = vi.fn().mockResolvedValue([expectedRow]);
      const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
      const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
      vi.mocked(db.insert).mockImplementation(mockInsert);

      const result = await upsertFeedback(inputData);

      expect(result).toEqual(expectedRow);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledWith(inputData);
      expect(mockOnConflict).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            loggingSpeedRating: inputData.loggingSpeedRating,
            alertFatigueRating: inputData.alertFatigueRating,
            reportUsefulnessRating: inputData.reportUsefulnessRating,
            notes: inputData.notes,
            submittedBy: inputData.submittedBy,
          }),
        }),
      );
      expect(mockReturning).toHaveBeenCalled();
    });
  });

  describe('listFeedback', () => {
    it('should return feedback array for the given organization', async () => {
      const orgId = 'org-111';
      const feedbackRows = [
        {
          id: 'fb-002',
          organizationId: orgId,
          siteId: 'site-222',
          weekStart: '2026-01-26',
          loggingSpeedRating: 5,
          alertFatigueRating: 2,
          reportUsefulnessRating: 4,
          notes: 'Week two feedback',
          submittedBy: 'user-333',
          createdAt: new Date('2026-01-27T00:00:00Z'),
        },
        {
          id: 'fb-001',
          organizationId: orgId,
          siteId: 'site-222',
          weekStart: '2026-01-19',
          loggingSpeedRating: 3,
          alertFatigueRating: 4,
          reportUsefulnessRating: 3,
          notes: 'Week one feedback',
          submittedBy: 'user-333',
          createdAt: new Date('2026-01-20T00:00:00Z'),
        },
      ];

      const mockOrderBy = vi.fn().mockResolvedValue(feedbackRows);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const result = await listFeedback(orgId);

      expect(result).toEqual(feedbackRows);
      expect(result).toHaveLength(2);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(mockFrom).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
      expect(mockOrderBy).toHaveBeenCalled();
    });

    it('should return an empty array when no feedback exists', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
      vi.mocked(db.select).mockImplementation(mockSelect);

      const result = await listFeedback('org-no-feedback');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });
});
