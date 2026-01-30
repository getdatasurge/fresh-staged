# Phase 15: Background Jobs Infrastructure - Research

**Researched:** 2026-01-24
**Domain:** Job queues and background processing with BullMQ
**Confidence:** HIGH

## Summary

BullMQ is the established standard for Redis-based job queuing in Node.js, offering robust distributed job processing with TypeScript support. It provides built-in retry strategies, concurrency control, and monitoring capabilities through Bull Board. The architecture supports independent worker deployment, making it ideal for containerized environments.

For Fastify integration, the ecosystem offers two approaches: manual integration using Fastify plugins (following the existing Socket.io pattern in this codebase) or the `fastify-queue` plugin for file-based auto-discovery. Given this project's existing custom plugin pattern for Socket.io, a similar custom Fastify plugin approach will maintain architectural consistency while providing full control over configuration and dependency injection.

Bull Board provides a production-ready monitoring dashboard with Fastify adapter support, offering queue visualization, job inspection, and management actions. Workers can be deployed as separate containers from the API, sharing only the Redis connection and job definitions.

**Primary recommendation:** Use BullMQ v6.x with custom Fastify plugin following existing Socket.io plugin pattern, deploy workers in separate containers, and integrate Bull Board dashboard with authentication guards for production monitoring.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library                       | Version | Purpose                         | Why Standard                                                                                                                 |
| ----------------------------- | ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| bullmq                        | ^6.x    | Job queue and worker processing | Industry standard for Redis-based queues in Node.js, written in TypeScript, excellent community support, actively maintained |
| @bull-board/api               | ^6.16.x | Queue monitoring UI core        | Official dashboard solution, supports multiple queue adapters, production-proven                                             |
| @bull-board/fastify           | ^6.16.x | Fastify adapter for Bull Board  | Native Fastify integration, matches existing stack                                                                           |
| @bull-board/api/bullMQAdapter | ^6.16.x | BullMQ adapter for Bull Board   | Connects Bull Board UI to BullMQ queues                                                                                      |
| ioredis                       | ^5.x    | Redis client                    | Required by BullMQ, high-performance, TypeScript support                                                                     |

### Supporting

| Library             | Version | Purpose                            | When to Use                              |
| ------------------- | ------- | ---------------------------------- | ---------------------------------------- |
| @types/ioredis      | ^5.x    | TypeScript definitions for ioredis | Development only                         |
| redis-memory-server | ^7.x    | In-memory Redis for testing        | Integration tests without external Redis |

### Alternatives Considered

| Instead of    | Could Use     | Tradeoff                                                                                                          |
| ------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| BullMQ        | Bull (v4)     | Bull is in maintenance mode, BullMQ is the successor with better TypeScript support and modern features           |
| BullMQ        | Agenda        | MongoDB-based, less performant for high-volume jobs, lacks BullMQ's advanced features                             |
| BullMQ        | Bee-Queue     | Simpler but lacks features like job priorities, delays, and comprehensive retry strategies                        |
| Bull Board    | QueueDash     | Newer alternative with modern UI, but less mature and smaller community                                           |
| Custom Plugin | fastify-queue | File-based auto-discovery adds magic; custom plugin provides explicit control matching existing codebase patterns |

**Installation:**

```bash
npm install bullmq ioredis @bull-board/api @bull-board/fastify
npm install --save-dev @types/ioredis
```

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── plugins/
│   ├── socket.plugin.ts          # Existing
│   └── queue.plugin.ts            # New - BullMQ + Bull Board integration
├── services/
│   ├── socket.service.ts          # Existing
│   └── queue.service.ts           # New - Queue management and job dispatching
├── jobs/
│   ├── index.ts                   # Job registry and type definitions
│   ├── sms-notification.job.ts    # Phase 16
│   └── email-digest.job.ts        # Phase 17
├── workers/
│   ├── index.ts                   # Worker bootstrap (separate process)
│   └── processors/
│       ├── sms-notification.processor.ts
│       └── email-digest.processor.ts
└── types/
    └── queue.d.ts                 # Queue event types, job data interfaces
