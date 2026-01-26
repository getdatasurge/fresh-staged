# Phase 25: Deployment Orchestration - Research

**Researched:** 2026-01-25
**Domain:** Shell script orchestration, Docker Compose deployment, service health management
**Confidence:** HIGH

## Summary

Phase 25 builds a deployment orchestration script that coordinates the existing deployment infrastructure without duplicating code. The existing codebase provides a comprehensive foundation: `deploy.sh` handles Docker Compose deployment with health checks, `preflight-lib.sh` provides checkpoint/resume infrastructure, and `config-lib.sh` generates all required configuration files.

The key challenge is **orchestration, not implementation**. All deployment logic already exists in `deploy.sh` (231 lines). All checkpoint/state management exists in `preflight-lib.sh` (974 lines). All configuration exists in `config-lib.sh` (1158 lines). Phase 25 must CALL these components, not rebuild them.

**Primary recommendation:** Create a thin orchestrator script `scripts/deploy-automated.sh` that sources the lib files, runs the configuration wizard, then delegates to `deploy.sh` while wrapping each major step with checkpoint tracking via `run_step()`.

## Existing Infrastructure Analysis

### Current Deployment Flow (deploy.sh)

The existing `deploy.sh` provides a complete 8-step deployment:

| Step | Function | What It Does |
|------|----------|--------------|
| 1 | Pre-flight checks | Calls `health-check.sh` for system validation |
| 2 | Pull images | `docker compose pull` for latest images |
| 3 | Build backend | `docker compose build backend` |
| 4 | Run migrations | Start DB, wait for ready, run `pnpm db:migrate:prod` |
| 5 | Deploy services | `docker compose up -d` all services |
| 6 | Wait for health | Loop until `curl localhost:3000/health` returns 200 |
| 7 | Verify deployment | Check `/health` and `/health/ready` endpoints |
| 8 | Cleanup | `docker image prune -f` |

**Key observation:** deploy.sh already handles:
- Database service startup sequencing
- PostgreSQL readiness waiting (30 retries)
- Backend health check waiting (30 retries)
- Proper Docker Compose file layering

### Library Functions Available

From `preflight-lib.sh` (Phase 22):

| Function | Purpose | DEPLOY-0X |
|----------|---------|-----------|
| `run_step()` | Run function with checkpoint tracking | DEPLOY-02, DEPLOY-03 |
| `checkpoint_done()` | Check if step completed | DEPLOY-03 |
| `checkpoint_set()` | Mark step complete | DEPLOY-02 |
| `checkpoint_clear()` | Reset a checkpoint | - |
| `checkpoint_clear_all()` | Full reset | - |
| `save_error_state()` | Persist failure info | DEPLOY-03 |
| `load_error_state()` | Load previous failure | DEPLOY-03 |
| `error_handler` | ERR trap with diagnostics | - |
| `validate_*` | Pre-flight checks | - |

From `config-lib.sh` (Phase 24):

| Function | Purpose |
|----------|---------|
| `collect_configuration()` | Interactive prompts |
| `create_configuration()` | Generate secrets + .env |
| `display_configuration_summary()` | User confirmation |
| `validate_dns_before_deploy()` | DNS resolution check |
| `run_interactive_configuration()` | Full wizard flow |

From `prereq-lib.sh` (Phase 23):

| Function | Purpose |
|----------|---------|
| `install_docker()` | Docker Engine installation |
| `configure_firewall()` | UFW setup |
| `install_fail2ban()` | SSH protection |
| `install_all_prerequisites()` | Master installer |

### Docker Compose Configuration

The production stack uses layered compose files:

```bash
docker compose -f docker-compose.yml -f compose.production.yaml up -d
```

**Services defined:**
- postgres (with health check)
- redis (with health check)
- minio (with health check)
- backend (depends on postgres, redis)
- frontend (static nginx)
- worker (background jobs)
- caddy (reverse proxy, depends on backend)
- prometheus, loki, promtail, grafana (monitoring)
- blackbox, node-exporter (metrics)
- uptime-kuma (status page)

