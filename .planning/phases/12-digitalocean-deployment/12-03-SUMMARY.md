---
phase: 12-digitalocean-deployment
plan: 03
type: summary
subsystem: deployment-infrastructure
tags: [digitalocean, managed-database, postgresql, pgbouncer, docker-compose, deployment-automation]
dependency-graph:
  requires:
    - 12-01 (doctl-helpers.sh for DigitalOcean CLI functions)
    - 12-02 (deploy-digitalocean.sh base deployment script)
    - 09-03 (compose.digitalocean.yaml overlay)
  provides:
    - Managed PostgreSQL provisioning functions (8 functions)
    - Docker Compose profiles for conditional service loading
    - Managed vs self-hosted database mode switching
  affects:
    - 12-04 (deployment documentation may reference managed DB setup)
    - Future database migration procedures
tech-stack:
  added:
    - DigitalOcean Managed PostgreSQL (PostgreSQL 15 with built-in PgBouncer)
  patterns:
    - Docker Compose profiles for multi-mode deployment
    - Connection pooler endpoint enforcement pattern
    - VPC private networking for managed services
key-files:
  created:
    - scripts/lib/managed-db-helpers.sh (232 lines, 8 functions)
  modified:
    - docker/compose.digitalocean.yaml (176 lines, +43 lines for profiles and secrets)
    - scripts/deploy-digitalocean.sh (461 lines, +63 lines for managed DB integration)
decisions:
  - id: DEPLOY-DB-01
    title: "Docker Compose profiles for database mode switching"
    rationale: "Allows same compose file to support both self-hosted and managed PostgreSQL without manual editing"
    alternatives:
      - "Separate compose files for each mode (harder to maintain)"
      - "Environment variable conditionals (not supported by Docker Compose)"
    impact: "Services can be conditionally started based on profile activation"
  - id: DEPLOY-DB-02
    title: "Always use pooler endpoint for managed PostgreSQL"
    rationale: "Direct connections bypass PgBouncer and exhaust connection limit (25 default)"
    alternatives:
      - "Allow direct connections (would hit connection limits quickly)"
      - "Increase connection limit (more expensive)"
    impact: "All managed DB connections go through DigitalOcean's built-in PgBouncer"
  - id: DEPLOY-DB-03
    title: "SSL mode=require enforced for managed database"
    rationale: "Managed databases are network-accessible, SSL required for security"
    alternatives:
      - "Allow insecure connections (security risk)"
      - "SSL mode=verify-full (requires additional CA cert configuration)"
    impact: "All connections encrypted, CA certificate downloaded during setup"
  - id: DEPLOY-DB-04
    title: "VPC private networking for managed database and Droplet"
    rationale: "Reduces latency (~1ms vs 5-10ms), no bandwidth charges, improved security"
    alternatives:
      - "Public internet connections (higher latency, bandwidth costs)"
    impact: "Database and Droplet must be in same VPC, deployment script handles VPC creation"
  - id: DEPLOY-DB-05
    title: "Graceful fallback to self-hosted mode on managed DB failure"
    rationale: "Deployment should not fail if managed DB setup has issues (API limits, billing)"
    alternatives:
      - "Hard fail on managed DB setup failure (blocks entire deployment)"
    impact: "Deployment continues with containerized PostgreSQL if managed DB setup fails"
metrics:
  duration: "297 seconds (~5 minutes)"
  completed: "2026-01-24"
---

# Phase 12 Plan 03: Managed PostgreSQL Integration Summary

**One-liner:** Enhanced DigitalOcean deployment with managed PostgreSQL provisioning via doctl, Docker Compose profiles for mode switching, and pooler endpoint enforcement

## What Was Built

### 1. Managed Database Helper Library (scripts/lib/managed-db-helpers.sh)

Created 8 functions for DigitalOcean Managed PostgreSQL lifecycle management:

**Provisioning:**
- `check_existing_database()` - Check if cluster already exists (idempotent)
- `create_managed_database()` - Provision PostgreSQL 15 with VPC, connection pool, SSL cert
- `create_connection_pool()` - Create transaction mode pool (25 connections default)
- `download_ssl_certificate()` - Download CA cert to secrets directory (chmod 600)

**Connection Management:**
- `get_connection_string()` - Build connection string with pooler endpoint
- `save_connection_string()` - Save to secrets file with obfuscated logging

**Database Management:**
- `configure_trusted_sources()` - Add Droplet to database firewall (private networking)
- `show_database_info()` - Display cluster details, pools, dashboard link

**Key features:**
- Pooler endpoint transformation: `host.db.ondigitalocean.com` → `host-pooler.db.ondigitalocean.com`
- SSL mode=require enforced in connection strings
- VPC UUID support for private networking
- Transaction mode connection pooling (web app optimized)

### 2. Docker Compose Profile System (docker/compose.digitalocean.yaml)

Enhanced overlay to support two deployment modes:

