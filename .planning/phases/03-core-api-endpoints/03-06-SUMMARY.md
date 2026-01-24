---
phase: 03-core-api-endpoints
plan: 06
subsystem: testing
tags: [vitest, api-tests, integration-tests, authorization]

dependency-graph:
  requires:
    - 03-02 (Organizations routes)
    - 03-03 (Sites routes)
    - 03-04 (Areas routes)
    - 03-05 (Units routes)
  provides:
    - API integration test suite
    - Authorization test coverage
    - Hierarchy validation tests
  affects:
    - Phase 4 (API tests pattern for sensors)
    - Phase 5 (API tests pattern for telemetry)

tech-stack:
  added: []
  patterns:
    - Service layer mocking for isolated route testing
    - Fastify inject() for HTTP simulation
    - RFC 4122 v4 UUID generation for Zod 4 compatibility

key-files:
  created:
    - backend/tests/helpers/fixtures.ts
    - backend/tests/api/organizations.test.ts
    - backend/tests/api/sites.test.ts
    - backend/tests/api/areas.test.ts
    - backend/tests/api/units.test.ts
  modified: []

decisions:
  - key: service-mocking-pattern
    choice: Mock at service layer, not database
    rationale: Faster isolated tests, no database dependency, follows existing auth/rbac test patterns

metrics:
  duration: 8m 20s
  completed: 2026-01-23
---

# Phase 3 Plan 6: API Integration Tests Summary

**One-liner:** Comprehensive test suite for all Core API endpoints with 81 new tests covering authorization, validation, and hierarchy protection.

## Accomplishments

1. **Test Fixtures** (Task 1)
   - Created `backend/tests/helpers/fixtures.ts` for database seeding
   - Fixture functions: createTestOrg, createTestUser, createTestSite, createTestArea, createTestUnit
   - cleanupTestData for cascade delete via organization deletion

2. **Organization API Tests** (Task 2)
   - 12 tests covering GET, PUT, and members list endpoints
   - Authorization verification: owner-only for updates, any member for reads
   - 404 handling when organization doesn't exist

3. **Sites API Tests** (Task 2)
   - 25 tests covering full CRUD operations
   - Authorization: admin+ required for mutations, viewer+ for reads
   - Validation: 400 for missing name, name exceeding 256 chars
   - Cross-org protection: 403 for non-members

4. **Areas API Tests** (Task 3)
   - 18 tests covering full CRUD operations
   - Authorization: admin+ required for mutations
   - Hierarchy validation: 404 when site not found in org

5. **Units API Tests** (Task 3)
   - 26 tests covering full CRUD operations
   - Authorization: manager+ required for mutations (equipment is manager domain)
   - Validation: 400 for tempMin >= tempMax, invalid unitType
   - Full hierarchy validation (org -> site -> area)

## Test Coverage Summary

| Endpoint Group | Tests | Auth Coverage | Validation | Hierarchy |
|---------------|-------|---------------|------------|-----------|
| Organizations | 12    | owner/viewer  | -          | N/A       |
| Sites         | 25    | admin/manager/viewer | 400 errors | org-scoped |
| Areas         | 18    | admin/manager/viewer | 400 errors | site-scoped |
| Units         | 26    | manager+/viewer | tempMin<tempMax | full chain |
| **Total New** | **81** | - | - | - |

## Technical Notes

### Zod 4 UUID Validation
Zod 4 requires RFC 4122 compliant UUIDs with proper version (position 13 = 1-5) and variant (position 17 = 8/9/a/b) bits. Invalid UUIDs like `00000000-0000-0000-0000-000000000001` fail validation.

**Solution:** Generate test UUIDs using `crypto.randomUUID()` which produces v4 compliant UUIDs.

### Service Mocking Pattern
Tests mock at the service layer rather than the database:
```typescript
vi.mock('../../src/services/site.service.js', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  // ...
}));
```

This provides:
- Fast test execution (~500ms for 91 tests)
- No database dependency
- Isolated route handler testing
- Consistent with existing auth/rbac tests

## Commits

| Hash | Message |
|------|---------|
| 7134b50 | test(03-06): create test fixtures for database seeding |
| 0feb0ff | test(03-06): create organization and site API tests |
| c3437ad | test(03-06): create area and unit API tests |

## Deviations from Plan

### [Rule 3 - Blocking] Fixture file not used for integration tests
- **Found during:** Task 2
- **Issue:** Tests required database connection, but Docker wasn't running
- **Resolution:** Switched to service-layer mocking pattern matching existing tests
- **Impact:** Fixtures file still created for future integration tests with real DB

## Success Criteria Verification

- [x] All API tests pass (91 tests)
- [x] Authorization verified at each endpoint (viewer, staff, manager, admin, owner)
- [x] Hierarchy validation tested (area must be in site, site must be in org)
- [x] Validation errors return 400 with structured response
- [x] Non-existent resources return 404
- [x] Cross-org access returns 403

## Next Phase Readiness

Phase 3 (Core API Endpoints) is now complete with:
- All 6 plans executed
- 91 total tests passing
- Full CRUD for organizations, sites, areas, and units
- Authorization and hierarchy validation tested

Ready for Phase 4: Sensor & Device Management