**Health checks already defined in compose.production.yaml:**
- Backend: `curl -f http://localhost:3000/health`
- Frontend: `curl -f http://localhost:8080/health`
- Postgres: `pg_isready -U frostguard`
- Redis: `redis-cli ping`
- Caddy: `wget -qO- http://localhost:2019/metrics`

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `preflight-lib.sh` | v1.0.0 | Checkpoint/error infrastructure | Already implements DEPLOY-02, DEPLOY-03 |
| `config-lib.sh` | v1.1.0 | Configuration wizard | Already implements CONFIG-* |
| `deploy.sh` | Existing | Docker Compose deployment | Already implements DEPLOY-04, DEPLOY-05 |
| Bash 4+ | System | Script execution | Target Ubuntu 20.04+ ships Bash 4+ |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `jq` | JSON parsing | Health check response validation |
| `curl` | HTTP requests | Service health endpoints |
| `docker compose` | Container orchestration | All service management |

### Not Needed (Already Exists)

| Feature | Where It Exists | Why Don't Rebuild |
|---------|-----------------|-------------------|
| Pre-flight checks | `health-check.sh`, `preflight-lib.sh` | PREFLIGHT-* already complete |
| Docker installation | `prereq-lib.sh` | PREREQ-* already complete |
| Configuration prompts | `config-lib.sh` | CONFIG-* already complete |
| Health checks | `deploy.sh` lines 154-170 | Already waits for backend health |
| Docker Compose layering | `deploy.sh` line 83-94 | Already uses correct file order |

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── deploy-automated.sh      # NEW: Orchestrator (thin wrapper)
├── deploy.sh                # EXISTING: Docker deployment logic
├── health-check.sh          # EXISTING: Pre-flight validation
├── rollback.sh              # EXISTING: Rollback logic
└── lib/
    ├── preflight-lib.sh     # EXISTING: Checkpoint/error handling
    ├── prereq-lib.sh        # EXISTING: Prerequisites installation
    ├── config-lib.sh        # EXISTING: Configuration wizard
    └── .deploy-state/       # EXISTING: Checkpoint storage
        └── .checkpoint-*    # Step completion markers
```

### Pattern 1: Thin Orchestrator Pattern

**What:** Main script that sources libraries and delegates work
**When to use:** When all implementation already exists
**Example:**
```bash
#!/usr/bin/env bash
# deploy-automated.sh - Unified deployment orchestrator

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source libraries (provides checkpoint, config, prereq functions)
source "${SCRIPT_DIR}/lib/preflight-lib.sh"
source "${SCRIPT_DIR}/lib/prereq-lib.sh"
source "${SCRIPT_DIR}/lib/config-lib.sh"

# Orchestration steps - each wraps existing functionality
run_step "prerequisites" install_all_prerequisites
run_step "configuration" run_interactive_configuration
run_step "deployment" run_deployment

run_deployment() {
    # Call existing deploy.sh, don't duplicate its logic
    "${SCRIPT_DIR}/deploy.sh"
}
```

### Pattern 2: Wrap External Script as Step

**What:** Execute existing script within checkpoint framework
**When to use:** Integrating existing scripts (DEPLOY-01)
**Example:**
```bash
# Source: Adapted from preflight-lib.sh run_step pattern
run_external_script() {
    local script_name="$1"
    local script_path="$2"
    shift 2
    local args=("$@")

    if checkpoint_done "$script_name"; then
        echo "[SKIP] $script_name (already completed)"
        return 0
    fi

    step "[RUN] $script_name"

    # Execute external script
    if "$script_path" "${args[@]}"; then
        checkpoint_set "$script_name"
        success "$script_name completed"
        return 0
    else
        error "$script_name failed"
        return 1
    fi
}

