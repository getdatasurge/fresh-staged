import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  listAreas,
  getArea,
  createArea,
  updateArea,
  deleteArea,
  restoreArea,
  permanentlyDeleteArea,
} from '../../src/services/area.service.js';

vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

function makeArea(overrides: Record<string, unknown> = {}) {
  return {
    id: 'area-001',
    siteId: 'site-001',
    name: 'Walk-In Cooler',
    description: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

/** Builds a SELECT chain for verifySiteAccess: select -> from -> where -> limit */
function mockSiteAccessChain(hasSite: boolean) {
  const limit = vi.fn().mockResolvedValue(hasSite ? [{ id: 'site-001' }] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from } as any;
}

/** Builds a SELECT chain: select -> from -> where -> orderBy */
function mockSelectOrderByChain(result: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from } as any;
}

/** Builds a SELECT chain: select -> from -> where -> limit */
function mockSelectLimitChain(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from } as any;
}

/** Builds an INSERT chain: insert -> values -> returning */
function mockInsertChain(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as any);
  return { values, returning };
}

/** Builds an UPDATE chain: update -> set -> where -> returning */
function mockUpdateChain(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as any);
  return { set, where, returning };
}

/** Builds a DELETE chain: delete -> where -> returning */
function mockDeleteChain(result: unknown[]) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.delete).mockReturnValue({ where } as any);
  return { where, returning };
}

describe('area.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAreas', () => {
    it('should return areas when site access is verified', async () => {
      const areasList = [makeArea(), makeArea({ id: 'area-002', name: 'Freezer' })];
      vi.mocked(db.select)
        .mockReturnValueOnce(mockSiteAccessChain(true))
        .mockReturnValueOnce(mockSelectOrderByChain(areasList));

      const result = await listAreas('site-001', 'org-001');

      expect(result).toEqual(areasList);
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await listAreas('site-001', 'org-wrong');

      expect(result).toEqual([]);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('getArea', () => {
    it('should return area when found', async () => {
      const area = makeArea();
      vi.mocked(db.select)
        .mockReturnValueOnce(mockSiteAccessChain(true))
        .mockReturnValueOnce(mockSelectLimitChain([area]));

      const result = await getArea('area-001', 'site-001', 'org-001');

      expect(result).toEqual(area);
    });

    it('should return null when area not found', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(mockSiteAccessChain(true))
        .mockReturnValueOnce(mockSelectLimitChain([]));

      const result = await getArea('nonexistent', 'site-001', 'org-001');

      expect(result).toBeNull();
    });

    it('should return null when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await getArea('area-001', 'site-001', 'org-wrong');

      expect(result).toBeNull();
    });
  });

  describe('createArea', () => {
    it('should create an area and return it', async () => {
      const area = makeArea();
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(true));
      mockInsertChain([area]);

      const result = await createArea('site-001', 'org-001', { name: 'Walk-In Cooler' });

      expect(result).toEqual(area);
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it('should return null when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await createArea('site-001', 'org-wrong', { name: 'Nope' });

      expect(result).toBeNull();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('updateArea', () => {
    it('should update an area and return it', async () => {
      const updated = makeArea({ name: 'Renamed Area' });
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(true));
      mockUpdateChain([updated]);

      const result = await updateArea('area-001', 'site-001', 'org-001', { name: 'Renamed Area' });

      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('should return null when area not found', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(true));
      mockUpdateChain([]);

      const result = await updateArea('nonexistent', 'site-001', 'org-001', { name: 'Nope' });

      expect(result).toBeNull();
    });

    it('should return null when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await updateArea('area-001', 'site-001', 'org-wrong', { name: 'Nope' });

      expect(result).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteArea', () => {
    it('should soft-delete an area', async () => {
      const deleted = makeArea({ isActive: false });
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(true));
      mockUpdateChain([deleted]);

      const result = await deleteArea('area-001', 'site-001', 'org-001');

      expect(result).toEqual(deleted);
    });

    it('should return null when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await deleteArea('area-001', 'site-001', 'org-wrong');

      expect(result).toBeNull();
    });
  });

  describe('restoreArea', () => {
    it('should restore a soft-deleted area', async () => {
      const restored = makeArea({ isActive: true });
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(true));
      mockUpdateChain([restored]);

      const result = await restoreArea('area-001', 'site-001', 'org-001');

      expect(result).toEqual(restored);
    });

    it('should return null when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await restoreArea('area-001', 'site-001', 'org-wrong');

      expect(result).toBeNull();
    });
  });

  describe('permanentlyDeleteArea', () => {
    it('should hard-delete an area', async () => {
      const area = makeArea();
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(true));
      mockDeleteChain([area]);

      const result = await permanentlyDeleteArea('area-001', 'site-001', 'org-001');

      expect(result).toEqual(area);
      expect(db.delete).toHaveBeenCalledOnce();
    });

    it('should return null when site access is denied', async () => {
      vi.mocked(db.select).mockReturnValueOnce(mockSiteAccessChain(false));

      const result = await permanentlyDeleteArea('area-001', 'site-001', 'org-wrong');

      expect(result).toBeNull();
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
