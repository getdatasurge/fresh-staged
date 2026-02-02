# Architecture Research: Automated Deployment Scripts

**Domain:** Production Deployment Automation (One-Script Deployment)
**Researched:** 2026-01-25
**Confidence:** HIGH (based on existing v1.1 codebase analysis + industry best practices)

---

## Executive Summary

This research focuses on how to structure automated deployment scripts for v2.1's one-click deployment goal. The existing v1.1 codebase already has solid patterns (modular library scripts, Docker Compose overlays, health checks). The v2.1 enhancement wraps these in a single entry point with intelligent configuration, verification, and error recovery.

**Key Recommendation:** Modular phase architecture with checkpoint-based state management, integrating existing scripts rather than duplicating them.

---

## Standard Architecture

### System Overview

```
+------------------------------------------------------------------+
|                    DEPLOYMENT SCRIPT ENTRY                        |
|                       deploy-one-click.sh                         |
+----------------------------------+-------------------------------+
                                   |
+----------------------------------v-------------------------------+
|                         ORCHESTRATION LAYER                       |
|  +-----------+  +------------+  +-------------+  +-----------+   |
|  | Pre-Check |  | Configure  |  |   Deploy    |  |  Verify   |   |
|  |   Phase   |  |   Phase    |  |   Phase     |  |   Phase   |   |
|  +-----+-----+  +-----+------+  +------+------+  +-----+-----+   |
|        |              |                |               |          |
+--------|--------------|---------+------|---------------|----------+
         |              |         |      |               |
+--------v--------------v---------v------v---------------v----------+
|                         FUNCTION LIBRARY LAYER                     |
|  +---------------+  +---------------+  +------------------+        |
|  | lib/system.sh |  | lib/docker.sh |  | lib/validation.sh|       |
|  +---------------+  +---------------+  +------------------+        |
|  +---------------+  +---------------+  +------------------+        |
|  | lib/config.sh |  | lib/health.sh |  | lib/rollback.sh  |       |
|  +---------------+  +---------------+  +------------------+        |
+--------------------------------------------------------------------+
                                   |
+----------------------------------v-------------------------------+
|                      INTEGRATION LAYER                            |
|  +---------------------+  +-------------------+  +-------------+  |
|  | Docker Compose      |  | Existing Scripts  |  | Monitoring  |  |
|  | (base + overlays)   |  | (deploy.sh, etc)  |  | (Grafana)   |  |
|  +---------------------+  +-------------------+  +-------------+  |
+------------------------------------------------------------------+
                                   |
+----------------------------------v-------------------------------+
|                       EXTERNAL SYSTEMS                            |
|  +----------+  +------------+  +-------------+  +-------------+  |
|  | Let's    |  | Stack Auth |  | DNS/Domain  |  | Webhooks    |  |
|  | Encrypt  |  | (hosted)   |  | Provider    |  | (Slack/etc) |  |
|  +----------+  +------------+  +-------------+  +-------------+  |
+------------------------------------------------------------------+
```

### Component Responsibilities

| Component          | Responsibility                                          | Typical Implementation                                 |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| Entry Script       | Single entry point, argument parsing, main flow control | `deploy-one-click.sh` with minimal logic, calls phases |
| Phase Modules      | Self-contained deployment phases with clear boundaries  | Sourced libraries or separate scripts per phase        |
| Function Libraries | Reusable functions shared across phases                 | `scripts/lib/*.sh` sourced by phase modules            |
| State Manager      | Track deployment progress, enable resume                | `.deployment-state` file with checkpoint markers       |
| Integration Shim   | Bridge to existing v1.1 scripts                         | Thin wrappers calling `deploy.sh`, `rollback.sh`       |

---

## Recommended Project Structure