# Usage
run_external_script "deploy" "${SCRIPT_DIR}/deploy.sh"
```

### Pattern 3: Service Health Aggregation

**What:** Wait for ALL services to be healthy, not just backend
**When to use:** DEPLOY-05 requires waiting for all services
**Example:**
```bash
# Source: Adapted from deploy.sh health check pattern
wait_for_all_services_healthy() {
    local max_attempts="${1:-60}"
    local interval="${2:-5}"

    local services=(
        "backend:http://localhost:3000/health"
        "frontend:http://localhost:5173/health"
        "caddy:http://localhost:2019/metrics"
    )

    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        local all_healthy=true

        for service_spec in "${services[@]}"; do
            local name="${service_spec%%:*}"
            local url="${service_spec#*:}"

            if ! curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
                all_healthy=false
                echo "Waiting for $name..."
                break
            fi
        done

        if [[ "$all_healthy" == "true" ]]; then
            success "All services healthy"
            return 0
        fi

        echo "Attempt $attempt/$max_attempts - retrying in ${interval}s..."
        sleep "$interval"
        attempt=$((attempt + 1))
    done

    error "Services did not become healthy within timeout"
    return 1
}
```

### Pattern 4: Checkpoint State Directory

**What:** Consistent state storage location
**When to use:** All checkpoint operations
**Example:**
```bash
# From preflight-lib.sh - already implemented
STATE_DIR="${STATE_DIR:-/var/lib/freshtrack-deploy}"

# Fallback for non-root execution
ensure_state_dir() {
    if [[ ! -d "$STATE_DIR" ]]; then
        mkdir -p "$STATE_DIR" 2>/dev/null || {
            STATE_DIR="${SCRIPT_DIR:-.}/lib/.deploy-state"
            mkdir -p "$STATE_DIR"
        }
    fi
}
```

### Anti-Patterns to Avoid

- **Duplicating deploy.sh logic:** Call it, don't copy it
- **Re-implementing health checks:** deploy.sh already has them
- **Rebuilding checkpoint system:** preflight-lib.sh has run_step()
- **Skipping existing health-check.sh:** deploy.sh calls it via Step 1
- **Custom Docker Compose commands:** Use same file layering as deploy.sh

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checkpoint tracking | Custom file system | `run_step()` from preflight-lib.sh | Already implements DEPLOY-02, DEPLOY-03 |
| Configuration collection | New prompts | `run_interactive_configuration()` | Already implements CONFIG-* |
| Prerequisites | New installers | `install_all_prerequisites()` | Already implements PREREQ-* |
| Docker deployment | Copy deploy.sh | Call deploy.sh directly | Prevents code duplication (DEPLOY-01) |
| Pre-flight checks | New validators | health-check.sh + preflight-lib.sh | Already complete |
| Error handling | Custom traps | Source preflight-lib.sh | Has error_handler trap |

**Key insight:** Phase 25 success = calling existing code, not writing new code. Every requirement can be satisfied by orchestrating existing functions.

## Common Pitfalls

### Pitfall 1: Duplicating deploy.sh Logic

**What goes wrong:** New script copies health check loops, compose commands
**Why it happens:** Desire to have "one script" leads to consolidation
**How to avoid:** DEPLOY-01 explicitly requires "no code duplication" - call deploy.sh
**Warning signs:** If writing `docker compose up`, you're duplicating

### Pitfall 2: Not Sourcing preflight-lib.sh First

**What goes wrong:** Missing error handler, checkpoint functions undefined
**Why it happens:** Forgetting library dependency order
**How to avoid:** Source preflight-lib.sh FIRST (others depend on it)
**Warning signs:** "run_step: command not found" errors

### Pitfall 3: Checkpoint Name Collisions

**What goes wrong:** Checkpoint from Phase 22 tests blocks Phase 25
**Why it happens:** STATE_DIR has stale checkpoints from prior runs
**How to avoid:** Use descriptive checkpoint names: `deploy-prerequisites`, `deploy-config`, `deploy-services`
**Warning signs:** Steps skipped unexpectedly

### Pitfall 4: Health Check Timeout Too Short

**What goes wrong:** Script fails but services eventually become healthy
**Why it happens:** 30 retries x 3 seconds = 90 seconds may not be enough
**How to avoid:** deploy.sh uses 30 retries - for full stack, consider 60 retries
**Warning signs:** Timeout failures followed by manual verification success

### Pitfall 5: Forgetting DNS Validation

**What goes wrong:** Caddy fails to get SSL certificate
**Why it happens:** Skipping DNS check, Let's Encrypt rate limits hit
**How to avoid:** Call `validate_dns_before_deploy()` from config-lib.sh
**Warning signs:** Caddy container in restart loop, ACME errors in logs

### Pitfall 6: Wrong Compose File Order

**What goes wrong:** Development settings override production
**Why it happens:** Compose files ordered incorrectly
**How to avoid:** Always use: `docker-compose.yml` then `compose.production.yaml`
**Warning signs:** Ports exposed externally, dev passwords used

## Integration Strategy

### DEPLOY-01: No Code Duplication

**Strategy:** Call existing `deploy.sh` directly as a subprocess

```bash
run_deployment() {
    step "Executing deployment..."

    # Change to project root (deploy.sh expects this)
    cd /opt/freshtrack-pro

    # Call existing script with appropriate flags
    ./scripts/deploy.sh
}