**Profiles added:**
- `self-hosted-db` - For postgres, pgbouncer, pgbouncer_exporter, postgres_backup
- `self-hosted-storage` - For minio, minio-setup, postgres_backup

**How it works:**
```bash
# Self-hosted mode (default):
docker compose --profile self-hosted-db --profile self-hosted-storage up -d

# Managed PostgreSQL mode (no DB profile):
export USE_MANAGED_DB=true
docker compose --profile self-hosted-storage up -d
```

**Secrets added:**
- `do_database_url` - Managed PostgreSQL pooler connection string
- `spaces_access_key` / `spaces_secret_key` - DigitalOcean Spaces credentials

**Documentation improvements:**
- Prominent pooler endpoint warning (prevents connection exhaustion)
- VPC private networking benefits explained
- Mode switching instructions
- Backend environment variable examples

### 3. Deployment Script Integration (scripts/deploy-digitalocean.sh)

Added managed database support to main deployment script:

**New functionality:**
- `setup_managed_database()` function - Orchestrates full managed DB setup
  - Creates VPC for private networking
  - Provisions database cluster with `create_managed_database()`
  - Configures database firewall for Droplet access
  - Saves pooler connection string to secrets
  - Displays cluster information
- `--setup-managed-db` flag - Standalone database setup (no Droplet provisioning)
- Conditional sourcing of `managed-db-helpers.sh` when `USE_MANAGED_DB=true`
- Graceful fallback to self-hosted mode if managed DB setup fails

**Integration points:**
- Called after Droplet cloud-init completes
- Before application deployment (database ready for migrations)
- Error handling with warning (not hard fail)

## Technical Implementation

### Pooler Endpoint Pattern

DigitalOcean Managed PostgreSQL provides two connection endpoints:

1. **Direct connection** - Limited to cluster's max_connections (25 for db-s-1vcpu-2gb)
2. **Pooler connection** - Uses built-in PgBouncer, supports 100s of connections

**Implementation:**
```bash
# get_connection_string() transforms hostname:
host="private-db-123.db.ondigitalocean.com"
host="${host//.db.ondigitalocean.com/-pooler.db.ondigitalocean.com}"
# Result: "private-db-123-pooler.db.ondigitalocean.com"
```

**Why this matters:** Web apps open many connections (HTTP requests × concurrent users). Without pooler, you hit the 25 connection limit instantly. With pooler, you can handle hundreds of concurrent requests.

### VPC Private Networking

Deployment script ensures Droplet and managed database are in the same VPC:

```bash
# In setup_managed_database():
vpc_uuid=$(ensure_vpc "freshtrack-vpc" "$DO_REGION")
create_managed_database "freshtrack-db" "$DO_REGION" "$DO_DB_SIZE" "$vpc_uuid"
configure_trusted_sources "$DB_CLUSTER_ID" "$DROPLET_ID"
```

**Benefits:**
- ~1ms latency (vs 5-10ms over public internet)
- No bandwidth charges for database traffic
- Database not exposed to public internet (security)
- Automatic firewall configuration via trusted sources

### Profile Dependency Resolution

Fixed Docker Compose validation errors by placing dependent services in correct profiles:

```yaml
# postgres_backup depends on both postgres AND minio:
postgres_backup:
  profiles:
    - self-hosted-db      # For postgres dependency
    - self-hosted-storage # For minio dependency

# pgbouncer_exporter depends on pgbouncer:
pgbouncer_exporter:
  profiles:
    - self-hosted-db

# minio-setup depends on minio:
minio-setup:
  profiles:
    - self-hosted-storage
```

**Rule:** If service A depends on service B, and B is in a profile, then A must also be in that profile (or both must have no profile).

## Testing & Verification

All verification steps passed:

1. **Helper library syntax:** ✓ Bash validates clean
2. **Compose file validation:** ✓ No errors (warnings expected for unset env vars)
3. **Function availability:** ✓ 8 functions defined
4. **USE_MANAGED_DB integration:** ✓ 10 references in deploy script
5. **Pooler enforcement:** ✓ 5 references in helper library
6. **SSL enforcement:** ✓ `sslmode=require` default in `get_connection_string()`
7. **VPC support:** ✓ `--private-network-uuid` flag usage

## Usage Examples

### Standalone Managed Database Setup

```bash
# Provision just the managed database (no Droplet):
./scripts/deploy-digitalocean.sh --setup-managed-db --config deploy.config
```

**Output:**
- Creates `freshtrack-db` cluster (PostgreSQL 15, db-s-1vcpu-2gb)
- Creates `app-pool` connection pool (transaction mode, 25 connections)
- Downloads CA certificate to `/opt/freshtrack-pro/secrets/ca-certificate.crt`
- Saves pooler connection string to `/opt/freshtrack-pro/secrets/database_url`
- Displays cluster ID, status, dashboard link

### Full Deployment with Managed Database