```
scripts/
├── deploy-one-click.sh           # Main entry point (single script users run)
├── lib/                          # Function libraries (reusable)
│   ├── common.sh                 # Colors, logging, output helpers
│   ├── system.sh                 # OS detection, package installation
│   ├── docker.sh                 # Docker/Compose installation, health
│   ├── config.sh                 # Configuration prompting, validation
│   ├── secrets.sh                # Secret generation, file creation
│   ├── dns.sh                    # DNS resolution checking
│   ├── health.sh                 # Health check functions
│   ├── verification.sh           # E2E and browser verification
│   ├── rollback.sh               # Rollback and recovery functions
│   ├── doctl-helpers.sh          # Existing DigitalOcean helpers
│   ├── managed-db-helpers.sh     # Existing managed DB helpers
│   └── notify.sh                 # Existing webhook notifications
├── phases/                       # Phase-specific modules (NEW)
│   ├── 01-preflight.sh           # System requirements, prerequisites
│   ├── 02-install.sh             # Docker, firewall, fail2ban
│   ├── 03-configure.sh           # Interactive prompting, config generation
│   ├── 04-deploy.sh              # Docker Compose orchestration
│   └── 05-verify.sh              # Health checks, E2E, monitoring setup
├── deploy.sh                     # Existing (preserved for CI/CD)
├── rollback.sh                   # Existing (enhanced with integration)
├── health-check.sh               # Existing (enhanced)
├── deploy-selfhosted.sh          # Existing (refactored to use libraries)
├── deploy-digitalocean.sh        # Existing (refactored to use libraries)
└── test/                         # Existing E2E tests
    ├── e2e-sensor-pipeline.sh
    └── e2e-alert-notifications.sh
```

### Structure Rationale

- **`deploy-one-click.sh`:** Single entry point users actually run. Imports phases in order. Under 100 lines. All complexity delegated.
- **`lib/`:** Reusable function libraries. Each focused on one domain. Sourced with `. "$SCRIPT_DIR/lib/common.sh"`. Can be tested in isolation.
- **`phases/`:** Self-contained deployment phases. Each phase is idempotent. Can be re-run independently. Clear dependencies between phases.
- **Preserve existing scripts:** `deploy.sh`, `rollback.sh` remain for CI/CD integration. One-click script calls these where appropriate.

---

## Architectural Patterns

### Pattern 1: Modular Phase Architecture

**What:** Break deployment into discrete phases with clear entry/exit contracts
**When to use:** Complex deployments with multiple distinct stages
**Trade-offs:**

- Pro: Phases can be tested independently, resumed after failure
- Con: More files to manage, complexity in inter-phase communication

**Example:**

```bash
#!/bin/bash
# deploy-one-click.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source libraries
. "$SCRIPT_DIR/lib/common.sh"
. "$SCRIPT_DIR/lib/state.sh"

# Phase execution with checkpoints
run_phase() {
    local phase_name="$1"
    local phase_script="$2"

    if checkpoint_exists "$phase_name"; then
        log_info "Phase $phase_name already completed, skipping..."
        return 0
    fi

    log_step "Executing phase: $phase_name"

    if . "$SCRIPT_DIR/phases/$phase_script"; then
        set_checkpoint "$phase_name"
        log_success "Phase $phase_name completed"
    else
        log_error "Phase $phase_name failed"
        return 1
    fi
}

# Main execution
main() {
    run_phase "preflight" "01-preflight.sh"
    run_phase "install" "02-install.sh"
    run_phase "configure" "03-configure.sh"
    run_phase "deploy" "04-deploy.sh"
    run_phase "verify" "05-verify.sh"
}

main "$@"
```

### Pattern 2: Checkpoint-Based State Management

**What:** Track deployment progress in a state file to enable resume-on-failure
**When to use:** Long-running deployments where re-running from scratch is expensive
**Trade-offs:**

- Pro: Can resume after network failures, user interrupts
- Con: State file can become stale, need cleanup mechanism

**Example:**

```bash
# lib/state.sh

STATE_FILE="${STATE_FILE:-/opt/freshtrack-pro/.deployment-state}"

checkpoint_exists() {
    local checkpoint="$1"
    [ -f "$STATE_FILE" ] && grep -qF "COMPLETED:$checkpoint" "$STATE_FILE"
}

set_checkpoint() {
    local checkpoint="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "COMPLETED:$checkpoint:$timestamp" >> "$STATE_FILE"
}

clear_checkpoints() {
    rm -f "$STATE_FILE"
}

get_last_checkpoint() {
    if [ -f "$STATE_FILE" ]; then
        tail -1 "$STATE_FILE" | cut -d: -f2
    fi
}
```

### Pattern 3: Tiered Error Recovery

**What:** Different error types trigger different recovery strategies
**When to use:** Production deployments where some failures are recoverable
**Trade-offs:**

- Pro: Intelligent recovery, reduces operator intervention
- Con: More complex logic, harder to reason about failure modes

**Example:**