```

### Pattern 1: Custom Fastify Plugin (Recommended)

**What:** Register BullMQ queues and Bull Board dashboard as Fastify plugin
**When to use:** Aligns with existing Socket.io plugin pattern, provides explicit control
**Example:**

```typescript
// Source: Context7 /taskforcesh/bullmq + Bull Board README
// Adapted to match existing socket.plugin.ts pattern
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { QueueService } from '../services/queue.service.js';

export interface QueuePluginOptions {
  dashboardPath?: string;
  enableDashboard?: boolean;
}

const queuePlugin: FastifyPluginAsync<QueuePluginOptions> = async (
  fastify: FastifyInstance,
  opts: QueuePluginOptions,
) => {
  const dashboardPath = opts.dashboardPath ?? '/admin/queues';
  const enableDashboard = opts.enableDashboard ?? true;

  // Create QueueService instance
  const queueService = new QueueService();

  // Decorate Fastify instance
  fastify.decorate('queueService', queueService);

  // Initialize queues after server is ready
  fastify.ready(async () => {
    await queueService.initialize();

    // Setup Bull Board if enabled
    if (enableDashboard) {
      const serverAdapter = new FastifyAdapter();
      serverAdapter.setBasePath(dashboardPath);

      createBullBoard({
        queues: queueService.getQueuesForDashboard(),
        serverAdapter: serverAdapter,
      });

      // Register dashboard with authentication guard
      fastify.register(serverAdapter.plugin, {
        prefix: dashboardPath,
        // Add authentication hook
        onRequest: fastify.authenticate, // Reuse existing auth
      });

      fastify.log.info(`Bull Board dashboard available at ${dashboardPath}`);
    }
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing BullMQ queues...');
    await queueService.shutdown();
  });

  fastify.log.info('Queue plugin registered');
};

export default fastifyPlugin(queuePlugin, {
  name: 'bullmq-queue',
  fastify: '5.x',
});
```

### Pattern 2: Queue Service with Organization Isolation

**What:** Centralized service for managing multiple queues with organization-scoped job data
**When to use:** Matches existing SocketService pattern, provides type-safe queue operations
**Example:**

```typescript
// Source: Context7 /taskforcesh/bullmq
// Adapted to match existing socket.service.ts pattern
import { Queue, QueueEvents } from 'bullmq';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

export class QueueService {
  private queues: Map<string, Queue> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private connection?: RedisClientType;

  async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    if (!redisUrl && !process.env.REDIS_HOST) {
      throw new Error('Redis configuration required for background jobs');
    }

    // Create shared Redis connection
    // Note: For Workers, maxRetriesPerRequest MUST be null
    // For Queues, keep default (20) for fast failure
    const clientConfig = redisUrl
      ? { url: redisUrl }
      : { socket: { host: redisHost, port: redisPort } };

    this.connection = createClient(clientConfig);
    await this.connection.connect();

    // Register queues
    this.registerQueue('sms-notifications');
    this.registerQueue('email-digests');

