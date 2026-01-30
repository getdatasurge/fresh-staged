# Phase 52: Backend TTN Webhook Tests - Research

**Researched:** 2026-01-30
**Domain:** Vitest test consolidation, Fastify plugin mocking
**Confidence:** HIGH

## Summary

Phase 52 concerns 14 `it.skip()` tests in `backend/tests/api/ttn-webhooks.test.ts`. These tests were skipped because the file does not mock the socket plugin (`socket.plugin.ts`), which means `request.server.sensorStreamService` is undefined when the route handler tries to call `addReading()`.

However, `backend/tests/routes/ttn-webhook.test.ts` already has 32 PASSING tests that cover every single one of the 14 skipped scenarios -- and more. The routes file correctly mocks the socket plugin using the `Symbol.for('skip-override')` pattern that `fastify-plugin` requires to propagate decorators.

**Primary recommendation:** Delete the `tests/api/ttn-webhooks.test.ts` file entirely. The `tests/routes/ttn-webhook.test.ts` file is a strict superset of its coverage. Implementing the skipped tests would create exact duplicates that increase maintenance burden with zero additional coverage.

## Key Finding: Complete Test Duplication

### Test-by-Test Mapping

Every skipped test in `tests/api/ttn-webhooks.test.ts` has an equivalent passing test in `tests/routes/ttn-webhook.test.ts`:

| #   | Skipped test in `api/`                                     | Covered by in `routes/`                                               | Status      |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ----------- |
| 1   | should accept X-Webhook-Secret header                      | should accept X-Webhook-Secret header as alternative auth (line 256)  | EXACT match |
| 2   | should use device_id when dev_eui is missing               | should fall back to device_id when dev_eui is absent (line 329)       | EXACT match |
| 3   | should return 400 for invalid payload structure            | should return 400 for structurally invalid payload (line 508)         | EXACT match |
| 4   | should return 200 and process valid webhook                | should return 200 and process valid webhook (line 529)                | EXACT match |
| 5   | should ingest reading with correct data                    | should store reading with correct sensor/unit association (line 547)  | EXACT match |
| 6   | should trigger alert evaluation                            | should trigger alert evaluation for the unit (line 593)               | EXACT match |
| 7   | should report alertsTriggered when alert is created        | should report alertsTriggered=1 when alert is created (line 613)      | EXACT match |
| 8   | should update device metadata                              | should update device metadata after processing (line 653)             | EXACT match |
| 9   | should handle simulated uplinks                            | should handle simulated uplinks (line 798)                            | EXACT match |
| 10  | should handle temp field instead of temperature            | should handle "temp" field instead of "temperature" (line 708)        | EXACT match |
| 11  | should handle battery_voltage field                        | should handle battery_voltage and convert to percentage (line 750)    | EXACT match |
| 12  | should use best signal strength from multiple gateways     | should use best signal strength from multiple gateways (line 773)     | EXACT match |
| 13  | should continue processing if alert evaluation fails       | should continue processing if alert evaluation fails (line 819)       | EXACT match |
| 14  | should continue processing if device metadata update fails | should continue processing if device metadata update fails (line 838) | EXACT match |

Additionally, the 6 PASSING tests in `api/ttn-webhooks.test.ts` are also duplicated:

| Passing test in `api/`                                             | Also passing in `routes/`                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| should return 401 without API key header                           | should return 401 when API key is missing (line 270)                          |
| should return 401 with invalid API key                             | should return 401 with invalid API key (line 285)                             |
| should return 404 when device not found                            | should handle unknown DevEUI gracefully (line 382)                            |
| should return 401 when device belongs to different organization    | should return 401 when device belongs to different organization (line 399)    |
| should return 422 when decoded_payload is missing                  | should return 422 when decoded_payload is missing (line 448)                  |
| should return 422 when temperature is missing from decoded_payload | should return 422 when temperature is missing from decoded_payload (line 468) |

**Result: All 20 tests (6 passing + 14 skipped) in the api file are exact duplicates of tests already passing in the routes file.**

### Routes file has ADDITIONAL coverage not in api file

The `routes/` file also has these tests that have NO equivalent in `api/`:

