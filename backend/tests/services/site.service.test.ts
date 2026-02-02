import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  listSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  restoreSite,
  permanentlyDeleteSite,
} from '../../src/services/site.service.js';

// ---------------------------------------------------------------------------
// Mock the database client — vi.mock is hoisted automatically by Vitest
// ---------------------------------------------------------------------------
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a realistic Site object for test assertions. */
function makeSite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-001',
    organizationId: 'org-001',
    name: 'Main Warehouse',
    address: '123 Cold Storage Ln',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98101',
    country: 'US',
    timezone: 'America/Los_Angeles',
    complianceMode: 'standard',
    manualLogCadenceSeconds: null,
    correctiveActionRequired: false,
    latitude: '47.6062',
    longitude: '-122.3321',
    isActive: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Chain builder helpers -- each returns a terminal mock that resolves with the
// provided value, while every intermediate method returns the next link in the
// chain so the Drizzle-style fluent API works.
// ---------------------------------------------------------------------------

/**
 * SELECT chain: db.select() -> from() -> where() -> orderBy() -> resolves
 */
function mockSelectChain(resolvedValue: unknown) {
  const orderBy = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as any);
  return { from, where, orderBy };
}

/**
 * SELECT chain with limit: db.select() -> from() -> where() -> limit() -> resolves
 */
function mockSelectLimitChain(resolvedValue: unknown) {
  const limit = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as any);
  return { from, where, limit };
}

/**
 * INSERT chain: db.insert() -> values() -> returning() -> resolves
 */
function mockInsertChain(resolvedValue: unknown) {
  const returning = vi.fn().mockResolvedValue(resolvedValue);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as any);
  return { values, returning };
}

/**
 * UPDATE chain: db.update() -> set() -> where() -> returning() -> resolves
 */
function mockUpdateChain(resolvedValue: unknown) {
  const returning = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  vi.mocked(db.update).mockReturnValue({ set } as any);
  return { set, where, returning };
}

/**
 * DELETE chain: db.delete() -> where() -> returning() -> resolves
 */