    console.log('[QueueService] Initialized with Redis');
  }

  private registerQueue(name: string): void {
    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs for debugging
      },
    });

    const queueEvents = new QueueEvents(name, {
      connection: this.connection,
    });

    // Setup event listeners for monitoring
    queueEvents.on('completed', ({ jobId }) => {
      console.log(`[QueueService] Job ${jobId} completed in queue ${name}`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      console.error(`[QueueService] Job ${jobId} failed in queue ${name}:`, failedReason);
    });

    this.queues.set(name, queue);
    this.queueEvents.set(name, queueEvents);
  }

  async addJob<T>(
    queueName: string,
    jobName: string,
    data: T & { organizationId: string }, // Enforce org isolation
    options?: JobOptions,
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue.add(jobName, data, options);
  }

  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  getQueuesForDashboard(): BullMQAdapter[] {
    return Array.from(this.queues.values()).map((queue) => new BullMQAdapter(queue));
  }

  async shutdown(): Promise<void> {
    console.log('[QueueService] Shutting down...');

    // Close all QueueEvents
    await Promise.all(Array.from(this.queueEvents.values()).map((qe) => qe.close()));

    // Close all queues
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));

    // Disconnect Redis
    await this.connection?.disconnect();

    console.log('[QueueService] Shutdown complete');
  }
}
```

### Pattern 3: Worker Container (Separate Process)

**What:** Independent worker process that can be deployed separately from API
**When to use:** Production deployment, horizontal scaling of job processing
**Example:**

```typescript
// Source: Context7 /taskforcesh/bullmq + Docker deployment discussions
// workers/index.ts - Separate entry point for worker container
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processSmsNotification } from './processors/sms-notification.processor.js';
import { processEmailDigest } from './processors/email-digest.processor.js';

// CRITICAL: Workers MUST use maxRetriesPerRequest: null
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null, // Required for workers!
  enableReadyCheck: false,
});

// SMS notification worker
const smsWorker = new Worker(
  'sms-notifications',
  async (job) => {
    console.log(`Processing SMS job ${job.id}`);
    return processSmsNotification(job);
  },
  {
    connection,
    concurrency: 5, // Process 5 jobs concurrently
  },
);

// Email digest worker
const emailWorker = new Worker(
  'email-digests',
  async (job) => {
    console.log(`Processing email job ${job.id}`);
    return processEmailDigest(job);
  },
  {
    connection,
    concurrency: 2, // Emails are slower, limit concurrency
  },
);

