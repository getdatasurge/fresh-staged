import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import { requireApiKey } from '../../src/middleware/api-key-auth.js';

// Mock db client — vi.mock is hoisted automatically by Vitest
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

const mockDb = vi.mocked(db) as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSelectChain(result: any[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve(result),
  };
  return chain;
}

function mockUpdateChain() {
  const chain: any = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    then: (resolve: any) => resolve(undefined),
  };
  return chain;
}

function createRequest(headers: Record<string, string | undefined> = {}): any {
  return {
    headers,
    orgContext: undefined,
  };
}

function createReply(): any {
  const reply: any = {
    statusCode: 200,
    body: null,
    code(status: number) {
      reply.statusCode = status;
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

describe('API Key Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireApiKey', () => {
    it('returns 401 when no API key header is provided', async () => {
      const req = createRequest({});
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.code).toBe('UNAUTHORIZED');
      expect(reply.body.error.message).toBe('Missing API key');
    });

    it('returns 401 when x-api-key header is empty string', async () => {
      const req = createRequest({ 'x-api-key': '' });
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when key does not match any connection', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'secret-abc' },
        { id: 'conn-2', organizationId: 'org-2', webhookSecret: 'secret-def' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const req = createRequest({ 'x-api-key': 'wrong-key' });
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.code).toBe('UNAUTHORIZED');
      expect(reply.body.error.message).toBe('Invalid API key');
    });

    it('returns 401 when no active connections exist', async () => {
      const selectChain = mockSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const req = createRequest({ 'x-api-key': 'some-key' });
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.code).toBe('UNAUTHORIZED');
      expect(reply.body.error.message).toBe('Invalid API key');
    });

    it('authenticates successfully with matching x-api-key', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'valid-secret-key' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = mockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const req = createRequest({ 'x-api-key': 'valid-secret-key' });
      const reply = createReply();

      await requireApiKey(req, reply);

      // Should not send any error response
      expect(reply.statusCode).toBe(200);
      expect(reply.body).toBeNull();

      // Should attach orgContext
      expect(req.orgContext).toEqual({
        organizationId: 'org-1',
        connectionId: 'conn-1',
      });
    });

    it('authenticates successfully with matching x-webhook-secret', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'webhook-key-123' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = mockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const req = createRequest({ 'x-webhook-secret': 'webhook-key-123' });
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(req.orgContext).toEqual({
        organizationId: 'org-1',
        connectionId: 'conn-1',
      });
    });

    it('prefers x-api-key over x-webhook-secret when both present', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'api-key-value' },
        { id: 'conn-2', organizationId: 'org-2', webhookSecret: 'webhook-value' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = mockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const req = createRequest({
        'x-api-key': 'api-key-value',
        'x-webhook-secret': 'webhook-value',
      });
      const reply = createReply();

      await requireApiKey(req, reply);

      // Should match conn-1 via x-api-key
      expect(req.orgContext).toEqual({
        organizationId: 'org-1',
        connectionId: 'conn-1',
      });
    });

    it('updates lastUsedAt on successful authentication', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'valid-key' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = mockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const req = createRequest({ 'x-api-key': 'valid-key' });
      const reply = createReply();

      await requireApiKey(req, reply);

      // Verify update was called
      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastUsedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('selects correct connection from multiple active connections', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'key-alpha' },
        { id: 'conn-2', organizationId: 'org-2', webhookSecret: 'key-beta' },
        { id: 'conn-3', organizationId: 'org-3', webhookSecret: 'key-gamma' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = mockUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const req = createRequest({ 'x-api-key': 'key-beta' });
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(req.orgContext).toEqual({
        organizationId: 'org-2',
        connectionId: 'conn-2',
      });
    });

    it('rejects keys with different lengths (timing-safe)', async () => {
      const selectChain = mockSelectChain([
        { id: 'conn-1', organizationId: 'org-1', webhookSecret: 'short' },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      const req = createRequest({ 'x-api-key': 'much-longer-key-value' });
      const reply = createReply();

      await requireApiKey(req, reply);

      expect(reply.statusCode).toBe(401);
      expect(reply.body.error.message).toBe('Invalid API key');
    });
  });
});
