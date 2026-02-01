# Code Quality Check Report #1

**Feature**: REC-001
**Date**: 2026-02-01
**Project**: FreshStaged (fresh-staged)
**Build System**: npm (Node.js/TypeScript)
**Test Scope**: all
**Coverage Target**: 80%

---

## Executive Summary

**Overall Status**: ❌ FAIL

The codebase has significant quality issues that must be addressed before merging:

| Check | Status | Details |
|-------|--------|---------|
| Linting | ⚠️ WARN | 3 errors, 486 warnings |
| Type Checking | ❌ FAIL | 199 TypeScript errors |
| Tests | ✅ PASS | 129/141 passed (12 skipped) |
| Formatting | ⚠️ WARN | 100+ files need formatting |
| Coverage | ⚠️ UNKNOWN | Not measured (no coverage configured) |

---

## Linting Results

**Command**: `npm run lint` (ESLint)
**Status**: ⚠️ WARN (3 errors, 486 warnings)

### Critical Errors (3)
1. **backend/src/routers/subscription.router.ts:209:20** - Unexpected aliasing of `this` to local variable
2. **backend/src/utils/audit.ts:153:19** - Unexpected aliasing of `this` to local variable
3. **supabase/functions/ttn-bootstrap/index.ts:107:11** - Unexpected aliasing of `this` to local variable

### Warning Breakdown

**Type Issues (Most Common)**:
- **@typescript-eslint/no-explicit-any**: 200+ occurrences
  - Most prevalent in backend routers, services, and frontend pages
  - Examples: `admin.router.ts`, `dashboard-layout.router.ts`, `UnitDetail.tsx`

**React Hooks Issues**:
- **react-hooks/exhaustive-deps**: 50+ occurrences
  - Missing dependencies in `useEffect` hooks
  - Examples: `Organizations.tsx`, `PilotSetup.tsx`, `PlatformDeveloperTools.tsx`

**Code Quality Issues**:
- **prefer-const**: 20+ occurrences (variables declared with `let` but never reassigned)
- **no-useless-escape**: Unnecessary escape characters in regex
- **react-refresh/only-export-components**: Fast refresh compatibility issues

### Top Offending Files
1. `backend/src/services/alert-history.service.ts` - 8 warnings
2. `src/pages/UnitDetail.tsx` - 8 warnings
3. `backend/src/routers/admin.router.ts` - 7 warnings
4. `backend/src/routers/dashboard-layout.router.ts` - 4 warnings

---

## Type Checking Results

**Command**: `npm run typecheck` (TypeScript Compiler)
**Status**: ❌ FAIL (199 errors)

### Critical Type Errors

#### 1. Schema Mismatch Issues (Backend)
**Files Affected**: `onboarding.router.ts`, `notification-policies.router.ts`

**Problem**: Drizzle ORM schema definitions don't match insert operations
- `organizations` table missing `timezone` field
- `ttn_settings` table missing `isActive` field
- `user_roles` table missing `role` field
- `preferences` table missing multiple fields

**Example**:
```typescript
// backend/src/routers/onboarding.router.ts:119
db.insert(organizations).values({
  name: input.name,
  slug: input.slug,
  timezone: input.timezone, // ERROR: 'timezone' doesn't exist in schema
})
```

#### 2. tRPC Router Type Issues (Frontend)
**Files Affected**: Multiple platform pages (`PlatformOrganizationDetail.tsx`, `PlatformUserDetail.tsx`, etc.)

**Problem**: Frontend accessing non-existent tRPC procedures
- `platform.getOrganization` doesn't exist on router
- `platform.getUser` doesn't exist on router
- Missing type exports from backend causing `unknown` types

**Impact**: ~100+ type errors across platform admin pages

#### 3. Data Access Type Safety Issues
**Pattern**: Accessing properties on `unknown` types

**Example**:
```typescript
// src/pages/platform/PlatformOrganizationDetail.tsx:60
const orgName = org.name; // ERROR: Property 'name' does not exist on type 'unknown'
```

### Error Distribution
- Backend Routers: 15 errors (schema mismatches)
- Frontend Platform Pages: 150+ errors (missing tRPC procedures, unknown types)
- Frontend Other Pages: 30+ errors (type safety issues)

---

## Test Results

**Command**: `npm run test` (Vitest)
**Status**: ✅ PASS

### Summary
- **Total Test Files**: 10
- **Tests Passed**: 129
- **Tests Skipped**: 12
- **Tests Failed**: 0
- **Duration**: 1.88s

### Test Coverage by Module

