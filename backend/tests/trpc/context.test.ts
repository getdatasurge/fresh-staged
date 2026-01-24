/**
 * Tests for tRPC context creation
 *
 * Verifies that context correctly extracts and verifies JWT tokens
 * from both x-stack-access-token and Authorization headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContext } from '../../src/trpc/context.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock verifyAccessToken
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

describe('tRPC Context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null user when no token provided', async () => {
    const req = {
      headers: {},
    } as FastifyRequest;
    const res = {} as FastifyReply;

    const ctx = await createContext({ req, res });

    expect(ctx.user).toBeNull();
    expect(ctx.req).toBe(req);
    expect(ctx.res).toBe(res);
  });

  it('should extract token from x-stack-access-token header', async () => {
    const { verifyAccessToken } = await import('../../src/utils/jwt.js');
    (verifyAccessToken as any).mockResolvedValue({
      payload: { email: 'test@example.com', name: 'Test User' },
      userId: 'user-123',
    });

    const req = {
      headers: { 'x-stack-access-token': 'valid-token' },
    } as FastifyRequest;
    const res = {} as FastifyReply;

    const ctx = await createContext({ req, res });

    expect(ctx.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    });
  });

  it('should extract token from Authorization Bearer header', async () => {
    const { verifyAccessToken } = await import('../../src/utils/jwt.js');
    (verifyAccessToken as any).mockResolvedValue({
      payload: { email: 'bearer@example.com', name: 'Bearer User' },
      userId: 'user-456',
    });

    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as FastifyRequest;
    const res = {} as FastifyReply;

    const ctx = await createContext({ req, res });

    expect(ctx.user).toEqual({
      id: 'user-456',
      email: 'bearer@example.com',
      name: 'Bearer User',
    });
  });

  it('should prefer x-stack-access-token over Authorization header', async () => {
    const { verifyAccessToken } = await import('../../src/utils/jwt.js');
    (verifyAccessToken as any).mockResolvedValue({
      payload: { email: 'custom@example.com', name: 'Custom User' },
      userId: 'user-789',
    });

    const req = {
      headers: {
        'x-stack-access-token': 'custom-token',
        authorization: 'Bearer bearer-token',
      },
    } as FastifyRequest;
    const res = {} as FastifyReply;

    const ctx = await createContext({ req, res });

    expect(verifyAccessToken).toHaveBeenCalledWith('custom-token');
    expect(ctx.user).toEqual({
      id: 'user-789',
      email: 'custom@example.com',
      name: 'Custom User',
    });
  });

  it('should return null user when token verification fails', async () => {
    const { verifyAccessToken } = await import('../../src/utils/jwt.js');
    (verifyAccessToken as any).mockRejectedValue(new Error('Invalid token'));

    const req = {
      headers: { 'x-stack-access-token': 'invalid-token' },
    } as FastifyRequest;
    const res = {} as FastifyReply;

    const ctx = await createContext({ req, res });

    expect(ctx.user).toBeNull();
  });

  it('should handle malformed Authorization header', async () => {
    const req = {
      headers: { authorization: 'InvalidFormat' },
    } as FastifyRequest;
    const res = {} as FastifyReply;

    const ctx = await createContext({ req, res });

    expect(ctx.user).toBeNull();
  });
});