```bash
# Error categories and responses
handle_error() {
    local error_type="$1"
    local error_context="$2"

    case "$error_type" in
        # Transient: retry with backoff
        "NETWORK"|"DNS_PROPAGATION"|"RATE_LIMIT")
            log_warning "Transient error: $error_context"
            retry_with_backoff "$error_context"
            ;;

        # Recoverable: prompt user for fix
        "PORT_IN_USE"|"DISK_FULL"|"PERMISSION")
            log_error "Recoverable error: $error_context"
            prompt_for_resolution "$error_type"
            ;;

        # Critical: automatic rollback
        "HEALTH_CHECK_FAILED"|"MIGRATION_FAILED")
            log_error "Critical error: $error_context"
            trigger_automatic_rollback
            ;;

        # Fatal: halt and diagnose
        "DOCKER_DAEMON"|"NO_ROOT"|"UNSUPPORTED_OS")
            log_error "Fatal error: $error_context"
            exit_with_diagnostics
            ;;
    esac
}
```

### Pattern 4: Progressive Verification Pipeline

**What:** Multi-stage verification from fast checks to comprehensive validation
**When to use:** Production deployments requiring confidence before declaring success
**Trade-offs:**

- Pro: Catches issues at appropriate level of granularity
- Con: Adds deployment time, may need to balance thoroughness vs speed

**Example:**

```bash
# Verification pipeline (fast to slow)
verify_deployment() {
    local domain="$1"

    # Stage 1: Health endpoints (5-10 seconds)
    log_step "Stage 1: Health check verification"
    verify_health_endpoints || return 1

    # Stage 2: SSL/TLS verification (5 seconds)
    log_step "Stage 2: SSL certificate verification"
    verify_ssl_certificate "$domain" || return 1

    # Stage 3: Browser smoke test (30 seconds)
    log_step "Stage 3: Browser accessibility test"
    verify_browser_access "$domain" || {
        log_warning "Browser test failed (non-critical)"
    }

    # Stage 4: E2E pipeline test (60-120 seconds)
    log_step "Stage 4: E2E sensor pipeline test"
    if [ -n "${RUN_E2E_TESTS:-}" ]; then
        run_e2e_tests || {
            log_warning "E2E tests failed - manual review recommended"
        }
    else
        log_info "Skipping E2E tests (set RUN_E2E_TESTS=1 to enable)"
    fi

    # Stage 5: Monitoring connectivity (10 seconds)
    log_step "Stage 5: Monitoring system verification"
    verify_monitoring_stack || {
        log_warning "Monitoring verification incomplete"
    }

    return 0
}
```

---

## Data Flow

### Configuration Flow

```
[User Input / Config File]
         |
         v
+-------------------+
| Interactive       |  <- Prompts for: domain, email, passwords
| Prompting         |     Validates: format, DNS resolution, uniqueness
+--------+----------+
         |
         v
+-------------------+
| Validation &      |  <- Checks: domain resolves, ports available
| Pre-checks        |     Verifies: SSH keys exist, docker installed
+--------+----------+
         |
         v
+-------------------+
| Config File       |  <- Generates: .env.production, secrets/
| Generation        |     Writes: compose overrides, Caddyfile
+--------+----------+
         |
         v
+-------------------+
| Docker Compose    |  <- Uses: base + production + selfhosted overlays
| Deployment        |     Runs: docker compose up -d
+--------+----------+
         |
         v
+-------------------+
| Verification      |  <- Health: /health, /health/ready
| Pipeline          |     Browser: curl HTTPS endpoint
+-------------------+     E2E: e2e-sensor-pipeline.sh
```

### Error Recovery Flow

```
[Deployment Step]
         |
         v
+-------------------+
| Execute Step      |
+--------+----------+
         |
    +---------+
    | Success?|
    +----+----+
    YES  |  NO
    |    |
    v    v
[Next]+-------------------+
Step  | Categorize Error  |
      +--------+----------+
               |
     +---------+---------+
     |         |         |
     v         v         v
[Transient] [Recover] [Critical]
     |         |         |
     v         v         v
  Retry    Prompt    Rollback
  w/Back   User      + Exit
   off
```

### Key Data Flows

1. **Secrets Flow:** User input -> validation -> file generation (`secrets/*.txt`) -> Docker secret mount -> container env vars
2. **Configuration Flow:** Interactive prompts -> `.env.production` -> Docker Compose interpolation -> container configuration
3. **Verification Flow:** Health endpoints -> SSL check -> Browser test -> E2E test -> Monitoring check -> Success/Failure

---

## Integration Points

### Integration with Existing v1.1 Architecture