1. should accept valid uplink payload with correct API key (happy path with full assertion)
2. should normalize DevEUI to consistent format (uppercase, no separators)
3. should return 400 when both dev_eui and device_id are missing
4. should handle malformed JSON payload (schema validation returns 400)
5. should parse temperature from TTN payload correctly
6. should add reading to real-time streaming service (sensorStreamService.addReading)
7. should report alertsTriggered=1 when alert is resolved (resolved vs created)
8. should process the same webhook payload twice without errors (idempotency)
9. should handle "temperature_f" field and convert to Celsius
10. should throw error if reading ingestion fails (500 error case)
11. should throw error if ingestion returns zero inserted count (500 error case)
12. should execute the complete webhook flow in order (end-to-end ordering)

## Architecture Patterns

### Test Directory Convention

The codebase has two test directories:

```
backend/tests/
  api/          # 14 test files - route-level tests (uses buildApp + inject)
  routes/       # 1 test file - only ttn-webhook.test.ts exists
  services/     # Service-level unit tests
  middleware/   # Middleware tests
  trpc/         # tRPC router tests
  helpers/      # Test utilities
  mocks/        # Shared mock modules
  workers/      # Worker/job tests
  utils/        # Utility tests
```

**Convention observed:** `tests/api/` is the standard location for route-level integration tests. `tests/routes/` was created solely to hold the fixed TTN webhook test and has only one file. The `routes/` directory appears to be a one-off solution rather than a systematic pattern.

### Why Two Files Exist

Based on the commit history and code comments, the timeline was:

1. `tests/api/ttn-webhooks.test.ts` was created first as part of the standard test suite
2. Tests that required full request processing (past the authentication check) failed because `request.server.sensorStreamService` was undefined
3. Those 14 tests were marked as `it.skip()` with comments about the "Fastify plugin mocking issue"
4. `tests/routes/ttn-webhook.test.ts` was created later as the "fixed" version with proper socket plugin mocking
5. The old file was never cleaned up

### Socket Plugin Mocking Pattern (for reference)

The working pattern from `tests/routes/ttn-webhook.test.ts`:

```typescript
// Mock socket plugin - inject mock sensorStreamService & socketService
const mockAddReading = vi.fn();
const mockGetLatestReading = vi.fn().mockReturnValue(null);
const mockStop = vi.fn();
const mockEmitToOrg = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/plugins/socket.plugin.js', () => {
  return {
    default: Object.assign(
      async function socketPlugin(fastify: any) {
        fastify.decorate('io', {});
        fastify.decorate('socketService', {
          emitToOrg: mockEmitToOrg,
          joinOrganization: vi.fn(),
          joinSite: vi.fn(),
          joinUnit: vi.fn(),
          leaveRoom: vi.fn(),
          initialize: mockInitialize,
          shutdown: mockShutdown,
        });
        fastify.decorate('sensorStreamService', {
          addReading: mockAddReading,
          getLatestReading: mockGetLatestReading,
          stop: mockStop,
        });
      },
      // CRITICAL: fastify-plugin reads Symbol.for('skip-override')
      // to propagate decorators to the parent scope
      { [Symbol.for('skip-override')]: true },
    ),
  };
});
```

**Why `Symbol.for('skip-override')` is needed:** The real `socket.plugin.ts` is wrapped with `fastifyPlugin()` (line 194). When `fastify-plugin` wraps a plugin, it sets `Symbol.for('skip-override')` on it to tell Fastify to NOT encapsulate the plugin's decorators -- meaning `io`, `socketService`, and `sensorStreamService` become available on the parent Fastify instance. The mock must replicate this behavior or the decorators stay scoped to the plugin context and are invisible to route handlers.

## Don't Hand-Roll

| Problem                 | Don't Build                                    | Use Instead                               | Why                                                      |
| ----------------------- | ---------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| Fixing 14 skipped tests | Re-implement all 14 test bodies in `api/` file | Delete `api/` file, keep `routes/` file   | 100% duplicate coverage already exists                   |
| Socket plugin mocking   | Custom mock per test file                      | The `Symbol.for('skip-override')` pattern | `fastify-plugin` requires this for decorator propagation |

**Key insight:** The right action here is deletion, not implementation. The "fix all skipped tests" goal is achieved by recognizing they are already passing elsewhere and removing the dead code.

## Common Pitfalls

### Pitfall 1: Implementing Duplicate Tests

**What goes wrong:** Developer implements all 14 skipped tests, creating a maintenance burden with two identical test suites
**Why it happens:** Phase description says "fix all skipped tests" which implies writing test bodies
**How to avoid:** Recognize that `tests/routes/ttn-webhook.test.ts` already covers everything
**Warning signs:** Two test files testing the same route with the same mocking pattern

