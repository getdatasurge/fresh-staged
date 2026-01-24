---
phase: 06-data-migration-scripts
plan: 03
subsystem: user-migration
tags: [stack-auth, user-mapping, migration, typescript, esm]

# Dependency graph
requires:
  - phase: 06-data-migration-scripts
    plan: 01
    provides: Migration script infrastructure (logger, pg clients, table metadata)
provides:
  - User ID mapping utilities with 90-day retention tracking
  - Stack Auth user creation script from Supabase export
  - Mapping generation for existing users by email matching
affects:
  - 06-04 data import scripts (will use user mapping during FK updates)
  - 06-05 verification scripts (will validate user mapping)

# Tech tracking
tech-stack:
  added: []
  patterns: [Stack Auth REST API integration, user ID mapping, rate-limited API calls]

key-files:
  created:
    - scripts/migration/lib/user-mapping.ts
    - scripts/migration/migrate-users.ts
    - scripts/migration/map-users.ts
    - scripts/migration/test-user-mapping.ts
  modified:
    - scripts/migration/package.json

key-decisions:
  - "90-day mapping retention with retainUntil timestamp in file"
  - "Stack Auth user creation via REST API (POST /api/v1/users)"
  - "Password migration not supported - users need password reset post-migration"
  - "Case-insensitive email matching for existing user mapping"
  - "100ms default rate limit between Stack Auth API calls"

patterns-established:
  - "UserMapping interface: supabaseUserId, stackAuthUserId, email, migratedAt"
  - "UserMappingFile structure with generatedAt and retainUntil metadata"
  - "CLI pattern: commander with --dry-run, --input, --output options"

# Metrics
duration: 4min
completed: 2026-01-23
---

# Phase 6 Plan 03: User Migration Scripts Summary

**Stack Auth user creation from Supabase export with ID mapping persistence and 90-day retention tracking**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-23T22:21:24Z
- **Completed:** 2026-01-23T22:25:51Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- User ID mapping utilities with save/load and retention tracking
- migrate-users.ts creates users in Stack Auth from Supabase auth.users JSON export
- map-users.ts generates mapping by matching existing users by email
- All scripts support --dry-run mode for safe testing
- 90-day retention marker in mapping file with warn-only expiry check
- Rate limiting (default 100ms) for Stack Auth API calls
- Password migration limitation documented in code and CLI output

## Task Commits

Each task was committed atomically:

1. **Task 1: Create user mapping utilities** - `fc3ffe5` (feat)
2. **Task 2: Create Stack Auth user migration script** - `9629c7f` (feat)
3. **Task 3: Create mapping generation script** - `de1537e` (feat)

## Files Created

- `scripts/migration/lib/user-mapping.ts` - UserMapping/UserMappingFile types, loadMapping, saveMapping, mapUserId, getMappingStats, validateMappings
- `scripts/migration/migrate-users.ts` - Create users in Stack Auth from Supabase export, generate mapping file
- `scripts/migration/map-users.ts` - Match existing users by email and generate mapping
- `scripts/migration/test-user-mapping.ts` - Unit test for mapping utilities roundtrip

## Files Modified

- `scripts/migration/package.json` - Added migrate-users, map-users, test-user-mapping scripts

## Decisions Made

1. **90-day mapping retention** - Mapping files include `retainUntil` timestamp 90 days from generation. Expired files trigger warning but don't block operations to allow recovery scenarios.

2. **Password migration limitation** - Supabase uses bcrypt hashes that Stack Auth cannot import. Users must reset passwords post-migration via forgot password flow. This is clearly documented in migrate-users.ts header comments and printed during execution.

3. **Case-insensitive email matching** - map-users.ts matches users by email.toLowerCase() to handle case variations between systems.

4. **100ms default rate limit** - Configurable via --rate-limit CLI option. Prevents overwhelming Stack Auth API during bulk user creation.

5. **Dry-run mode for all scripts** - Both migrate-users.ts and verification flow support --dry-run to preview operations without API calls.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. **User mapping utilities roundtrip** - All 7 unit tests pass (save/load/map/stats/validate/constants)
2. **migrate-users.ts parses auth_users.json** - Dry-run mode successfully processed 3 test users
3. **Stack Auth API calls use correct headers** - Verified x-stack-access-type, x-stack-project-id, x-stack-secret-server-key headers
4. **Mapping file includes retention metadata** - retainUntil timestamp present, 90 days from generatedAt
5. **Scripts handle API rate limiting** - sleep() function with configurable delay between calls
6. **Password migration limitation documented** - Comments in migrate-users.ts header and runtime output

## Key Links Verified

| From | To | Via | Pattern |
|------|-----|-----|---------|
| migrate-users.ts | Stack Auth API | fetch POST /api/v1/users | `api.stack-auth.com.*users` |
| map-users.ts | Stack Auth API | fetch GET /api/v1/users | `api.stack-auth.com.*users` |
| user-mapping.ts | migration-data/user-mapping.json | file read/write | `user-mapping\.json` |

## Next Phase Readiness

- User migration scripts ready for production use
- Mapping file format established for data import scripts
- mapUserId function available for FK column remapping during import
- Password reset communication should be planned before production migration

---
*Phase: 06-data-migration-scripts*
*Completed: 2026-01-23*