| Component                  | Integration Pattern        | Notes                                   |
| -------------------------- | -------------------------- | --------------------------------------- |
| `docker-compose.yml`       | Use as base layer          | No modifications needed                 |
| `compose.production.yaml`  | Apply as overlay           | Contains resource limits, health checks |
| `compose.selfhosted.yaml`  | Apply for self-hosted      | Localhost bindings, Infisical secrets   |
| `deploy.sh`                | Call from one-click        | Reuse for image builds, migrations      |
| `rollback.sh`              | Call from recovery         | Enhance with state awareness            |
| `health-check.sh`          | Call from verify phase     | Reuse pre-flight checks                 |
| `scripts/test/e2e-*.sh`    | Call from verify phase     | Optional comprehensive validation       |
| `scripts/deploy/notify.sh` | Call at completion/failure | Already supports Slack webhooks         |

### Integration Diagram

```
deploy-one-click.sh
         |
         +---> lib/system.sh (package installation)
         |
         +---> lib/docker.sh (Docker installation)
         |          |
         |          +---> docker compose (existing)
         |
         +---> lib/config.sh (prompting, generation)
         |          |
         |          +---> secrets/ (generates)
         |          +---> .env.production (generates)
         |
         +---> phases/04-deploy.sh
         |          |
         |          +---> deploy.sh (existing, calls docker compose)
         |
         +---> phases/05-verify.sh
         |          |
         |          +---> health-check.sh (existing)
         |          +---> e2e-sensor-pipeline.sh (existing)
         |
         +---> lib/rollback.sh
                   |
                   +---> rollback.sh (existing)
```

### External Service Integration

| Service                   | Integration Pattern | Notes                                      |
| ------------------------- | ------------------- | ------------------------------------------ |
| Let's Encrypt (via Caddy) | Automatic via ACME  | DNS must resolve before deployment         |
| Stack Auth                | API key in secrets  | Project ID and keys required during config |
| Stripe                    | API key in .env     | Optional, graceful degradation if not set  |
| Telnyx                    | API key in .env     | Optional, SMS disabled if not set          |
| Slack/Discord             | Webhook URL         | For deployment notifications               |

---

## Scaling Considerations

| Scale         | Architecture Adjustments                       |
| ------------- | ---------------------------------------------- |
| Single server | Current architecture sufficient                |
| 2-3 servers   | Run script on each, coordinate manually        |
| 10+ servers   | Switch to Ansible playbooks calling same logic |

### Scaling Priorities

1. **First bottleneck:** Script assumes single-server deployment. Multi-server would need orchestration layer.
2. **Second bottleneck:** E2E tests run sequentially. Parallel test execution would speed verification.

---

## Anti-Patterns

### Anti-Pattern 1: Monolithic Script

**What people do:** Put all logic in one 2000+ line script
**Why it's wrong:** Impossible to test, hard to maintain, can't resume on failure
**Do this instead:** Modular phases with library functions, each under 100 lines

### Anti-Pattern 2: Hardcoded Configuration

**What people do:** Embed domain, passwords, API keys directly in script
**Why it's wrong:** Secrets in git, can't reuse for different environments
**Do this instead:** Interactive prompting with validation, generate config files

### Anti-Pattern 3: Silent Failures

**What people do:** Swallow errors with `|| true` everywhere
**Why it's wrong:** Deployment appears successful but is broken
**Do this instead:** `set -euo pipefail`, explicit error handling per step, categorized recovery

### Anti-Pattern 4: All-or-Nothing Rollback

**What people do:** On any failure, rollback everything
**Why it's wrong:** Loses progress, DNS propagation delays mean rollback doesn't help
**Do this instead:** Tiered recovery (retry transient, prompt recoverable, rollback critical)

### Anti-Pattern 5: Skipping Verification

**What people do:** Deployment ends after `docker compose up`
**Why it's wrong:** Containers might be running but unhealthy
**Do this instead:** Progressive verification pipeline (health -> SSL -> browser -> E2E)

### Anti-Pattern 6: Duplicating Existing Scripts

**What people do:** Copy logic from deploy.sh into one-click script
**Why it's wrong:** Maintenance burden, divergence, bugs in one not fixed in other
**Do this instead:** Call existing scripts through integration layer

---

## Suggested Build Order

Based on dependencies and risk, implement in this order:

### Phase 1: Foundation (Low Risk)

1. **lib/common.sh** - Colors, logging, output helpers (extract from existing scripts)
2. **lib/state.sh** - Checkpoint/state management (new)
3. **Entry script skeleton** - Main flow with phase calls

### Phase 2: Pre-Flight (Medium Risk)