run_step "deployment" run_deployment
```

### DEPLOY-02: Checkpoint Markers

**Strategy:** Use `run_step()` from preflight-lib.sh

The function already:
1. Checks if checkpoint exists
2. Runs the step function
3. Creates checkpoint on success
4. Stores timestamp in checkpoint file

```bash
# Checkpoint markers created automatically by run_step()
# Located in: ${STATE_DIR}/.checkpoint-{step-name}
```

### DEPLOY-03: Resume from Failure

**Strategy:** Leverage existing checkpoint infrastructure

```bash
# preflight-lib.sh already provides:
# - checkpoint_done() - Check if step was completed
# - run_step() - Skip if checkpoint exists
# - save_error_state() - Persist failure info
# - load_error_state() - Read previous failure

# On script re-run, completed steps are automatically skipped
```

### DEPLOY-04: Docker Compose with Production Overlay

**Strategy:** deploy.sh already does this correctly

```bash
# From deploy.sh lines 83, 94, 110, etc.
docker compose -f docker-compose.yml -f compose.production.yaml [command]
```

### DEPLOY-05: Wait for All Services Healthy

**Strategy:** Enhance existing health check in deploy.sh

deploy.sh waits for backend (30 retries). For full stack:

```bash
# After deploy.sh completes, verify all critical services
verify_all_services_healthy() {
    local checks=(
        "backend|http://localhost:3000/health"
        "postgres|docker compose exec -T postgres pg_isready -U frostguard"
        "redis|docker compose exec -T redis redis-cli ping"
    )

    for check in "${checks[@]}"; do
        local name="${check%%|*}"
        local cmd="${check#*|}"

        if ! eval "$cmd" >/dev/null 2>&1; then
            error "$name is not healthy"
            return 1
        fi
        success "$name is healthy"
    done
}
```

## Code Examples

### Complete Orchestrator Script Structure

```bash
#!/usr/bin/env bash
# deploy-automated.sh - Unified FreshTrack deployment orchestrator
# Usage: ./scripts/deploy-automated.sh [--reset] [--skip-prereqs]

set -o errexit
set -o errtrace
set -o nounset
set -o pipefail

# ===========================================
# Script Configuration
# ===========================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source libraries
source "${SCRIPT_DIR}/lib/preflight-lib.sh"
source "${SCRIPT_DIR}/lib/prereq-lib.sh"
source "${SCRIPT_DIR}/lib/config-lib.sh"