| Module | Tests | Status |
|--------|-------|--------|
| Gateway Eligibility | 15 | ✅ All passed |
| Sensor Eligibility | 16 | ✅ All passed |
| Widget Health States | 33 (12 skipped) | ✅ All passed |
| Payload Classification | 32 | ✅ All passed |
| Org Scoped Invalidation | 6 | ✅ All passed |
| Layout Validation | 14 | ✅ All passed |
| Organizations Hook | 3 | ✅ All passed |
| TTN Credentials Panel | 5 | ✅ All passed |
| Alerts Hook | 11 | ✅ All passed |
| Sites Hook | 6 | ✅ All passed |

### Notes
- All tests passing indicates good test quality
- 12 skipped tests should be reviewed (likely conditional/environment-specific)
- Test execution is fast (1.88s total)
- Good coverage of hooks, utilities, and domain logic

---

## Formatting Results

**Command**: `npx prettier --check .`
**Status**: ⚠️ WARN (100+ files need formatting)

### Files Needing Format
- `.agent/` directory: All markdown files
- `.claude/` directory: Agent definitions, commands, templates
- `.beads/` directory: Configuration files

**Note**: Most unformatted files are in documentation/config directories, not source code. Core TypeScript/JavaScript files appear to be formatted correctly (no warnings in `src/` or `backend/src/`).

---

## Coverage Analysis

**Status**: ⚠️ NOT CONFIGURED

### Issue
No code coverage tool is configured in the project. The `package.json` does not include:
- Coverage scripts (e.g., `test:coverage`)
- Coverage libraries (e.g., `vitest --coverage`, `c8`, `nyc`)

### Recommendation
Configure Vitest coverage using `@vitest/coverage-v8`:

```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^2.1.8"
  }
}
```

**Unable to verify 80% coverage target** without tooling.

---

## Recommendations

### Priority 1: Critical (Must Fix Before Merge)

1. **Fix Type Errors (199 errors)**
   - Update Drizzle schema to match database columns
   - Add missing tRPC procedures for platform admin routes
   - Export proper types from backend for frontend consumption

2. **Fix ESLint Critical Errors (3 errors)**
   - Replace `this` aliasing with arrow functions or bind
   - Files: `subscription.router.ts`, `audit.ts`, `ttn-bootstrap/index.ts`

### Priority 2: High (Should Fix Soon)

3. **Reduce `any` Type Usage (200+ warnings)**
   - Replace `any` with proper type definitions
   - Focus on backend routers and services first
   - Use `unknown` with type guards where appropriate

4. **Fix React Hooks Dependencies (50+ warnings)**
   - Add missing dependencies to `useEffect` arrays
   - Consider using `useCallback` for stable function references
   - Review exhaustive-deps warnings in platform pages

### Priority 3: Medium (Quality Improvements)

5. **Configure Code Coverage**
   - Install `@vitest/coverage-v8`
   - Add coverage npm script
   - Set coverage thresholds in `vitest.config.ts`
   - Target: 80% coverage

6. **Replace `let` with `const` (20+ warnings)**
   - Use `const` for variables that aren't reassigned
   - Improves code clarity and prevents accidental mutations

7. **Format Documentation Files**
   - Run `npx prettier --write .` on `.agent/`, `.claude/`, `.beads/` directories
   - Consider adding `.prettierignore` if formatting these files is not desired

### Priority 4: Low (Nice to Have)

8. **Review Skipped Tests (12 tests)**
   - Understand why tests are skipped
   - Re-enable or document reasoning

---

## Overall Assessment

**Status**: ❌ FAIL

### Critical Blockers
1. **199 TypeScript errors** - Code will not compile in strict mode
2. **3 ESLint errors** - Violate critical code quality rules
3. **Schema/Database misalignment** - Runtime errors likely

### Code Health Score: 45/100

| Metric | Score | Weight | Weighted |
|--------|-------|--------|----------|
| Tests Passing | 100 | 30% | 30 |
| Type Safety | 0 | 30% | 0 |
| Linting | 40 | 20% | 8 |
| Formatting | 70 | 10% | 7 |
| Coverage | 0 | 10% | 0 |
| **Total** | | | **45** |

### Verdict
**DO NOT MERGE** - This code has critical type safety issues that will cause compilation failures and likely runtime errors. The schema misalignment between Drizzle ORM and database operations suggests incomplete refactoring or missing migrations.

**Estimated Fix Time**: 8-12 hours
- Schema alignment: 2-3 hours
- Type error fixes: 4-6 hours
- Lint error fixes: 1 hour
- Testing fixes: 1-2 hours

### Next Steps
1. Fix all TypeScript compilation errors (Priority 1)
2. Verify database schema matches code expectations
3. Fix critical ESLint errors
4. Re-run code check to verify fixes
5. Configure and run coverage analysis
6. Address remaining warnings incrementally

---

**Report Generated**: 2026-02-01
**Generated By**: Code Checker Agent
**Report Location**: `/home/swoop/swoop-claude-projects/projects/fresh-staged/.rp1/work/features/REC-001/code_check_report_1.md`
