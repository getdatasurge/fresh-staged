# Phase 06: Production Data Migration & Go-Live Preparation

FrostGuard has comprehensive data migration scripts (Phase 6/v1.0), E2E validation procedures (Phase 13/v1.1), deployment automation (v2.1), and production infrastructure — but the actual production data migration from Supabase has never been executed. This phase prepares the final cutover: validates migration scripts against a staging environment, rehearses the cutover procedure end-to-end, verifies all critical user flows work against the migrated data, and produces a go-live readiness checklist. By the end, the team has a tested, timed, and documented procedure to execute the production cutover with confidence.

## Tasks

- [ ] Validate data migration scripts work against a fresh database:
  - Read `backend/scripts/migration/` (or wherever the export/import scripts live) to understand the migration tooling
  - Read `docs/DATABASE_MIGRATION_PLAN.md` for the planned migration procedure
  - Start a fresh PostgreSQL instance (use docker or a separate database)
  - Run `npx drizzle-kit push` to create the schema in the fresh database
  - If export scripts exist (`export.ts`), run them against the local dev database to produce JSON exports
  - Run the import scripts (`import.ts`) to load the exported data into the fresh database
  - Run the verification scripts (`verify.ts`) to compare row counts and checksums
  - Document timing for each step (export duration, import duration, verification duration)
  - If any scripts fail, fix them and re-run
  - If Supabase access is not available, use the synthetic data generator (`scripts/test/generate-test-data.ts`) to create realistic test data

- [ ] Run the E2E validation suite against the migrated database:
  - Follow the `docs/E2E_VALIDATION_CHECKLIST.md` procedures
  - Execute TEST-01: Sensor data ingestion pipeline
    - Run `scripts/test/e2e-sensor-pipeline.sh` against the backend connected to the migrated database
    - Verify readings flow from ingestion → storage → alert evaluation
  - Execute TEST-02: Alert notification pipeline
    - Run `scripts/test/e2e-alert-notifications.sh`
    - Verify alert lifecycle: trigger → acknowledge → resolve
  - Execute TEST-03: Migration timing validation
    - Run `scripts/test/validate-migration-timing.sh`
    - Record timing results for production estimation
  - Document all test results with pass/fail status

- [ ] Rehearse the full cutover procedure from the CUTOVER_CHECKLIST:
  - Read `docs/CUTOVER_CHECKLIST.md` for the complete procedure
  - Simulate each step of the cutover in a local/staging environment:
    - Pre-cutover preparation (DNS TTL lowering — simulate with notes)
    - Database export from source
    - Database import to target
    - Verification queries
    - Backend restart with new database connection
    - Frontend verification
    - Health check confirmation
  - Time the full rehearsal end-to-end
  - Document any steps that were unclear, failed, or took longer than expected
  - Update the CUTOVER_CHECKLIST.md with corrections if needed

- [ ] Verify production deployment scripts work correctly:
  - Read `scripts/deploy-automated.sh` and understand the deployment flow
  - Read `scripts/verify-deployment.sh` for post-deployment checks
  - Test the deployment script in a local Docker environment:
    - Run `docker compose -f docker-compose.yml -f docker/compose.production.yaml up -d` (or the equivalent production compose)
    - Verify all production services start (backend, PostgreSQL, Redis, MinIO, Caddy, monitoring)
    - Run the verification script to confirm health checks pass
  - If any services fail in production mode, diagnose and fix the configuration
  - Verify the rollback procedure: stop services, restore from backup, restart

- [ ] Produce the go-live readiness report:
  - Create `docs/reports/go-live-readiness.md` with YAML front matter:
    - type: report, title: Go-Live Readiness Assessment, tags: [go-live, production, migration, readiness]
    - related: ["[[System-Health-Baseline]]", "[[Test-Coverage-Phase02]]", "[[Edge-Function-Deprecation-Inventory]]", "[[Real-Time-Pipeline-Verification]]", "[[Frontend-Quality-Report]]"]
  - Document:
    - Migration timing summary (export: Xs, import: Xs, verification: Xs, total: Xs)
    - E2E test results (TEST-01 through TEST-04: pass/fail)
    - Cutover rehearsal results (all steps completed, issues found)
    - Production deployment verification (services healthy, health checks passing)
    - Remaining blockers (if any — e.g., Supabase access, DNS configuration)
    - Recommended maintenance window (based on migration timing + safety margin)
    - Risk assessment: what could go wrong and mitigation for each
    - Rollback procedure summary (estimated rollback time, data loss window)
  - This report is the decision document for scheduling the production cutover