### Pitfall 2: Keeping Both Files with Different "Layers"

**What goes wrong:** Attempting to justify both files by claiming they test "different layers"
**Why it happens:** `tests/api/` and `tests/routes/` directory names suggest different test levels
**How to avoid:** Both files use `buildApp()` + `app.inject()` -- they are the SAME layer (route-level integration tests). The directory difference is accidental, not intentional.
**Warning signs:** Both files import `buildApp`, use `app.inject()`, mock the same services

### Pitfall 3: Missing the Socket Plugin Mock

**What goes wrong:** If someone tries to un-skip tests in the `api/` file by just adding test bodies, they hit the same `sensorStreamService is undefined` error
**Why it happens:** The `api/` file mocks individual services but not the socket plugin that provides `sensorStreamService`
**How to avoid:** Either add the socket plugin mock (making it identical to `routes/` file) or just delete the file

## Recommended Approach

### Option A: Delete api file (RECOMMENDED)

1. Delete `backend/tests/api/ttn-webhooks.test.ts` entirely
2. Verify `backend/tests/routes/ttn-webhook.test.ts` still passes (32/32 tests)
3. Net result: -14 skipped tests, -6 duplicate passing tests, 0 coverage loss

**Impact on test counts:**

- Before: 1252 passed, 38 skipped (14 from this file)
- After: 1246 passed, 24 skipped (removes 6 passing duplicates + 14 skips)
- Coverage: Identical (routes file covers everything)

### Option B: Fix api file by adding socket mock

1. Add the socket plugin mock to `tests/api/ttn-webhooks.test.ts`
2. Implement all 14 test bodies (copy from routes file)
3. Net result: +14 passing tests, but all are duplicates

**Why B is worse:** It doubles the maintenance surface for zero coverage gain. Every future change to the webhook handler requires updating two identical test files.

### Option C: Consolidate into api directory (if directory convention matters)

1. Move `tests/routes/ttn-webhook.test.ts` to `tests/api/ttn-webhooks.test.ts` (overwrite)
2. Delete `tests/routes/` directory (it would be empty)
3. Net result: Same coverage, conventional directory structure

**This is the best compromise** if maintaining `tests/api/` as the standard location is important. It preserves the convention that all route-level tests live in `tests/api/`.

## State of the Art

| Old Approach                        | Current Approach                                      | When Changed                  | Impact                        |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------- | ----------------------------- |
| Skip tests that need socket mocking | Mock socket plugin with `Symbol.for('skip-override')` | When routes/ file was created | All 14 scenarios now testable |
| `tests/api/` only                   | `tests/api/` + `tests/routes/`                        | When routes/ file was created | Created inconsistency         |

## Open Questions

1. **Should `tests/routes/` directory be removed entirely?**
   - What we know: It has only one file and doesn't follow the established convention
   - What's unclear: Whether there's a plan to use `tests/routes/` for other route tests
   - Recommendation: Consolidate to `tests/api/` (Option C) for consistency

2. **Are there other test files with the same socket plugin mocking issue?**
   - What we know: Only `ttn-webhooks.test.ts` in `api/` references sensorStreamService
   - What's unclear: Whether other future route tests will need this pattern
   - Recommendation: Document the socket plugin mock pattern in a test helper for reuse

## Sources

### Primary (HIGH confidence)

- `backend/tests/api/ttn-webhooks.test.ts` - Read in full, all 399 lines
- `backend/tests/routes/ttn-webhook.test.ts` - Read in full, all 943 lines
- `backend/src/routes/ttn-webhooks.ts` - Read in full, all 239 lines
- `backend/src/plugins/socket.plugin.ts` - Read in full, all 198 lines
- Vitest test run output - Both files executed, results verified

### Verification

- API file: 6 passed, 14 skipped (confirmed via `vitest run`)
- Routes file: 32 passed, 0 skipped (confirmed via `vitest run`)
- Full suite: 1252 passed, 38 skipped, 10 failed (confirmed via `vitest run`)

## Metadata

**Confidence breakdown:**

- Test duplication analysis: HIGH - Both files read line-by-line and compared
- Socket mock pattern: HIGH - Verified in working test and source plugin
- Recommendation: HIGH - Clear evidence that consolidation is correct

**Research date:** 2026-01-30
**Valid until:** Stable finding -- applies as long as both test files exist
