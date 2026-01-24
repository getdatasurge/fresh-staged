# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Runner:**
- Vitest 2.1.8
- Config: Integrated in `vite.config.ts` under `test` key

**Assertion Library:**
- Vitest built-in (`expect`)
- `@testing-library/jest-dom` for DOM matchers

**Run Commands:**
```bash
npx vitest              # Run tests in watch mode
npx vitest run          # Run all tests once
npx vitest run --coverage  # Run with coverage
```

## Test File Organization

**Location:**
- Feature tests: Co-located in `__tests__/` subdirectory within feature
- Library tests: Same directory as module with `.test.ts` suffix

**Naming:**
- `{moduleName}.test.ts` for unit tests
- Feature tests: descriptive names (`payloadClassification.test.ts`, `widgetHealthStates.test.ts`)

**Structure:**
```
src/
├── features/
│   └── dashboard-layout/
│       └── __tests__/
│           ├── payloadClassification.test.ts
│           ├── layoutValidation.test.ts
│           └── widgetHealthStates.test.ts
├── lib/
│   └── actions/
│       ├── gatewayEligibility.ts
│       ├── gatewayEligibility.test.ts
│       ├── sensorEligibility.ts
│       └── sensorEligibility.test.ts
└── test/
    └── setup.ts
```

## Test Setup

**Setup File:** `src/test/setup.ts`
```typescript
import "@testing-library/jest-dom";
```

**Vitest Config:**
```typescript
test: {
  globals: true,          // describe, it, expect available globally
  environment: "jsdom",   // Browser-like environment
  setupFiles: ["./src/test/setup.ts"],
  include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
}
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Feature/Module Name", () => {
  describe("function or component name", () => {
    it("describes expected behavior in plain English", () => {
      // Arrange
      const input = {...};

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result.allowed).toBe(true);
    });
  });
});
```

**Patterns:**
- Nested `describe` blocks for grouping related tests
- `it` descriptions: behavior-focused, reads like sentence
- AAA pattern: Arrange, Act, Assert
- Use `beforeEach` for shared setup, `afterEach` for cleanup

## Test Data Patterns

**Fixtures:**
```typescript
const validTtnConfig: TTNConfigState = {
  isEnabled: true,
  hasApiKey: true,
  applicationId: "test-app-id",
};

const validGateway: GatewayForEligibility = {
  gateway_eui: "AABBCCDDEEFF0011",
  ttn_gateway_id: null,
  status: "pending",
};
```

**Sample Payloads:**
```typescript
const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  temp_rh_v1: { temperature: 3.5, humidity: 62, battery_level: 95 },
  door_v1: { door_open: true, battery_level: 90 },
  temperature_only_v1: { temperature: 5.2, battery_level: 80 },
};
```

**Test Cases Array Pattern:**
```typescript
const testCases = [
  { gateway: { ...validGateway, ttn_gateway_id: "exists" }, ttn: validTtnConfig },
  { gateway: validGateway, ttn: null },
  { gateway: validGateway, ttn: { ...validTtnConfig, isEnabled: false } },
];

testCases.forEach(({ gateway, ttn }) => {
  const result = canProvisionGateway(gateway, ttn);
  if (!result.allowed) {
    expect(result.reason).toBeDefined();
  }
});
```

## Mocking

**Framework:** Vitest built-in (`vi`)

**Patterns:**
```typescript
import { vi, beforeEach } from "vitest";

// Mock module
vi.mock("@/integrations/supabase/client", () => ({
  supabase: mockSupabase,
}));

// Reset between tests
beforeEach(() => {
  vi.clearAllMocks();
  clearAllCounters(); // Custom cleanup
});

// Spy on functions
const spy = vi.spyOn(module, 'function');
expect(spy).toHaveBeenCalledWith(expectedArgs);
```

**What to Mock:**
- External services (Supabase, APIs)
- Time-dependent functions
- Browser APIs when testing in jsdom

**What NOT to Mock:**
- Internal business logic under test
- Type definitions
- Pure utility functions

## Assertion Patterns

