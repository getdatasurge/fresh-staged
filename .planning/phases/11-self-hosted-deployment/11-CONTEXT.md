# Phase 11: Self-Hosted Deployment - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Validated deployment to self-hosted VM with automated SSL and tested rollback procedures. Delivers documentation and scripts to guide users from bare VM to running application with HTTPS.

</domain>

<decisions>
## Implementation Decisions

### Target Environment

- Ubuntu 24.04 LTS assumed (latest LTS, support until 2029)
- Minimum VM specs: 4 vCPU, 8GB RAM (headroom for full stack)
- Root user context (script runs as root directly)
- Fresh VM only — no handling of existing installations, user starts clean

### Deployment Script Design

- Config file with interactive fallback for missing values
- Fully idempotent — safe to rerun after failures, checks state before each action
- Full auto-install: Docker + Compose + firewall + fail2ban + node_exporter
- Progress-level verbosity — show step names + success/fail, not every command

### SSL/TLS Approach

- Caddy automatic HTTPS (already in stack, zero config, auto-renewal built in)
- Wildcard certificate option documented (DNS challenge instructions included)
- DNS pre-check before requesting SSL — prevents Let's Encrypt rate limit issues
- Abort deployment if SSL acquisition fails — no HTTP fallback

### Rollback Mechanics

- Automatic rollback triggered by health check failure after deploy
- 30-second health check timeout before declaring failure
- Code-only rollback — database stays as-is (migrations are forward-only)

### Claude's Discretion

- Rollback depth (how many versions to retain)
- Database rollback approach (whether to offer optional backup restore flag)
- Specific health check implementation
- firewall rules configuration (which ports to open)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 11-self-hosted-deployment_
_Context gathered: 2026-01-24_
