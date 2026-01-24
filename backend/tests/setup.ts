/**
 * Vitest setup file
 *
 * Mocks problematic dependencies that don't work well with Vitest's ESM resolver.
 */

import { vi } from 'vitest';

// Mock @bull-board/api/bullMQAdapter - the ESM subpath export doesn't resolve correctly in Vitest
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: class MockBullMQAdapter {
    queue: unknown;
    constructor(queue: unknown) {
      this.queue = queue;
    }
  },
}));

// Mock @bull-board/api
vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn().mockReturnValue({}),
}));

// Mock @bull-board/fastify
vi.mock('@bull-board/fastify', () => ({
  FastifyAdapter: class MockFastifyAdapter {
    setBasePath() {}
    registerPlugin() {
      return async () => {};
    }
  },
}));