// Event handlers
[smsWorker, emailWorker].forEach((worker) => {
  worker.on('completed', (job) => {
    console.log(`✓ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`✗ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Worker error:', err);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down workers...');
  await Promise.all([smsWorker.close(), emailWorker.close()]);
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('Workers started and ready to process jobs');
```

### Pattern 4: Job Type Definitions with Organization Scoping

**What:** Type-safe job data interfaces enforcing organization isolation
**When to use:** Always - ensures type safety and multi-tenant data isolation
**Example:**

```typescript
// jobs/index.ts - Job registry
import type { Job } from 'bullmq';

// Base interface enforcing organization scope
export interface BaseJobData {
  organizationId: string;
}

export interface SmsNotificationJobData extends BaseJobData {
  phoneNumber: string;
  message: string;
  alertId?: string;
}

export interface EmailDigestJobData extends BaseJobData {
  userId: string;
  period: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
}

// Job name constants (prevents typos)
export const JobNames = {
  SMS_NOTIFICATION: 'sms:send',
  EMAIL_DIGEST: 'email:digest',
} as const;

// Queue name constants
export const QueueNames = {
  SMS_NOTIFICATIONS: 'sms-notifications',
  EMAIL_DIGESTS: 'email-digests',
} as const;

// Type helpers
export type SmsNotificationJob = Job<SmsNotificationJobData>;
export type EmailDigestJob = Job<EmailDigestJobData>;
```

### Pattern 5: Bull Board with Authentication Guard

**What:** Secure dashboard access using existing Fastify authentication
**When to use:** Production deployments - never expose queue management publicly
**Example:**

```typescript
// Source: Bull Board GitHub - visibility guards and authentication examples
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';

const setupDashboard = (fastify: FastifyInstance, queueService: QueueService) => {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = queueService.getQueuesForDashboard();

  // Optional: Per-queue visibility based on user role
  queues.forEach((adapter) => {
    adapter.setVisibilityGuard((request) => {
      // Access request.headers for authentication
      const userRole = request.headers['x-user-role'];
      return userRole === 'admin' || userRole === 'developer';
    });
  });

  createBullBoard({
    queues,
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: 'FrostGuard Job Queues',
        boardLogo: {
          path: '/logo.png',
          width: 120,
          height: 40,
        },
      },
    },
  });

  // Register with authentication
  fastify.register(serverAdapter.plugin, {
    prefix: '/admin/queues',
    onRequest: [fastify.authenticate], // Reuse existing JWT middleware
  });
};
```

### Anti-Patterns to Avoid

- **Shared Redis connection without maxRetriesPerRequest awareness:** Workers MUST have `maxRetriesPerRequest: null`, Queues should keep default or low value. Mixing these will cause warnings and undefined behavior.

- **Storing sensitive data in job payloads:** Jobs are stored in Redis and visible in Bull Board. Never store passwords, API keys, or PII directly. Store IDs and fetch sensitive data within processors.

- **No job cleanup policies:** Without `removeOnComplete` and `removeOnFail`, Redis will accumulate jobs indefinitely. Set reasonable limits (e.g., keep last 100 completed, 500 failed).

- **Workers in same process as API:** While possible for development, production should separate API (job producers) from workers (job consumers) for independent scaling and fault isolation.

- **Blocking operations in job processors:** BullMQ processors should be async and non-blocking. CPU-intensive work should use sandboxed processors or offload to specialized services.

- **Hardcoded queue/job names:** Use constants exported from a central registry to prevent typos and enable refactoring.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                      | Don't Build                            | Use Instead                            | Why                                                                                                              |
| ---------------------------- | -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Job retry logic              | Custom retry counters with setTimeout  | BullMQ backoff strategies              | Built-in support for exponential/fixed/custom backoff, handles Redis persistence, supports per-job configuration |
| Job scheduling/delays        | setTimeout or cron in application code | BullMQ delayed jobs and repeat options | Survives process restarts, distributed across workers, precise timing with Redis                                 |
| Queue monitoring dashboard   | Custom admin UI for jobs               | Bull Board                             | Production-ready, supports multiple queues, job inspection, retry actions, no maintenance burden                 |
| Worker process management    | Custom child process spawning          | BullMQ Workers + Docker containers     | Handles graceful shutdown, reconnection logic, concurrency control, error recovery                               |
| Job deduplication            | Application-level job ID checks        | BullMQ jobId option                    | Atomic Redis-based deduplication, prevents duplicate jobs at queue level                                         |
| Rate limiting job processing | Custom rate limiting middleware        | BullMQ limiter option in Worker        | Built-in rate limiting per queue, configurable max jobs per time window                                          |
| Job priority queues          | Multiple queues or manual sorting      | BullMQ priority option                 | Native priority support, efficient Redis-based sorting                                                           |
| Connection pooling for Redis | Custom connection manager              | ioredis with shared connection         | BullMQ reuses single ioredis instance across Queue instances, minimal overhead                                   |

**Key insight:** BullMQ has been battle-tested at scale with millions of jobs. Custom solutions often miss edge cases like Redis disconnections, worker crashes during job processing, distributed locking for job atomicity, and efficient Redis memory management. The library handles these through years of production feedback.

## Common Pitfalls

### Pitfall 1: maxRetriesPerRequest Configuration Mismatch

**What goes wrong:** Worker shows deprecation warnings, jobs fail unexpectedly, or workers stop processing after Redis disconnections.

**Why it happens:** BullMQ Workers require `maxRetriesPerRequest: null` to handle blocking Redis operations, but ioredis defaults to 20. If overridden or an existing ioredis instance is passed without this setting, BullMQ can't guarantee correct behavior.

**How to avoid:**

- Always create separate ioredis connection for workers with `maxRetriesPerRequest: null`
- For Queue instances (API), use default value or set to 1 for fast failure
- Never share ioredis instance between Queue and Worker without checking this setting

**Warning signs:**

```
DEPRECATION WARNING! Your redis options maxRetriesPerRequest must be null.
```

**Fix:**

```typescript
// Worker connection (CORRECT)
const workerConnection = new IORedis({ maxRetriesPerRequest: null });

// Queue connection (CORRECT)
const queueConnection = new IORedis(); // Uses default (20)
// OR
const queueConnection = new IORedis({ maxRetriesPerRequest: 1 }); // Fast failure
```

### Pitfall 2: Missing Redis Persistence Configuration

**What goes wrong:** Jobs disappear after Redis restart, queue state is lost, duplicate job processing occurs.

**Why it happens:** Redis defaults to in-memory only storage. Without AOF (Append Only File) or RDB snapshots, data is lost on restart.

**How to avoid:**

- Configure Redis with `appendonly yes` in redis.conf
- Set `appendfsync everysec` for balance of performance and durability
- Set `maxmemory-policy noeviction` (CRITICAL - only policy that works with BullMQ)
- Test by restarting Redis and verifying jobs persist

**Warning signs:**

- Jobs added before restart are gone after Redis restarts
- Unexpected duplicate job processing
- Queue counts reset to zero after restart

**Docker Compose configuration:**

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --appendonly yes
    --appendfsync everysec
    --maxmemory-policy noeviction
  volumes:
    - redis_data:/data
```

### Pitfall 3: Environment Variables in Job Data

**What goes wrong:** Jobs fail with cryptic Lua script errors like "arguments must be strings or integers."

**Why it happens:** Environment variables can be undefined, and BullMQ's Lua scripts don't handle non-string/number types gracefully.

**How to avoid:**

- Validate and provide defaults for all env vars before adding jobs
- Use TypeScript `strictNullChecks` to catch undefined at compile time
- Validate job data schemas before queuing (use Zod or similar)

**Warning signs:**

```
Error: ERR Error running script ... arguments must be strings or integers
```

**Fix:**

```typescript
// BAD
await queue.add('job', {
  apiKey: process.env.API_KEY, // Could be undefined!
});

// GOOD
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable required');
}
await queue.add('job', { apiKey });

// BETTER - Validate with schema
const jobDataSchema = z.object({
  apiKey: z.string().min(1),
  endpoint: z.string().url(),
});

const validated = jobDataSchema.parse({
  apiKey: process.env.API_KEY,
  endpoint: process.env.API_ENDPOINT,
});
await queue.add('job', validated);
```

### Pitfall 4: No Graceful Shutdown for Workers

**What goes wrong:** Jobs marked as stalled, duplicate processing, incomplete jobs on container restart.

**Why it happens:** When workers are killed abruptly (SIGKILL or container stop without grace period), active jobs aren't marked as failed and will be retried after stalled timeout (~30 seconds default).

**How to avoid:**

- Always listen for SIGTERM and SIGINT signals
- Call `worker.close()` before process.exit
- Set Docker/Kubernetes terminationGracePeriodSeconds to at least 30s
- Allow time for in-flight jobs to complete or be marked as failed

**Warning signs:**

- Jobs showing as "stalled" in Bull Board
- Same job processed multiple times after deployments
- Logs showing jobs interrupted mid-execution

**Fix:**

```typescript
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, closing workers...`);

  // Close workers (waits for active jobs to complete)
  await Promise.all(workers.map(w => w.close()));

  // Close Redis connection
  await connection.quit();

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Docker Compose
services:
  worker:
    stop_grace_period: 30s
```

### Pitfall 5: Unencrypted Sensitive Data in Jobs

**What goes wrong:** Sensitive data visible in Bull Board dashboard, Redis dumps, logs.

**Why it happens:** Developers add passwords, tokens, PII to job data for convenience, forgetting jobs are stored as JSON in Redis.

**How to avoid:**

- Store only IDs in job data, fetch sensitive data in processor
- If sensitive data required, encrypt before adding to job
- Use Bull Board data formatters to redact sensitive fields from UI
- Secure Bull Board with authentication (never expose publicly)

**Warning signs:**

- Password or API tokens visible in Bull Board
- Security audit flags sensitive data in Redis
- Job data includes user emails, phone numbers, credit cards

**Fix:**

```typescript
// BAD
await queue.add('send-email', {
  to: user.email,
  password: user.plainPassword, // NEVER DO THIS
});

// GOOD - Store IDs only
await queue.add('send-email', {
  userId: user.id,
});

// In processor, fetch user
async function processEmail(job: Job<{ userId: string }>) {
  const user = await db.users.findById(job.data.userId);
  await sendEmail(user.email, generateMessage(user));
}

// If sensitive data required in job, encrypt first
import { encrypt, decrypt } from './crypto.js';

await queue.add('send-sms', {
  phoneNumber: encrypt(user.phoneNumber),
});

// In processor
const phoneNumber = decrypt(job.data.phoneNumber);
```

### Pitfall 6: Tight Coupling Between API and Worker Code

**What goes wrong:** Worker container includes unnecessary API dependencies, slow builds, large images, difficult independent deployment.

**Why it happens:** Workers defined in same codebase as API without clear separation, importing API-specific modules.

**How to avoid:**

- Create separate entry point for workers (`workers/index.ts`)
- Worker processors should import only job types and shared utilities
- Build separate Docker images for API and workers
- Use multi-stage builds to keep worker image minimal

**Warning signs:**

- Worker container is 500MB+ (similar to API container)
- Worker imports Fastify, route handlers, or middleware
- Can't deploy workers without rebuilding API

**Fix:**

```typescript
// BAD - Worker importing too much
import app from '../app.js'; // Pulls in all API code!
import { processJob } from './processor.js';

// GOOD - Worker imports only what it needs
import { Worker } from 'bullmq';
import type { SmsJobData } from '../jobs/types.js';
import { sendSms } from '../lib/sms-provider.js';

// Dockerfile.worker - Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/workers ./workers
COPY --from=builder /app/dist/jobs ./jobs
COPY --from=builder /app/dist/lib ./lib
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "workers/index.js"]
```

## Code Examples

Verified patterns from official sources:

### Basic Queue Creation and Job Addition

```typescript
// Source: https://context7.com/taskforcesh/bullmq/llms.txt
import { Queue } from 'bullmq';