4. **lib/system.sh** - OS detection, package installation (extract from deploy-selfhosted.sh)
5. **phases/01-preflight.sh** - System requirements check
6. **phases/02-install.sh** - Docker, firewall, fail2ban (extract from deploy-selfhosted.sh)

### Phase 3: Configuration (Medium Risk)

7. **lib/config.sh** - Interactive prompting with validation
8. **lib/secrets.sh** - Secret generation, file creation (extract from deploy-selfhosted.sh)
9. **phases/03-configure.sh** - Full configuration flow

### Phase 4: Deployment (Higher Risk)

10. **lib/docker.sh** - Docker Compose orchestration helpers
11. **phases/04-deploy.sh** - Deploy with existing scripts integration

### Phase 5: Verification (Medium Risk)

12. **lib/health.sh** - Health check functions
13. **lib/verification.sh** - SSL, browser, E2E wrappers
14. **phases/05-verify.sh** - Progressive verification pipeline

### Phase 6: Recovery (Higher Risk)

15. **lib/rollback.sh** - Rollback and recovery functions
16. **Error categorization** - Integrate with all phases
17. **State-aware resume** - Resume from last checkpoint

### Phase 7: Polish

18. **Documentation** - Inline help, troubleshooting guide
19. **Testing** - Dry-run mode, local VM testing
20. **Notifications** - Integration with existing notify.sh

---

## Confidence Assessment

| Area                  | Confidence | Reason                                                      |
| --------------------- | ---------- | ----------------------------------------------------------- |
| Script Organization   | HIGH       | Existing codebase already uses modular pattern in lib/      |
| Integration Points    | HIGH       | Analyzed all existing scripts and compose files             |
| Error Recovery        | MEDIUM     | General patterns clear, specific error codes need discovery |
| Verification Pipeline | HIGH       | E2E tests already exist, health endpoints documented        |
| Build Order           | HIGH       | Based on logical dependencies and risk assessment           |

---

## Sources

**Industry Best Practices:**

- [Building a Production-Grade Automated Deployment Script - DEV Community](https://dev.to/ursulaonyi/building-a-production-grade-automated-deployment-script-3fgj)
- [Best practices we need to follow in Bash scripting in 2025 - Medium](https://medium.com/@prasanna.a1.usage/best-practices-we-need-to-follow-in-bash-scripting-in-2025-cebcdf254768)
- [Managing Rollbacks in Continuous Deployment - Linux Bash](https://www.linuxbash.sh/post/managing-rollbacks-in-continuous-deployment)
- [Deployment Scripts Best Practices - MOSS](https://moss.sh/reviews/deployment-scripts-best-practices/)
- [Handling Rollback Strategies for Failed Product Deployments - Agile Seekers](https://agileseekers.com/blog/handling-rollback-strategies-for-failed-product-deployments)

**Docker Compose in Production:**

- [Use Compose in production - Docker Docs](https://docs.docker.com/compose/production/)
- [Docker Best Practices 2026 - Thinksys](https://thinksys.com/devops/docker-best-practices/)
- [Best Practices Around Production Ready Web Apps with Docker Compose - Nick Janetakis](https://nickjanetakis.com/blog/best-practices-around-production-ready-web-apps-with-docker-compose)

**Error Handling:**

- [How to Handle Errors in Bash Scripts in 2025 - DEV Community](https://dev.to/rociogarciavf/how-to-handle-errors-in-bash-scripts-in-2025-3bo)
- [Bash Coding Standard - GitHub](https://github.com/Open-Technology-Foundation/bash-coding-standard)

**E2E Testing:**

- [End-to-End Testing for Microservices: A 2025 Guide - Bunnyshell](https://www.bunnyshell.com/blog/end-to-end-testing-for-microservices-a-2025-guide/)
- [Automation Pipeline and CI/CD: Testing Best Practices - BrowserStack](https://www.browserstack.com/guide/automation-pipeline)

**Existing Codebase Analysis:**

- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/deploy.sh` - Current deployment orchestration
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/deploy-selfhosted.sh` - Self-hosted deployment with installation
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/rollback.sh` - Rollback procedures
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/health-check.sh` - Pre-flight validation
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/lib/doctl-helpers.sh` - Library pattern example
- `/home/skynet/freshtrack-pro-local/fresh-staged/scripts/test/e2e-sensor-pipeline.sh` - E2E verification

---

_Architecture research for: Automated Deployment Scripts (v2.1)_
_Researched: 2026-01-25_
