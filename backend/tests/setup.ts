/**
 * Vitest setup file
 *
 * Mocks problematic dependencies that don't work well with Vitest's ESM resolver.
 */

import { vi } from 'vitest';

// Mock resend - optional runtime dependency not installed in dev
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: vi.fn().mockResolvedValue({ data: { id: 'mock-message-id' }, error: null }),
    };
    constructor() {}
  },
}));

// Mock stripe - optional runtime dependency not installed in dev
vi.mock('stripe', () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'cs_mock', url: 'https://checkout.stripe.com/mock' }),
      },
    };
    billingPortal = {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/mock' }),
      },
    };
    webhooks = {
      constructEvent: vi.fn(),
    };
    constructor() {}
  },
}));

// Mock @aws-sdk/client-s3 - optional runtime dependency for asset storage
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = vi.fn().mockResolvedValue({});
    constructor() {}
  },
  PutObjectCommand: class MockPutObjectCommand {
    constructor() {}
  },
  GetObjectCommand: class MockGetObjectCommand {
    constructor() {}
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    constructor() {}
  },
  HeadObjectCommand: class MockHeadObjectCommand {
    constructor() {}
  },
}));

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
