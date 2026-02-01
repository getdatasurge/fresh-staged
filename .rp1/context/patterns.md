# Implementation Patterns

**Project**: FreshStaged (Temperature Monitoring SaaS)
**Last Updated**: 2026-02-01

## Naming & Organization

**Files**: kebab-case for files (user.service.ts, auth.plugin.ts), index.ts as barrel exports
**Functions**: camelCase functions with verb prefixes (getOrCreateProfile, processSmsNotification, checkDatabase)
**Imports**: Explicit .js extensions required (ESM), grouped: external → internal → types, star imports for services (export * as userService)
**Directory Structure**: Feature-based organization (services/, routes/, middleware/, plugins/, workers/), schema dependencies documented in index.ts comments

Evidence: backend/src/db/schema/index.ts:1-40, backend/src/services/index.ts:1-10, backend/src/app.ts:1-42

## Type & Data Modeling

**Data Modeling**: Drizzle ORM schema-first with $inferSelect/$inferInsert pattern, interface prefixes for job data (BaseJobData, SmsNotificationJobData), type vs interface preference for simple types
**Type Strictness**: strict: true in tsconfig.json, explicit return types on exported functions, typed route parameters with generics (FastifyPluginAsync, app.get<{ Params: { organizationId: string } }>)
**Immutability**: const exports for enums (QueueNames, JobNames) with 'as const', readonly behavior via TypeScript not runtime freezing
**Nullability**: Optional with ? operator, undefined for uninitialized (fastify.decorateRequest('user', undefined)), explicit null checks in services

Evidence: backend/src/jobs/index.ts:50-66, backend/src/db/schema/devices.ts:163-170, backend/tsconfig.json:1-19, backend/src/plugins/auth.plugin.ts:22

## Error Handling

**Strategy**: Exceptions for errors, try-catch at boundaries (route handlers, workers, health checks), no Result/Either types detected
**Propagation**: Bubble up from services, catch at route/worker level, graceful shutdown handlers for SIGTERM/SIGINT
**Common Types**: Standard Error class, domain-specific via fastify reply.code() (401, 403, 503), no custom exception hierarchy detected in sample
**Recovery**: Exponential backoff in BullMQ jobs (attempts: 3-5, delay: 1000-5000ms), health check degradation strategy (healthy/degraded/unhealthy)

Evidence: backend/src/index.ts:11-24, backend/src/jobs/index.ts:74-143, backend/src/routes/health.ts:24-38, backend/src/workers/index.ts:104-124

## Validation & Boundaries

**Location**: API boundary via Zod (fastify-type-provider-zod), PRECONDITION comments in service functions document expected state
**Method**: Zod schemas with validatorCompiler/serializerCompiler, environment validation via env-check.ts, JWT payload validation (jose library)
**Normalization**: Environment variable parsing with parseInt/trim, CORS_ORIGINS split and trim, phone numbers as E.164 format documented in types
**Early Rejection**: Fastify validation runs before route handlers, rate limiting at middleware layer, health check 503 for unhealthy

Evidence: backend/src/app.ts:132-134, backend/src/app.ts:67-75, backend/src/services/user.service.ts:9-17, backend/src/jobs/index.ts:17

## Observability

**Logging**: Pino via Fastify logger, structured JSON in production, pretty print in dev, redaction of sensitive fields (authorization, tokens, passwords), request ID correlation (x-request-id)
**Metrics**: None detected in core samples (Stripe meter reporting is billing, not observability)
**Tracing**: None detected
**Context**: Request IDs via requestIdHeader, log service name (freshtrack-api), environment and version in health checks, job IDs in worker logs

Evidence: backend/src/utils/logger.ts:1-50, backend/src/app.ts:48-62, backend/src/routes/health.ts:108-115, backend/src/workers/index.ts:48-52

## Testing Idioms

