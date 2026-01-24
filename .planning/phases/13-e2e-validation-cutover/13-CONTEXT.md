# Phase 13: E2E Validation & Cutover - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate that the complete sensor-to-alert pipeline works end-to-end on production infrastructure, test data migration procedures with synthetic production-scale data, confirm zero-downtime deployments work on both deployment targets, and create a deployment decision guide for users.

This phase validates everything built in Phases 1-12 before production cutover.

</domain>

<decisions>
## Implementation Decisions

### E2E Test Scope
- Document both testing modes: simulator for CI/quick tests, real TTN sensors for full validation
- Test ALL configured notification channels (email, webhook, any others the system supports)
- Include edge cases: multiple sensors, rapid readings, back-to-back threshold breaches
- Full alert lifecycle: breach → alert fired → acknowledgment → resolution

### Migration Testing
- Use synthetic generated data matching production scale
- Target ~100K records (month of sensor readings for 20-50 sensors)
- Document actual migration timing without hard threshold enforcement
- Rollback testing not needed — Phase 10 backup/restore already covers this

### Deployment Validation
- Validate BOTH deployment targets: self-hosted (generic VM) and DigitalOcean Droplet
- Document SSL certificate renewal procedure without simulating expiry test
- Zero-downtime approach and failure severity determination at Claude's discretion

### Decision Guide
- Scenario-based format ("If you have X needs, choose Y" with example personas)
- Include monthly cost estimates for each scenario
- Standalone document: docs/DEPLOYMENT_DECISION_GUIDE.md
- Persona/scenario breakdown at Claude's discretion

### Claude's Discretion
- Observability stack validation depth (basic checks vs full dashboard verification)
- Zero-downtime validation approach (health check only vs load during deploy)
- Failure severity determination for deployment target issues
- Scenario breakdown for decision guide (team size, budget, technical skill, or hybrid)

</decisions>

<specifics>
## Specific Ideas

- E2E tests should be runnable without physical sensors (simulator mode must work independently)
- Migration timing should be documented so users can plan their maintenance window
- Decision guide should help non-technical users choose the right deployment target

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-e2e-validation-cutover*
*Context gathered: 2026-01-24*