# ===========================================
# Command Line Arguments
# ===========================================
SKIP_PREREQS=false
RESET_CHECKPOINTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --reset)
            RESET_CHECKPOINTS=true
            shift
            ;;
        --skip-prereqs)
            SKIP_PREREQS=true
            shift
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ===========================================
# Deployment Functions (wrap existing scripts)
# ===========================================
do_prerequisites() {
    if [[ "$SKIP_PREREQS" == "true" ]]; then
        warning "Skipping prerequisites (--skip-prereqs)"
        return 0
    fi
    install_all_prerequisites
}

do_configuration() {
    run_interactive_configuration
}

do_deployment() {
    cd "$PROJECT_ROOT"
    "${SCRIPT_DIR}/deploy.sh"
}

do_verify_all_healthy() {
    wait_for_all_services_healthy 60 5
}

# ===========================================
# Main Orchestration
# ===========================================
main() {
    echo "========================================"
    echo "FreshTrack Pro Automated Deployment"
    echo "========================================"
    echo ""
    echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Reset checkpoints if requested
    if [[ "$RESET_CHECKPOINTS" == "true" ]]; then
        checkpoint_clear_all
    fi

    # Run orchestrated deployment
    run_step "prerequisites" do_prerequisites
    run_step "configuration" do_configuration
    run_step "deployment" do_deployment
    run_step "verify-healthy" do_verify_all_healthy

    echo ""
    echo "========================================"
    success "Deployment Complete!"
    echo "========================================"
}

main
```

### Resume Detection Example

```bash
# On script start, check for previous failure
show_resume_status() {
    if load_error_state 2>/dev/null; then
        warning "Previous deployment failed"
        echo "  Script: $script"
        echo "  Line: $line"
        echo "  Exit code: $exit_code"
        echo "  Category: $category"
        echo ""
        echo "Resuming from last successful checkpoint..."
        echo ""
    fi
}
```

## Open Questions

Things that couldn't be fully resolved:

1. **deploy.sh modification vs wrapper**
   - What we know: DEPLOY-01 says "no code duplication"
   - What's unclear: Can we modify deploy.sh to use run_step(), or must we wrap it?
   - Recommendation: Wrap deploy.sh as a single step; it's already well-tested

2. **Stack Auth manual configuration**
   - What we know: Stack Auth requires manual project creation at app.stack-auth.com
   - What's unclear: Can this step be checkpointed, or is it always manual?
   - Recommendation: Checkpoint after `collect_configuration()` completes (user provided Stack Auth keys)

3. **Parallel vs sequential health checks**
   - What we know: docker compose has built-in health check support
   - What's unclear: Should we poll services sequentially or trust depends_on?
   - Recommendation: Trust compose depends_on, add verification step after deploy.sh completes

## Sources

### Primary (HIGH confidence)

- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/deploy.sh` - Existing deployment logic
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/lib/preflight-lib.sh` - Checkpoint/error infrastructure
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/lib/config-lib.sh` - Configuration wizard
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/lib/prereq-lib.sh` - Prerequisites installation
- `/home/skynet/freshtrack-pro-local/fresh-staged/compose.production.yaml` - Production Docker configuration

### Secondary (MEDIUM confidence)

- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/health-check.sh` - Pre-flight validation
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/rollback.sh` - Rollback patterns
- `/home/skynet/freshtrack-pro-local/fresh-staged/.planning/phases/22-foundation-pre-flight/22-RESEARCH.md` - Checkpoint patterns

### Tertiary (LOW confidence)

- Phase 22 implementation provides tested checkpoint patterns

## Metadata

**Confidence breakdown:**
- Existing infrastructure: HIGH - All code reviewed in detail
- Integration strategy: HIGH - Clear path using existing functions
- Health check timing: MEDIUM - May need tuning during implementation

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - stable domain, existing code won't change)
