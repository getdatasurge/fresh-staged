import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import { SocketService } from '../../src/services/socket.service.js';

// ---------------------------------------------------------------------------
// Mock database client
// ---------------------------------------------------------------------------
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock Redis-related modules to prevent actual connections
vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(),
}));

vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSocket(data: Record<string, unknown> = {}) {
  return {
    id: 'socket-123',
    data: {
      userId: 'user-001',
      organizationId: 'org-001',
      role: 'admin',
      ...data,
    },
    join: vi.fn(),
    emit: vi.fn(),
  } as any;
}

/**
 * SELECT chain: db.select() -> from() -> where() -> limit() -> resolves
 */
function mockSelectLimitChain(resolvedValue: unknown) {
  const limit = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as any);
  return { from, where, limit };
}

/**
 * SELECT chain with innerJoin: db.select() -> from() -> innerJoin() -> innerJoin() -> where() -> limit()
 */
function mockSelectJoinChain(resolvedValue: unknown) {
  const limit = vi.fn().mockResolvedValue(resolvedValue);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin2 = vi.fn().mockReturnValue({ where });
  const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
  const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
  vi.mocked(db.select).mockReturnValue({ from } as any);
  return { from, innerJoin1, innerJoin2, where, limit };
}

// ---------------------------------------------------------------------------
// Mock Socket.io server
// ---------------------------------------------------------------------------
function createMockIO() {
  return {
    adapter: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    on: vi.fn(),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SocketService', () => {
  let service: SocketService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocketService(createMockIO());
  });

  describe('verifySiteOwnership', () => {
    it('should return true when site belongs to the organization', async () => {
      mockSelectLimitChain([{ id: 'site-001' }]);

      const result = await service.verifySiteOwnership('site-001', 'org-001');
      expect(result).toBe(true);
    });

    it('should return false when site does not belong to the organization', async () => {
      mockSelectLimitChain([]);

      const result = await service.verifySiteOwnership('site-001', 'org-other');
      expect(result).toBe(false);
    });

    it('should return false when site does not exist', async () => {
      mockSelectLimitChain([]);

      const result = await service.verifySiteOwnership('nonexistent', 'org-001');
      expect(result).toBe(false);
    });
  });

  describe('verifyUnitOwnership', () => {
    it('should return true when unit belongs to the organization via area→site chain', async () => {
      mockSelectJoinChain([{ id: 'unit-001' }]);

      const result = await service.verifyUnitOwnership('unit-001', 'org-001');
      expect(result).toBe(true);
    });

    it('should return false when unit belongs to a different organization', async () => {
      mockSelectJoinChain([]);

      const result = await service.verifyUnitOwnership('unit-001', 'org-other');
      expect(result).toBe(false);
    });

    it('should return false when unit does not exist', async () => {
      mockSelectJoinChain([]);

      const result = await service.verifyUnitOwnership('nonexistent', 'org-001');
      expect(result).toBe(false);
    });
  });

  describe('joinSite', () => {
    it('should join room when site belongs to user organization', async () => {
      mockSelectLimitChain([{ id: 'site-001' }]);
      const socket = createMockSocket();

      const result = await service.joinSite(socket, 'site-001');

      expect(result).toBe(true);
      expect(socket.join).toHaveBeenCalledWith('org:org-001:site:site-001');
    });

    it('should return false and not join when site belongs to different org', async () => {
      mockSelectLimitChain([]);
      const socket = createMockSocket();

      const result = await service.joinSite(socket, 'site-from-other-org');

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should return false when socket has no organizationId', async () => {
      const socket = createMockSocket({ organizationId: undefined });

      const result = await service.joinSite(socket, 'site-001');

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('joinUnit', () => {
    it('should join room when unit belongs to user organization', async () => {
      mockSelectJoinChain([{ id: 'unit-001' }]);
      const socket = createMockSocket();

      const result = await service.joinUnit(socket, 'unit-001');

      expect(result).toBe(true);
      expect(socket.join).toHaveBeenCalledWith('org:org-001:unit:unit-001');
    });

    it('should return false and not join when unit belongs to different org', async () => {
      mockSelectJoinChain([]);
      const socket = createMockSocket();

      const result = await service.joinUnit(socket, 'unit-from-other-org');

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should return false when socket has no organizationId', async () => {
      const socket = createMockSocket({ organizationId: undefined });

      const result = await service.joinUnit(socket, 'unit-001');

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('joinOrganization', () => {
    it('should join org room when organizationId is present', () => {
      const socket = createMockSocket();

      service.joinOrganization(socket);

      expect(socket.join).toHaveBeenCalledWith('org:org-001');
    });

    it('should not join when organizationId is missing', () => {
      const socket = createMockSocket({ organizationId: undefined });

      service.joinOrganization(socket);

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('broadcasting', () => {
    it('should emit to org room', () => {
      const io = createMockIO();
      const svc = new SocketService(io);

      svc.emitToOrg('org-001', 'test:event', { data: 1 });

      expect(io.to).toHaveBeenCalledWith('org:org-001');
    });

    it('should emit to site room with org scope', () => {
      const io = createMockIO();
      const svc = new SocketService(io);

      svc.emitToSite('org-001', 'site-001', 'test:event', { data: 1 });

      expect(io.to).toHaveBeenCalledWith('org:org-001:site:site-001');
    });

    it('should emit to unit room with org scope', () => {
      const io = createMockIO();
      const svc = new SocketService(io);

      svc.emitToUnit('org-001', 'unit-001', 'test:event', { data: 1 });

      expect(io.to).toHaveBeenCalledWith('org:org-001:unit:unit-001');
    });
  });

  describe('leaveRoom', () => {
    it('should leave the specified room', () => {
      const socket = createMockSocket();
      socket.leave = vi.fn();

      service.leaveRoom(socket, 'org:org-001:site:site-001');

      expect(socket.leave).toHaveBeenCalledWith('org:org-001:site:site-001');
    });
  });
});