function mockDeleteChain(resolvedValue: unknown) {
  const returning = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.delete).mockReturnValue({ where } as any);
  return { where, returning };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('site.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // listSites
  // -----------------------------------------------------------------------
  describe('listSites', () => {
    it('should return all active sites for the given organization', async () => {
      const sites = [makeSite(), makeSite({ id: 'site-002', name: 'Cold Room B' })];
      mockSelectChain(sites);

      const result = await listSites('org-001');

      expect(result).toEqual(sites);
      expect(result).toHaveLength(2);
      expect(db.select).toHaveBeenCalledOnce();
    });

    it('should return an empty array when no sites exist', async () => {
      mockSelectChain([]);

      const result = await listSites('org-001');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should call the full chain: select -> from -> where -> orderBy', async () => {
      const chain = mockSelectChain([]);

      await listSites('org-001');

      expect(db.select).toHaveBeenCalledOnce();
      expect(chain.from).toHaveBeenCalledOnce();
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.orderBy).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // getSite
  // -----------------------------------------------------------------------
  describe('getSite', () => {
    it('should return the site when it exists', async () => {
      const site = makeSite();
      mockSelectLimitChain([site]);

      const result = await getSite('site-001', 'org-001');

      expect(result).toEqual(site);
      expect(db.select).toHaveBeenCalledOnce();
    });

    it('should return null when the site does not exist', async () => {
      mockSelectLimitChain([]);

      const result = await getSite('nonexistent', 'org-001');

      expect(result).toBeNull();
    });

    it('should call limit(1) to fetch at most one row', async () => {
      const chain = mockSelectLimitChain([]);

      await getSite('site-001', 'org-001');

      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should call the full chain: select -> from -> where -> limit', async () => {
      const chain = mockSelectLimitChain([]);

      await getSite('site-001', 'org-001');

      expect(db.select).toHaveBeenCalledOnce();
      expect(chain.from).toHaveBeenCalledOnce();
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.limit).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // createSite
  // -----------------------------------------------------------------------
  describe('createSite', () => {
    it('should insert a new site and return it', async () => {
      const site = makeSite();
      const chain = mockInsertChain([site]);

      const result = await createSite('org-001', {
        name: 'Main Warehouse',
        timezone: 'America/Los_Angeles',
      });

      expect(result).toEqual(site);
      expect(db.insert).toHaveBeenCalledOnce();
      expect(chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Main Warehouse',
          timezone: 'America/Los_Angeles',
          organizationId: 'org-001',
        }),
      );
      expect(chain.returning).toHaveBeenCalledOnce();
    });

    it('should spread additional data fields into the insert values', async () => {
      const site = makeSite({ city: 'Portland', state: 'OR' });
      const chain = mockInsertChain([site]);

      await createSite('org-001', {
        name: 'Portland Site',
        timezone: 'America/Los_Angeles',
        city: 'Portland',
        state: 'OR',
      });

      expect(chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Portland Site',
          city: 'Portland',
          state: 'OR',
          organizationId: 'org-001',
        }),
      );
    });

    it('should call the full chain: insert -> values -> returning', async () => {
      const chain = mockInsertChain([makeSite()]);

      await createSite('org-001', { name: 'Test', timezone: 'UTC' });

      expect(db.insert).toHaveBeenCalledOnce();
      expect(chain.values).toHaveBeenCalledOnce();
      expect(chain.returning).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // updateSite
  // -----------------------------------------------------------------------
  describe('updateSite', () => {
    it('should update the site and return the updated record', async () => {
      const updated = makeSite({ name: 'Renamed Warehouse' });
      mockUpdateChain([updated]);

      const result = await updateSite('site-001', 'org-001', { name: 'Renamed Warehouse' });

      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalledOnce();
    });

    it('should return null when no matching site is found', async () => {
      mockUpdateChain([]);

      const result = await updateSite('nonexistent', 'org-001', { name: 'Nope' });

      expect(result).toBeNull();
    });

    it('should include updatedAt in the set call', async () => {
      const chain = mockUpdateChain([makeSite()]);

      await updateSite('site-001', 'org-001', { name: 'Updated' });

      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated',
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should call the full chain: update -> set -> where -> returning', async () => {
      const chain = mockUpdateChain([makeSite()]);

      await updateSite('site-001', 'org-001', { name: 'Updated' });

      expect(db.update).toHaveBeenCalledOnce();
      expect(chain.set).toHaveBeenCalledOnce();
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.returning).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // deleteSite (soft delete)
  // -----------------------------------------------------------------------
  describe('deleteSite', () => {
    it('should soft-delete the site by setting isActive to false', async () => {
      const deleted = makeSite({ isActive: false });
      const chain = mockUpdateChain([deleted]);

      const result = await deleteSite('site-001', 'org-001');

      expect(result).toEqual(deleted);
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should return null when no matching active site is found', async () => {
      mockUpdateChain([]);

      const result = await deleteSite('nonexistent', 'org-001');

      expect(result).toBeNull();
    });

    it('should call the full chain: update -> set -> where -> returning', async () => {
      const chain = mockUpdateChain([makeSite({ isActive: false })]);

      await deleteSite('site-001', 'org-001');

      expect(db.update).toHaveBeenCalledOnce();
      expect(chain.set).toHaveBeenCalledOnce();
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.returning).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // restoreSite
  // -----------------------------------------------------------------------
  describe('restoreSite', () => {
    it('should restore the site by setting isActive to true', async () => {
      const restored = makeSite({ isActive: true });
      const chain = mockUpdateChain([restored]);

      const result = await restoreSite('site-001', 'org-001');

      expect(result).toEqual(restored);
      expect(chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should return null when no matching soft-deleted site is found', async () => {
      mockUpdateChain([]);

      const result = await restoreSite('nonexistent', 'org-001');

      expect(result).toBeNull();
    });

    it('should call the full chain: update -> set -> where -> returning', async () => {
      const chain = mockUpdateChain([makeSite()]);

      await restoreSite('site-001', 'org-001');

      expect(db.update).toHaveBeenCalledOnce();
      expect(chain.set).toHaveBeenCalledOnce();
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.returning).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // permanentlyDeleteSite
  // -----------------------------------------------------------------------
  describe('permanentlyDeleteSite', () => {
    it('should permanently delete the site and return it', async () => {
      const site = makeSite();
      mockDeleteChain([site]);

      const result = await permanentlyDeleteSite('site-001', 'org-001');

      expect(result).toEqual(site);
      expect(db.delete).toHaveBeenCalledOnce();
    });

    it('should return null when no matching site is found', async () => {
      mockDeleteChain([]);

      const result = await permanentlyDeleteSite('nonexistent', 'org-001');

      expect(result).toBeNull();
    });

    it('should call the full chain: delete -> where -> returning', async () => {
      const chain = mockDeleteChain([makeSite()]);

      await permanentlyDeleteSite('site-001', 'org-001');

      expect(db.delete).toHaveBeenCalledOnce();
      expect(chain.where).toHaveBeenCalledOnce();
      expect(chain.returning).toHaveBeenCalledOnce();
    });
  });
});
