# Phase 7: Production Deployment & Cutover - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the self-hosted FreshTrack Pro system to production infrastructure and execute the cutover from Supabase. This phase covers infrastructure provisioning, deployment configuration, the cutover procedure, and user communication. It does not include new features or functionality changes.

</domain>

<decisions>
## Implementation Decisions

### Cutover Timing

- Cutover immediately when ready — no scheduled maintenance window
- Zero downtime goal — DNS switch with brief propagation window accepted
- Brief gap in sensor data acceptable — sensors will resume, no queuing needed
- Full rehearsal on staging first — practice complete cutover with production-like data before production

### Rollback Strategy

- Keep Supabase available for 1 week after cutover
- Rollback only triggered by critical data loss (readings/alerts not being captured)
- User-facing errors or performance issues are not automatic rollback triggers
- Hybrid rollback procedure — script with confirmation prompts at critical points
- Claude's Discretion: how to handle data created after cutover if rollback needed

### Infrastructure Target

- Claude's Discretion: cloud provider choice (DigitalOcean, AWS, or other based on cost/complexity)
- Hybrid database approach — managed PostgreSQL for data, self-hosted Redis/MinIO in Docker
- Medium scale design (50-500 users) — some redundancy, consider load balancing
- Full observability stack — metrics, logs, traces, dashboards (Grafana or equivalent)

### User Communication

- Advance notice 24-48 hours before cutover with what to expect
- Password reset prompted on first login (not pre-announced or emailed)
- Both status page and support email for post-cutover issues
- Changelog/release notes link explaining infrastructure changes

### Claude's Discretion

- Cloud provider selection based on cost/complexity analysis
- Post-cutover data handling during rollback scenarios
- Specific observability tooling choices
- Exact timing of staging rehearsal vs production cutover

</decisions>

<specifics>
## Specific Ideas

- "Zero downtime goal" — user expects seamless experience, brief DNS propagation delay OK
- "Brief gap acceptable" — food safety data has some tolerance, sensors catch up
- "Full rehearsal" — staging must mirror production data patterns before cutover
- "Hybrid rollback" — want human verification at critical points, not fully automated

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 07-production-deployment-cutover_
_Context gathered: 2026-01-23_