**Common Matchers:**
```typescript
// Basic equality
expect(result.allowed).toBe(true);
expect(result.code).toBe("ALLOWED");

// Defined/undefined
expect(result.reason).toBeUndefined();
expect(result.reason).toBeDefined();

// String matching
expect(result.reason).toContain("already provisioned");

// Arrays
expect(result.missingRequired).toHaveLength(0);
expect(result.rights).toContainEqual("RIGHT_APPLICATION_INFO");
expect(navTreeKeys).toContainEqual(["nav-tree"]);

// Numbers
expect(result.confidence).toBeGreaterThan(0.5);
expect(result.confidence).toBeGreaterThanOrEqual(0.5);

// Objects
expect(widget.requiredCapabilities).toBeDefined();
expect(Array.isArray(widget.requiredCapabilities)).toBe(true);
```

**Custom Error Messages:**
```typescript
expect(
  SAMPLE_PAYLOADS[type],
  `Missing sample payload for schema: ${type}`
).toBeDefined();

expect(
  result.payloadType.match(/_v\d+$/),
  `Inferred type "${result.payloadType}" must be versioned or 'unclassified'`
).not.toBeNull();
```

## Coverage

**Requirements:** Not formally enforced (no coverage thresholds in config)

**View Coverage:**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Focus: Individual functions, pure logic
- Location: Co-located with modules
- Example: Eligibility functions, validation logic, utility functions

**Integration Tests:**
- Focus: Module interactions, state management
- Location: Feature `__tests__/` directories
- Example: Widget health state machine, payload classification

**E2E Tests:**
- Framework: Not configured
- Status: Not implemented in this codebase

## Common Patterns

**Async Testing:**
```typescript
it("handles async operations", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

**Error Testing:**
```typescript
it("returns error for invalid input", () => {
  const result = validatePayloadSchema(null, "temp_rh_v1");

  expect(result.valid).toBe(false);
  expect(result.errors).toContain("No payload data available");
});
```

**Boundary Testing:**
```typescript
it("returns false for empty array", () => {
  expect(detectOutOfOrderTimestamps([])).toBe(false);
});

it("returns false for single reading", () => {
  const readings = [{ recorded_at: "2024-01-15T10:00:00Z" }];
  expect(detectOutOfOrderTimestamps(readings)).toBe(false);
});
```

**Contract Testing:**
```typescript
describe("Widget Registry Contracts", () => {
  it("every widget MUST have requiredCapabilities defined", () => {
    Object.entries(WIDGET_REGISTRY).forEach(([id, widget]) => {
      expect(widget.requiredCapabilities).toBeDefined();
      expect(Array.isArray(widget.requiredCapabilities)).toBe(true);
    });
  });
});
```

**Exhaustive Case Testing:**
```typescript
describe("Each registered schema has a sample payload", () => {
  const registeredTypes = Object.keys(PAYLOAD_SCHEMAS);

  it("sample payloads exist for all registered schemas", () => {
    registeredTypes.forEach(type => {
      expect(
        SAMPLE_PAYLOADS[type],
        `Missing sample payload for schema: ${type}`
      ).toBeDefined();
    });
  });
});
```

## Deno Tests (Edge Functions)

**Location:** `supabase/functions/_shared/*.test.ts`

**Framework:** Deno built-in test runner

**Pattern:**
```typescript
import { assertEquals, assertArrayIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("test name", () => {
  const result = computePermissionReport(rights);
  assertEquals(result.valid, true);
  assertArrayIncludes(result.rights, ["RIGHT_APPLICATION_TRAFFIC_READ"]);
});
```

**Run Commands:**
```bash
deno test supabase/functions/_shared/ttnPermissions.test.ts
```

## Testing Best Practices

**Naming:**
- Use descriptive `it` statements that explain expected behavior
- Include the condition being tested: `"returns ALLOWED when all conditions are met"`
- Test both positive and negative cases

**Structure:**
- One assertion focus per test (multiple related assertions OK)
- Keep tests independent - no shared state between tests
- Use `beforeEach` for setup, not constructor-like patterns

**Maintainability:**
- Define fixtures at top of test file
- Use constants for magic values
- Group related tests with nested `describe`

**CI Gate Pattern:**
```typescript
/**
 * Deterministic Payload Classification Tests
 *
 * CI Gate: These tests ensure every sample payload matches exactly one versioned
 * payload type, or is explicitly classified as "unclassified".
 *
 * Ambiguous matches MUST fail CI (no silent ambiguity allowed).
 */
```

---

*Testing analysis: 2026-01-23*