const queue = new Queue('my-queue', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Add job
const job = await queue.add('email', {
  to: 'user@example.com',
  subject: 'Welcome!',
});

// Add delayed job
await queue.add('reminder', { userId: 123 }, { delay: 5000 });

// Add prioritized job (lower = higher priority)
await queue.add('urgent', { data: 'important' }, { priority: 1 });
```

### Worker with Event Listeners

```typescript
// Source: https://context7.com/taskforcesh/bullmq/llms.txt
import { Worker, Job } from 'bullmq';

const worker = new Worker(
  'my-queue',
  async (job: Job) => {
    console.log(`Processing job ${job.id}:`, job.data);

    await job.updateProgress(50);
    await performWork(job.data);
    await job.updateProgress(100);

    return { processed: true };
  },
  {
    connection: {
      host: 'localhost',
      port: 6379,
    },
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000, // 100 jobs per minute
    },
  },
);

worker.on('completed', (job, result) => {
  console.log(`✓ Job ${job.id} completed:`, result);
});

worker.on('failed', (job, error) => {
  console.error(`✗ Job ${job?.id} failed:`, error.message);
});

worker.on('progress', (job, progress) => {
  console.log(`Job ${job.id}: ${progress}%`);
});
```

### Custom Backoff Strategy

```typescript
// Source: https://context7.com/taskforcesh/bullmq/llms.txt
import { Worker } from 'bullmq';