**Organization**: tests/ mirrors src/ structure (tests/services/, tests/api/, tests/trpc/), test files suffix .test.ts
**Fixtures**: Vitest with vi.mock() for dependencies, MockQueue/MockRedis classes, helper fixtures in tests/helpers/fixtures.ts, beforeEach/afterEach for setup/teardown
**Levels**: Unit tests dominant (services mocked), integration tests for routes/tRPC, worker processor tests
**Mocking**: vi.mock() at module level before imports, class-based mocks (MockRedis, MockQueue), dependency injection via Fastify decorators enables testability

Evidence: backend/tests/services/queue.service.test.ts:1-60, backend/tests/auth.test.ts:1-26, backend/package.json:8-9

## Database & Partitioning

**Partitioning Strategy** (REC-002): Monthly RANGE partitioning for high-volume time-series tables, PostgreSQL native declarative partitioning (PARTITION BY RANGE), automated lifecycle via BullMQ scheduled jobs
**Partition Naming**: `<table>_y<YYYY>m<MM>` convention (e.g., sensor_readings_y2026m02), UTC timezone boundaries (1st of month at 00:00:00+00)
**Lifecycle Management**: Weekly partition:create job (maintains 3-month future buffer), monthly partition:retention job (drops partitions older than 24 months), default partition catchall for routing failures
**Application Transparency**: Drizzle ORM handles partitioned tables transparently (no service layer changes), PostgreSQL automatically routes inserts/queries to correct partition, partition pruning optimizes WHERE recorded_at queries
**Monitoring**: Grafana dashboard tracks partition count, future buffer status, default partition usage, BullMQ job execution history and failures
**Limitations**: Drizzle ORM does not support PARTITION BY in schema (requires custom DDL migration scripts), PostgreSQL requires PRIMARY KEY to include partition key (composite PK: id + recorded_at)

Evidence: backend/src/db/schema/telemetry.ts:18-50, backend/drizzle/0006_partition_sensor_readings.sql, backend/src/services/partition.service.ts, backend/docs/adr/ADR-009-partition-strategy.md

## I/O & Integration

**Database**: Drizzle ORM with PostgreSQL (node-postgres), schema co-located in db/schema/, migrations via drizzle-kit, health checks with SELECT 1, connection pooling via pg.Pool
**External APIs**: Fastify plugins wrap external services (emailPlugin, queuePlugin, socketPlugin), service layer abstractions (ttn.service.ts, telnyx.service.ts, stripe-webhook.service.ts)
**Resilience**: BullMQ retry with exponential backoff, health check skip status for optional dependencies (Redis), graceful shutdown with await close()

Evidence: backend/src/db/client.ts:1-45, backend/src/app.ts:136-154, backend/src/routes/health.ts:45-70, backend/src/workers/index.ts:21-37

## Concurrency & Async

**Async Usage**: async/await throughout, FastifyPluginAsync for route registration, async processors for BullMQ workers
**Patterns**: Worker concurrency limits (5 for SMS, 2 for email, 5 for meters), Promise.all for parallel health checks, graceful shutdown awaits all workers
**Safety**: Worker event handlers for job lifecycle (completed, failed, stalled), maxRetriesPerRequest: null for BullMQ workers (critical config), connection pooling for database

Evidence: backend/src/workers/index.ts:48-82, backend/src/routes/health.ts:75-78, backend/src/workers/index.ts:21-37

## Dependency & Configuration

**Injection**: Fastify plugin system with decorators (fastify.decorateRequest, fastify.queueService), plugins register services onto fastify instance, fp() wrapper ensures root-level registration
**Config**: Environment variables via dotenv, env-check.ts validates required vars, config constants at top of files (PORT, HOST, LOG_LEVEL), CORS_ORIGINS supports multiple formats
**Initialization**: Plugin registration order matters (auth before routes), app factory pattern (buildApp) enables testing, workers separate from API server, lazy health checks (skip if not initialized)

Evidence: backend/src/plugins/auth.plugin.ts:11-34, backend/src/app.ts:136-166, backend/src/index.ts:1-8, backend/src/routes/health.ts:45-54