```bash
# Set in deploy.config:
USE_MANAGED_DB=true
DO_DB_SIZE=db-s-2vcpu-4gb  # Optional, defaults to db-s-1vcpu-2gb

# Deploy:
./scripts/deploy-digitalocean.sh --config deploy.config
```

**What happens:**
1. Provisions Droplet (as before)
2. Waits for cloud-init (Docker installation)
3. **NEW:** Calls `setup_managed_database()`
   - Creates VPC if not exists
   - Provisions managed PostgreSQL cluster
   - Configures database firewall for Droplet
   - Saves connection string
4. Copies config and secrets to Droplet
5. Runs `deploy-selfhosted.sh` on Droplet (uses managed DB URL)

### Self-Hosted Mode (Default)

```bash
# Don't set USE_MANAGED_DB, or set to false:
USE_MANAGED_DB=false

# Deploy:
./scripts/deploy-digitalocean.sh --config deploy.config
```

**What happens:**
- Skips managed database setup
- Docker Compose starts postgres, pgbouncer, pgbouncer_exporter, postgres_backup
- Uses containerized PostgreSQL (same as Phase 11 self-hosted)

## Files Modified

### Created
- `scripts/lib/managed-db-helpers.sh` (232 lines)
  - 8 managed database lifecycle functions
  - Pooler endpoint transformation logic
  - SSL certificate download
  - Database firewall configuration

### Modified
- `docker/compose.digitalocean.yaml` (+43 lines)
  - Docker Compose profiles for postgres, pgbouncer, minio services
  - Profile assignments for dependent services (pgbouncer_exporter, minio-setup, postgres_backup)
  - `do_database_url` secret definition
  - Managed PostgreSQL mode documentation

- `scripts/deploy-digitalocean.sh` (+63 lines)
  - `setup_managed_database()` function (42 lines)
  - `--setup-managed-db` flag handler
  - Conditional sourcing of managed-db-helpers.sh
  - Integration call after cloud-init wait

## Success Criteria Met

- ✓ scripts/lib/managed-db-helpers.sh has 8 functions for managed database provisioning
- ✓ compose.digitalocean.yaml includes do_database_url secret and managed DB documentation
- ✓ deploy-digitalocean.sh conditionally loads managed-db-helpers.sh when USE_MANAGED_DB=true
- ✓ Connection string uses pooler endpoint (hostname transformation in `get_connection_string()`)
- ✓ SSL mode is enforced (sslmode=require default parameter)
- ✓ VPC private networking is used when available (--private-network-uuid flag)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Docker Compose profile dependency validation errors**
- **Found during:** Task 2 verification
- **Issue:** Services with dependencies on profiled services caused validation errors
  - `minio-setup` depends on `minio` (profiled as self-hosted-storage)
  - `pgbouncer_exporter` depends on `pgbouncer` (profiled as self-hosted-db)
  - `postgres_backup` depends on both `postgres` and `minio` (both profiled)
- **Fix:** Added dependent services to same profiles as their dependencies
- **Files modified:** docker/compose.digitalocean.yaml
- **Commit:** ae70a7e

**Why this is a bug:** Docker Compose requires dependent services to be in the same profile as their dependencies. Without this, `docker compose config` fails with "depends on undefined service" errors.

## Next Phase Readiness

### Blockers
None.

### Concerns
1. **Managed database costs** - $15/month for smallest cluster (db-s-1vcpu-2gb) vs $0 for self-hosted
2. **Connection pool exhaustion** - If app uses pooler incorrectly, could still hit limits
3. **Database migration timing** - Need to run migrations before starting backend (handled by deploy-selfhosted.sh)

### Recommendations for Next Plans
1. **Documentation (12-04?)** - Add managed PostgreSQL setup instructions, cost comparison
2. **Cost optimization** - Document when to use managed vs self-hosted based on scale
3. **Monitoring** - Add alerts for managed database connection pool usage (DigitalOcean provides metrics)

## Related Files
- `docker/compose.digitalocean.yaml` - Deployment overlay with profile system
- `scripts/deploy-digitalocean.sh` - Main deployment orchestrator
- `scripts/lib/doctl-helpers.sh` - DigitalOcean CLI helper functions (from 12-01)
- `scripts/deploy-selfhosted.sh` - Application deployment (from Phase 11)
- `docker/compose.prod.yaml` - Production overlay (from Phase 9)

## Commits

```
ae70a7e fix(12-03): add dependent services to Docker Compose profiles
c993d04 feat(12-03): integrate managed database into deploy-digitalocean.sh
ec6d07b feat(12-03): enhance compose.digitalocean.yaml for managed PostgreSQL
6afe9d8 feat(12-03): add managed database helper functions
```

**Total:** 4 commits, 378 lines added, 37 lines removed, 3 files modified, 1 file created

---

*Completed in 297 seconds (~5 minutes) on 2026-01-24*
