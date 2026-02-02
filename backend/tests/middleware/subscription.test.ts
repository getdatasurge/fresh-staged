import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  requireActiveSubscription,
  requireSensorCapacity,
  getActiveSensorCount,
} from '../../src/middleware/subscription.js';

// Mock db client — vi.mock is hoisted automatically by Vitest
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

const mockDb = vi.mocked(db);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a thenable chain that resolves to `result` for Drizzle select() */
function mockSelectChain(result: any[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => resolve(result),
  };
  return chain;
}

function createRequest(user?: any): any {
  return { user, headers: {} };
}

function createReply(): any {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: any) {
      reply.body = body;
      return reply;
    },
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Subscription Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // requireActiveSubscription
  // =========================================================================
  describe('requireActiveSubscription', () => {
    it('returns 401 when no user is present', async () => {
      const req = createRequest(undefined);
      const reply = createReply();

      await requireActiveSubscription(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 NO_ORGANIZATION when user has no organizationId', async () => {
      const req = createRequest({ id: 'u1' });
      const reply = createReply();

      await requireActiveSubscription(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('NO_ORGANIZATION');
    });

    it('returns 403 SUBSCRIPTION_REQUIRED when no subscription exists', async () => {
      const selectChain = mockSelectChain([]);
      mockDb.select.mockReturnValue(selectChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireActiveSubscription(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(reply.body.error.status).toBe('none');
    });

    it('returns 403 SUBSCRIPTION_REQUIRED when subscription is canceled', async () => {
      const selectChain = mockSelectChain([{ status: 'canceled', plan: 'pro' }]);
      mockDb.select.mockReturnValue(selectChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireActiveSubscription(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(reply.body.error.status).toBe('canceled');
    });

    it('returns 403 SUBSCRIPTION_REQUIRED when subscription is past_due', async () => {
      const selectChain = mockSelectChain([{ status: 'past_due', plan: 'pro' }]);
      mockDb.select.mockReturnValue(selectChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireActiveSubscription(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('allows access with active subscription', async () => {
      const selectChain = mockSelectChain([{ status: 'active', plan: 'pro' }]);
      mockDb.select.mockReturnValue(selectChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      const result = await requireActiveSubscription(req, reply);

      // Should return undefined (no reply sent) to continue to handler
      expect(result).toBeUndefined();
      expect(reply.statusCode).toBe(200); // unchanged
    });

    it('allows access with trial subscription', async () => {
      const selectChain = mockSelectChain([{ status: 'trial', plan: 'starter' }]);
      mockDb.select.mockReturnValue(selectChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      const result = await requireActiveSubscription(req, reply);

      expect(result).toBeUndefined();
      expect(reply.statusCode).toBe(200);
    });

    it('returns 403 for paused subscription', async () => {
      const selectChain = mockSelectChain([{ status: 'paused', plan: 'pro' }]);
      mockDb.select.mockReturnValue(selectChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireActiveSubscription(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(reply.body.error.status).toBe('paused');
    });
  });

  // =========================================================================
  // requireSensorCapacity
  // =========================================================================
  describe('requireSensorCapacity', () => {
    it('returns 401 when no user is present', async () => {
      const req = createRequest(undefined);
      const reply = createReply();

      await requireSensorCapacity(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 NO_ORGANIZATION when user has no organizationId', async () => {
      const req = createRequest({ id: 'u1' });
      const reply = createReply();

      await requireSensorCapacity(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('NO_ORGANIZATION');
    });

    it('returns 404 when organization not found', async () => {
      // First select: org lookup returns empty
      const orgChain = mockSelectChain([]);
      mockDb.select.mockReturnValue(orgChain as any);

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireSensorCapacity(req, reply);

      expect(reply.statusCode).toBe(404);
      expect(reply.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 403 SENSOR_LIMIT_REACHED when at capacity', async () => {
      // First call: org lookup
      const orgChain = mockSelectChain([{ sensorLimit: 10 }]);
      // Second call: device count
      const countChain = mockSelectChain([{ count: 10 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? orgChain : countChain) as any;
      });

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireSensorCapacity(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('SENSOR_LIMIT_REACHED');
      expect(reply.body.error.currentCount).toBe(10);
      expect(reply.body.error.limit).toBe(10);
    });

    it('returns 403 SENSOR_LIMIT_REACHED when over capacity', async () => {
      const orgChain = mockSelectChain([{ sensorLimit: 5 }]);
      const countChain = mockSelectChain([{ count: 7 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? orgChain : countChain) as any;
      });

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      await requireSensorCapacity(req, reply);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('SENSOR_LIMIT_REACHED');
    });

    it('allows access when under sensor limit', async () => {
      const orgChain = mockSelectChain([{ sensorLimit: 10 }]);
      const countChain = mockSelectChain([{ count: 5 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? orgChain : countChain) as any;
      });

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      const result = await requireSensorCapacity(req, reply);

      expect(result).toBeUndefined();
      expect(reply.statusCode).toBe(200); // unchanged
    });

    it('allows access when zero sensors and limit is positive', async () => {
      const orgChain = mockSelectChain([{ sensorLimit: 10 }]);
      const countChain = mockSelectChain([{ count: 0 }]);

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return (callCount === 1 ? orgChain : countChain) as any;
      });

      const req = createRequest({ id: 'u1', organizationId: 'org-1' });
      const reply = createReply();

      const result = await requireSensorCapacity(req, reply);

      expect(result).toBeUndefined();
      expect(reply.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // getActiveSensorCount
  // =========================================================================
  describe('getActiveSensorCount', () => {
    it('returns count from database', async () => {
      const countChain = mockSelectChain([{ count: 42 }]);
      mockDb.select.mockReturnValue(countChain as any);

      const result = await getActiveSensorCount('org-1');

      expect(result).toBe(42);
    });

    it('returns 0 when no devices exist', async () => {
      const countChain = mockSelectChain([{ count: 0 }]);
      mockDb.select.mockReturnValue(countChain as any);

      const result = await getActiveSensorCount('org-1');

      expect(result).toBe(0);
    });

    it('returns 0 when count result is null', async () => {
      const countChain = mockSelectChain([{}]);
      mockDb.select.mockReturnValue(countChain as any);

      const result = await getActiveSensorCount('org-1');

      expect(result).toBe(0);
    });
  });
});