const worker = new Worker(
  'retryable-tasks',
  async (job) => {
    // Job processing
  },
  {
    settings: {
      backoffStrategy: (attemptsMade, type, err, job) => {
        // Rate limit errors - wait longer
        if (err?.message.includes('rate limit')) {
          return 60000; // 1 minute
        }

        // Timeout errors - linear backoff
        if (err?.message.includes('timeout')) {
          return attemptsMade * 5000;
        }

        // Fatal errors - stop retrying
        if (attemptsMade > 3 && err?.message.includes('fatal')) {
          return -1;
        }

        // Default exponential backoff
        return Math.pow(2, attemptsMade - 1) * 1000;
      },
    },
  },
);

// Add job with custom backoff
await queue.add(
  'task',
  { data: 'test' },
  {
    attempts: 5,
    backoff: { type: 'custom' }, // Uses worker's backoffStrategy
  },
);
```

### Bull Board Fastify Setup

```typescript
// Source: https://github.com/felixmosh/bull-board
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bullmq';

const queue = new Queue('my-queue');
const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter: serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'My Application Queues',
      boardLogo: {
        path: '/logo.png',
        width: 120,
        height: 40,
      },
    },
  },
});

const app = require('fastify')();
app.register(serverAdapter.plugin, {
  prefix: '/admin/queues',
  // Add authentication
  onRequest: [authenticateAdmin],
});

