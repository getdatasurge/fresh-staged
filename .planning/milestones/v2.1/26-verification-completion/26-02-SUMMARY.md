# Plan 26-02: Validation Suite & Resume Testing Verification

## Tasks

### 1. Create E2E Smoke Test
- [x] `scripts/test-e2e-live.sh` created
- [x] Verifies API health
- [x] Checks database connectivity via psql
- [x] Verifies checkpoint library existence (resume capability)

### 2. Implement Seed Data Script
- [x] `scripts/seed/demo-data.sql` created with complete object graph (Org -> Site -> Area -> Unit -> Sensor)
- [x] `scripts/seed-demo-data.sh` created
- [x] Uses `docker compose exec` to apply SQL

## Verdict
Pass.