app.listen(3000);
```

### QueueEvents for Monitoring

```typescript
// Source: https://context7.com/taskforcesh/bullmq/llms.txt
import { QueueEvents } from 'bullmq';

const queueEvents = new QueueEvents('notifications', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

// Global event listeners (works across all workers)
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed:`, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} progress:`, data);
});

queueEvents.on('stalled', ({ jobId }) => {
  console.warn(`Job ${jobId} has stalled!`);
});

// Cleanup
await queueEvents.close();
```

### Named Processor Pattern

```typescript
// Source: https://docs.bullmq.io/patterns/named-processor
import { Worker } from 'bullmq';

const worker = new Worker('multi-task-queue', async (job) => {
  // Handle different job types in one worker
  switch (job.name) {
    case 'send-email':
      return await handleEmail(job.data);

    case 'send-sms':
      return await handleSms(job.data);

    case 'push-notification':
      return await handlePush(job.data);

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
});

// Add different job types to same queue
await queue.add('send-email', { to: 'user@example.com' });
await queue.add('send-sms', { phone: '+1234567890' });
await queue.add('push-notification', { userId: '123' });
```

## State of the Art

| Old Approach                       | Current Approach                          | When Changed | Impact                                                                                                              |
| ---------------------------------- | ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Bull (v4)                          | BullMQ (v5+, currently v6)                | 2020         | Complete rewrite with better TypeScript support, improved architecture, Python/Elixir clients, breaking API changes |
| Manual Bull Board setup            | `@bull-board/api` with framework adapters | 2021         | Simplified integration, support for multiple frameworks (Express, Fastify, Hapi, etc.)                              |
| Separate processes with PM2        | Docker containers with health checks      | 2022+        | Better orchestration with Kubernetes/Docker Compose, cleaner separation of concerns                                 |
| IORedis v4                         | IORedis v5                                | 2022         | Better TypeScript support, improved performance, breaking changes in options                                        |
| Monolithic worker files            | Processor pattern with separation         | 2023+        | Easier testing, better code organization, supports sandboxed processors                                             |
| `enableOfflineQueue: true` for all | Separate configs for Queue vs Worker      | 2024         | Queue fails fast (good for API), Worker waits indefinitely (good for background processing)                         |

**Deprecated/outdated:**

- **Bull (v4)**: Still maintained but in feature freeze. Use BullMQ for new projects.
- **@bull-board/express as default**: Now framework-agnostic with dedicated adapters per framework.
- **Kue**: Abandoned, security issues. Do not use.
- **Agenda (MongoDB-based)**: Not deprecated but significantly slower than Redis-based solutions for high-volume jobs.

## Open Questions

Things that couldn't be fully resolved:

1. **Worker scaling metrics for SMS/Email workloads**
   - What we know: BullMQ supports concurrency and rate limiting, Kubernetes can auto-scale based on queue depth
   - What's unclear: Optimal concurrency settings for Twilio API (SMS) and SendGrid API (Email) - both have rate limits
   - Recommendation: Start with conservative concurrency (SMS: 5, Email: 2), monitor rate limit errors, adjust based on provider limits

2. **Job data retention policies for compliance**
   - What we know: BullMQ offers `removeOnComplete` and `removeOnFail` options
   - What's unclear: Whether GDPR/compliance requires keeping failed job data, how long to retain for debugging vs. privacy
   - Recommendation: Consult with compliance team. Safe defaults: removeOnComplete: 100, removeOnFail: 500. For production, consider shorter retention or implement job data sanitization.

3. **Bull Board production security hardening**
   - What we know: Bull Board supports authentication via Fastify's `onRequest` hooks
   - What's unclear: Whether to implement role-based access (admin vs. developer), whether to deploy dashboard separately or with API
   - Recommendation: Deploy with API in Phase 15 for simplicity. Add role-based access in Phase 16+ if needed. Consider separate deployment for high-security environments.

4. **Redis persistence vs. performance tradeoff**
   - What we know: AOF with `everysec` provides good balance, `always` is safer but slower
   - What's unclear: Whether job queue workload (frequent small writes) will cause performance degradation with AOF
   - Recommendation: Start with `appendfsync everysec`, monitor Redis performance metrics. If writes become bottleneck, consider RDB snapshots + AOF hybrid mode.

## Sources

### Primary (HIGH confidence)

- Context7 /taskforcesh/bullmq - BullMQ API documentation, code examples, patterns
- https://docs.bullmq.io/guide/connections - Connection configuration, maxRetriesPerRequest requirements
- https://docs.bullmq.io/guide/going-to-production - Production deployment checklist, Redis configuration
- https://github.com/felixmosh/bull-board - Bull Board installation, Fastify adapter usage, authentication patterns

### Secondary (MEDIUM confidence)

- [BullMQ common mistakes and pitfalls](https://docs.bullmq.io/guide/troubleshooting) - Verified troubleshooting guide
- [BullMQ Docker worker deployment patterns](https://github.com/taskforcesh/bullmq/discussions/665) - Community discussion on Kubernetes/Docker deployment
- [Fastify plugin decorators and dependency injection](https://fastify.dev/docs/latest/Reference/Decorators/) - Official Fastify decorator docs
- [Bull Board GitHub README](https://github.com/felixmosh/bull-board) - Setup examples and configuration options
- [fastify-queue plugin](https://github.com/JonasHiltl/fastify-queue) - Alternative approach for file-based queue discovery

### Tertiary (LOW confidence)

- [BullMQ testing patterns with Jest](https://medium.com/@vijaysinh.khot/testing-the-untestable-a-guide-to-integration-testing-bullmq-jobs-with-jest-736db303ca2e) - Integration testing approaches, community best practices
- [BullMQ at scale article](https://medium.com/@kaushalsinh73/bullmq-at-scale-queueing-millions-of-jobs-without-breaking-ba4c24ddf104) - Scaling challenges and solutions
- [BullMQ with Fastify template](https://github.com/railwayapp-templates/fastify-bullmq) - Reference implementation

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - BullMQ is industry standard, verified via Context7 and official docs, versions confirmed via npm
- Architecture: HIGH - Patterns verified with Context7 code examples and official documentation, Docker deployment confirmed via community discussions
- Pitfalls: HIGH - maxRetriesPerRequest, persistence, and graceful shutdown verified via official docs; sensitive data and env vars verified via troubleshooting guide
- Bull Board integration: HIGH - Fastify adapter verified via official Bull Board repository
- Worker deployment: MEDIUM - Docker/Kubernetes patterns verified via community discussions and template repos, but not official docs
- Testing approaches: MEDIUM - Integration testing approach verified but no official testing guide from BullMQ

**Research date:** 2026-01-24
**Valid until:** 2026-03-24 (60 days - BullMQ is stable, but check for minor version updates)
