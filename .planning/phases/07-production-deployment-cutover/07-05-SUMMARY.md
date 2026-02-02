---
phase: 07-production-deployment-cutover
plan: 05
subsystem: documentation-status-monitoring
status: complete
completed: 2026-01-23
duration: 5m 40s

# Dependencies
requires:
  - phase: 07
    plan: 01
    provides: production-infrastructure-foundation
  - phase: 06
    plan: 06
    provides: migration-verification
  - phase: 06
    plan: 05
    provides: data-migration-scripts

provides:
  - uptime-kuma-status-page
  - cutover-checklist-t48h-to-t7d
  - user-communication-templates
  - production-deployment-documentation
  - rollback-procedures

affects:
  - phase: 07
    plan: 06
    needs: cutover checklist for execution

# Technical Stack
tech-stack:
  added:
    - Uptime Kuma 1.x (status page)
  patterns:
    - comprehensive cutover timeline (T-48h to T+7d)
    - multi-template user communication (advance, reminder, complete, rollback)
    - production deployment runbook pattern

# Key Files
key-files:
  created:
    - docs/CUTOVER_CHECKLIST.md
    - docs/USER_NOTICE_TEMPLATE.md
    - docs/PRODUCTION_DEPLOYMENT.md
  modified:
    - compose.production.yaml (added Uptime Kuma service)

# Strategic Decisions
decisions:
  - id: CUTOVER-001
    decision: 48-hour advance notice for cutover
    rationale: Gives users time to prepare, download critical reports, plan around downtime window
    alternatives: 24h notice (too short), 7-day notice (too long, users forget)
    date: 2026-01-23

  - id: CUTOVER-002
    decision: 7-day rollback window with Supabase read-only
    rationale: Safety net for unforeseen issues, allows thorough production validation before data deletion
    alternatives: Immediate Supabase deletion (risky), 30-day window (excessive costs)
    date: 2026-01-23

  - id: CUTOVER-003
    decision: Require password reset for all users post-cutover
    rationale: Migration changes auth provider (Supabase Auth to Stack Auth), password hashes cannot be transferred
    alternatives: Automatic password migration (not possible with different auth systems)
    date: 2026-01-23

  - id: DEPLOY-005
    decision: Use Uptime Kuma for public status page
    rationale: Self-hosted, simple to configure, provides both monitoring and public status page, no external dependencies
    alternatives: StatusPage.io ($29/mo), Atlassian Statuspage ($29/mo), custom solution (more development)
    date: 2026-01-23

# Metrics
metrics:
  tasks: 3
  commits: 3
  files_created: 3
  files_modified: 1
  deviations: 0
---

# Phase 07 Plan 05: Status Page & Cutover Documentation Summary

## One-Liner

Uptime Kuma status page at status.freshtrackpro.com, comprehensive cutover checklist (T-48h to T+7d), user communication templates, and complete production deployment runbook.

## Objective Achieved

Added Uptime Kuma status page to production stack and created comprehensive documentation for cutover execution, user communication, and production deployment. Operations team now has complete playbook from initial server provisioning through cutover execution to ongoing maintenance.

## Work Completed

### Task 1: Add Uptime Kuma status page to compose.production.yaml

**Status:** ✓ Complete
**Commit:** 2d8297b

Added Uptime Kuma service to `compose.production.yaml` with production-ready configuration:

**Service configuration:**

- **Image:** louislam/uptime-kuma:1 (official stable release)
- **Container name:** frostguard-uptime-kuma
- **Volume:** uptime_kuma_data (persistent storage for monitors and configuration)
- **Port binding:** 127.0.0.1:3002:3001 (localhost only, Caddy reverse proxy handles external access)
- **Resource limits:** 256M memory, 0.5 CPU
- **Resource reservations:** 128M memory, 0.1 CPU
- **Restart policy:** any condition, 5s delay, 3 max attempts
- **Restart:** unless-stopped (automatic recovery)

**Volume definition:**

- Created `uptime_kuma_data` volume with local driver
- Persists monitor configuration, status page settings, and historical uptime data

**Access pattern:**

- Internal: http://uptime-kuma:3001 (container network)
- External: https://status.freshtrackpro.com (via Caddy reverse proxy with auto-HTTPS)

**Monitoring capabilities:**
Once configured, Uptime Kuma will monitor:

- Backend API health endpoint (https://api.freshtrackpro.com/health)
- Frontend availability (https://freshtrackpro.com)
- Critical services (database, Redis via internal checks)
- External dependencies (TTN webhook endpoint)

### Task 2: Create comprehensive cutover checklist

**Status:** ✓ Complete
**Commit:** d4ad914

Created `docs/CUTOVER_CHECKLIST.md` with detailed timeline from T-48h to T+7d:

**Overview section:**

- Strategy: Blue-green cutover with controlled downtime
- Expected downtime: 2-4 hours
- Rollback window: 7 days
- Communication plan: 48h advance notice, status updates during cutover, post-cutover confirmation

**Prerequisites section:**

- Phase 6 migration scripts tested
- Production server configured
- Secrets generated
- Backup procedures verified
- Emergency contacts confirmed

**T-48h: Pre-Cutover Preparation**

- DNS TTL reduction (to 300s for quick cutover)
- User advance notice communication
- Staging environment full migration verification
- Critical workflow testing checklist

**T-24h: Final Verification**

- System health checks
- Supabase export dry run
- Production server readiness verification
- Rollback procedure testing in staging
- 24h reminder communication

**T-0: Cutover Execution (6 phases)**

1. **Phase 1: Freeze Supabase (T+0 to T+15min)**
   - Enable maintenance mode
   - Verify no new writes
   - Create final snapshot
   - Document cutover point

2. **Phase 2: Export Data (T+15min to T+45min)**
   - Run all export scripts (organizations, sites, areas, units, readings, alerts, users, TTN config)
   - Verify exports complete (checksums, record counts)
   - Upload to MinIO migration-exports bucket

3. **Phase 3: Data Migration (T+45min to T+90min)**
   - Run all migration scripts
   - Execute verification script
   - Compare counts (Supabase vs PostgreSQL)
   - Verify data integrity (foreign keys, UUIDs, timestamps)

4. **Phase 4: Deploy New System (T+90min to T+120min)**
   - Deploy backend and frontend via Docker Compose
   - Verify container health
   - Run smoke tests (health endpoints, database, Redis, MinIO)
   - Test authentication flows (login, signup, password reset)
   - Test critical workflows (view readings, acknowledge alerts, create area)

5. **Phase 5: DNS Cutover (T+120min to T+135min)**
   - Update DNS A records (freshtrackpro.com, api, status)
   - Wait for propagation (5min with reduced TTL)
   - Test from external network
   - Verify user traffic routing

6. **Phase 6: Final Validation (T+135min to T+150min)**
   - Multi-device testing (desktop, mobile, different networks)
   - Verify monitoring active (Grafana, Uptime Kuma, Loki)
   - Send test TTN webhook
   - Disable maintenance mode
   - Send post-cutover communication

**T+0 to T+2h: Critical Monitoring Period**

- Every 15 minutes: Check error rates, logs, response times, database pool, authentication
- Active monitoring: User issues, TTN webhooks, alert delivery, readings ingestion
- Escalation criteria: > 5% error rate, database failures, auth broken, data loss, 30min+ readings ingestion failure

**T+2h to T+24h: Stabilization Period**

- Every 2 hours: Review errors, performance vs baseline, backups, disk space, CPU/memory trends
- Active support: User password reset questions, minor UI fixes, query tuning, rate limit adjustments
- Rollback decision point at T+24h

**T+24h: First Day Review**

- Metrics review: Error rates, response times, user activity, TTN/alert success rates
- User feedback collection
- System health verification
- Decision: Proceed or rollback

**T+48h to T+7d: Rollback Window**

- Daily checks: Error patterns, user retention, data inconsistencies, backup integrity
- Rollback criteria: Persistent critical bugs, data integrity issues, > 50% performance degradation, major workflow breakage
- Decision authority defined (minor, major, critical issues)

**T+7d: Cutover Complete**

- Archive Supabase exports
- Restore DNS TTL to 24h
- Remove maintenance mode code
- Document post-cutover changes
- Conduct retrospective
- Formal sign-off

**Rollback Procedure section:**

- Reference to PRODUCTION_DEPLOYMENT.md rollback section
- Quick rollback steps (< 15 minutes)
- Data considerations (writes during new system may be lost)

**Emergency Contacts section:**

- On-call engineers (primary, secondary)
- External services support (Stack Auth, infrastructure provider)
- Escalation path with response times

### Task 3: Create user notice template and production deployment docs

**Status:** ✓ Complete
**Commit:** 62ef9d9

Created two comprehensive documentation files:

#### docs/USER_NOTICE_TEMPLATE.md (9KB, 6 templates)

**Template 1: Advance Notice (T-48h)**

- Email subject and body for initial 48-hour advance notice
- Explains maintenance window (date, time, duration)
- What's happening: Infrastructure upgrade details
- What users need to know:
  - System downtime (no dashboard, no alerts, no readings access)
  - Sensors continue operating (data syncs after maintenance)
  - **Password reset required** (emphasized)
  - No data loss guarantee
- Status page URL for updates
- Support contact information

**Template 2: 24-Hour Reminder (T-24h)**

- Brief reminder of upcoming maintenance
- Preparation tips: Download critical reports, note active alerts, verify email for password reset

**Template 3: Maintenance Starting (T-0)**

- Short notification that maintenance is in progress
- Expected completion time
- Status page link

**Template 4: Maintenance Complete - Password Reset Required (T+150min)**

- System back online confirmation
- **Password reset instructions** (step-by-step)
- Troubleshooting if reset email not received
- What's new: Faster performance, enhanced security, improved monitoring
- Data preservation confirmation
- Support contact

**Template 5: Rollback Notice (If Needed)**

- Rollback completed notification
- Explanation of what happened (issue identified, system restored)
- What users need to know: No password reset, all data preserved, normal operations
- Next steps: Investigation, rescheduled maintenance, advance notice
- Apology and reassurance

**Template 6: Post-Cutover Survey (T+24h - Optional)**

- Feedback survey invitation
- Questions: Password reset success, performance improvements, issues, suggestions
- Direct support email for urgent issues

**Additional sections:**

- Email timing summary table
- Communication channels (email, in-app banner, status page, social media)
- Best practices: Send during business hours, be specific about times, emphasize password reset, reassure about data, track open rates
- Customization notes: Placeholder replacement guide

#### docs/PRODUCTION_DEPLOYMENT.md (24KB, comprehensive runbook)

**Prerequisites section:**

- Infrastructure requirements: Server specs (4 CPU, 8GB RAM, 100GB SSD, static IP)
- Recommended providers: DigitalOcean, Linode, AWS, Hetzner (with pricing)
- External services setup:
  - Required: Stack Auth (authentication), Domain name (DNS)
  - Optional: Telnyx (SMS), TTN (LoRaWAN), Sentry (error tracking)
- Local tools: Git, SSH, Docker

**Initial Server Setup section:**

1. **Provision server:** DigitalOcean CLI example, note IP address
2. **Initial configuration:**
   - Update system packages
   - Create application user (freshtrack)
   - Configure firewall (UFW: allow SSH, HTTP, HTTPS)
   - Enable Fail2Ban (brute-force protection)
3. **Install Docker:** Official installation script, add user to docker group, enable service
4. **Create application directory:** /opt/freshtrack-pro with correct permissions
5. **Clone repository:** HTTPS or SSH, checkout production branch/tag

**Configuration section:**

1. **Generate secrets:**
   - openssl commands for postgres_password, jwt_secret, minio_password
   - Stack Auth secret from dashboard
   - Set chmod 600 permissions
2. **Configure environment variables:**
   - Copy .env.production.example to .env.production
   - Update critical values: domains, Stack Auth credentials, TTN, Telnyx, CORS
3. **Configure Caddy:** Verify Caddyfile matches domains, basicauth hash generation
4. **Configure DNS:** A records for @, api, monitoring, status (TTL 300s initially)
5. **Configure Uptime Kuma:** First-run setup (admin account, add monitors, create status page)

**Deployment section:**

1. **Build images:** Production backend build, verify
2. **Start services:** docker compose with production overrides
3. **Verify deployment:** Check containers running, health endpoints, logs
4. **Database initialization:** Migrations (first deployment) or migration from Supabase (cutover)
5. **Verify HTTPS:** Test endpoints, Caddy auto-provisions Let's Encrypt certificates
6. **Create admin user:** Via Stack Auth signup or backend CLI

**Monitoring section:**

- **Grafana Dashboard:** Access, default credentials, available dashboards (application metrics, database performance, system resources, logs), key metrics to watch
- **Uptime Kuma Status Page:** Access, monitors configuration, notification setup (email, Slack, Discord, Telegram)
- **Manual Health Checks:** curl commands for backend, database, Redis, MinIO
- **Log Monitoring:** docker compose logs commands, searching for errors

**Maintenance section:**

- **Daily Operations:** Automated backups (2 AM), log rotation, disk usage alerts; Manual checks in Grafana/Uptime Kuma
- **Weekly Operations:** Review metrics, security updates, test backup restoration, archive old logs
- **Monthly Operations:** Database optimization, dependency updates, SSL review, security audit
- **Backups:**
  - Automated database backup script (pg_dump, gzip, 7-day retention)
  - Crontab configuration (daily 2 AM)
  - Manual backup commands
  - Restore procedure
- **Log Rotation:** Docker daemon.json configuration (10m max-size, 3 max-file)
- **Updates and Deployments:** git pull, rebuild, restart, verify; Zero-downtime deployment note (Swarm/Kubernetes)

**Troubleshooting section:**

- **Service Won't Start:** Debug steps (logs, resource usage, secrets, config), common causes
- **Database Connection Errors:** Debug steps (check PostgreSQL, test connectivity, verify DATABASE_URL), common causes
- **HTTPS Certificate Issues:** Debug steps (Caddy logs, DNS verification, Let's Encrypt challenge), common causes
- **High Memory Usage:** Debug steps (docker stats, free -h, identify memory hogs), solutions
- **Slow API Responses:** Debug steps (response time measurement, slow query analysis, CPU usage), solutions
- **Logs Not Appearing in Grafana:** Debug steps (Promtail status, Loki endpoint, data source config), common causes

**Rollback Procedures section:**

- **When to Rollback:** Immediate criteria (> 50% error rate, data loss, security breach, corruption) vs Fix forward criteria (< 10% users affected, < 50% performance degradation, non-critical features)
- **Rollback to Previous Version:**
  1. Stop current deployment
  2. Revert code to previous tag
  3. Rebuild images
  4. Restore database (if schema changed)
  5. Restart services
  6. Verify rollback
  7. Communicate to users
- **Rollback During Migration:** Reference to CUTOVER_CHECKLIST.md, quick steps (revert DNS, stop new services, re-enable old frontend, notify users), time to rollback < 15 minutes

**Security Hardening section:**

- Server-level: Automatic security updates, disable root SSH, SSH keys only, intrusion detection, regular audits
- Application-level: Rotate secrets quarterly, rate limiting, CORS, dependency updates, CVE monitoring
- Database-level: Restrict to localhost, separate users per service, query logging, backup encryption
- Network-level: Cloudflare DDoS protection, VPN for admin access, IP whitelisting for monitoring

**Performance Tuning section:**

- Database optimization: Index creation examples, query analysis
- Backend scaling: Vertical scaling, horizontal scaling (load balancer, read replicas, caching), Docker Compose scale example

**Additional Resources section:**

- Documentation links: Caddy, Docker Compose, PostgreSQL, Grafana
- Support: GitHub issues, Stack Auth support, community forum

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:

1. ✓ Uptime Kuma service added to compose.production.yaml (grep shows service definition with image, container_name, volumes, ports, resource limits)
2. ✓ Cutover checklist covers T-48h through T+7d (grep shows T-48h, T-24h, T-0, T+2h, T+24h, T+7d sections)
3. ✓ User notice template includes password reset messaging (multiple references to password reset requirement in all relevant templates)
4. ✓ Production deployment documentation is comprehensive (Prerequisites, Initial Server Setup, Configuration, Deployment, Monitoring, Maintenance, Troubleshooting, Rollback sections all present)
5. ✓ All documentation is actionable and specific (step-by-step commands, checklists, verification steps throughout)

## Success Criteria

- [x] Uptime Kuma service added to compose.production.yaml
- [x] Cutover checklist covers T-48h through T+7d
- [x] User notice template includes password reset messaging
- [x] Production deployment documentation is comprehensive
- [x] All documentation is actionable and specific

## Integration Points

**Upstream (dependencies):**

- Phase 07-01: Production infrastructure foundation (compose file, health endpoints, secrets structure used in deployment docs)
- Phase 06-06: Migration verification (referenced in cutover checklist verification steps)
- Phase 06-05: Data migration scripts (used in cutover T-0 execution phases)

**Downstream (affects):**

- **Phase 07-06 (if exists - Final Cutover Execution):** Cutover checklist provides step-by-step execution plan
- **Operations team:** Production deployment documentation provides complete runbook from server provisioning to maintenance
- **Support team:** User notice templates provide communication scripts for cutover events

## Next Phase Readiness

**Ready for Cutover Execution:**

- Uptime Kuma service defined and ready to deploy
- Comprehensive cutover checklist (T-48h to T+7d) provides execution roadmap
- User communication templates ready for all cutover phases (advance notice, reminders, completion, rollback)
- Production deployment documentation covers all aspects (provisioning, configuration, deployment, monitoring, maintenance, troubleshooting, rollback)

**Blockers:** None

**Concerns:**

- First-time cutover execution will likely reveal minor process improvements (update checklist based on learnings)
- User password reset step may generate support volume (prepare support team with FAQ)
- Uptime Kuma needs manual configuration after first deployment (add monitors, create status page)

## Technical Decisions Impact

**Uptime Kuma for Status Page:**

- Pros: Self-hosted (no external dependencies), free, simple setup, combines monitoring + status page, Docker-native
- Cons: Manual configuration required, no built-in incident management workflow
- Impact: Users get real-time system status visibility, reduces "is it down?" support inquiries

**48-hour Advance Notice:**

- Pros: Users have time to prepare, download reports, plan around downtime
- Cons: Users may forget by cutover time (mitigated with 24h reminder)
- Impact: Better user experience, reduced support volume during cutover

**7-day Rollback Window:**

- Pros: Safety net for unforeseen issues, thorough production validation before point of no return
- Cons: 7 days of dual system costs (Supabase + self-hosted), complexity
- Impact: Risk mitigation, confidence in cutover execution

**Mandatory Password Reset:**

- Pros: Required for auth provider migration (Supabase Auth to Stack Auth), improves security (users create fresh passwords)
- Cons: Friction for users, support volume spike expected
- Impact: Necessary trade-off for migration, user communication critical to minimize frustration

## Artifacts Created

**Production artifacts:**

1. `compose.production.yaml` - Uptime Kuma service added (with uptime_kuma_data volume)

**Documentation:**

1. `docs/CUTOVER_CHECKLIST.md` - Comprehensive cutover procedure (T-48h to T+7d)
2. `docs/USER_NOTICE_TEMPLATE.md` - 6 email templates for user communication
3. `docs/PRODUCTION_DEPLOYMENT.md` - Complete deployment runbook (prerequisites through maintenance)

**Total:** 1 file modified, 3 documentation files created

## Lessons Learned

**What went well:**

- Comprehensive timeline approach (T-48h to T+7d) provides clear execution roadmap
- User communication templates cover all scenarios (advance notice, reminders, completion, rollback)
- Production deployment documentation is actionable with specific commands and verification steps
- Uptime Kuma integration straightforward (simple service definition, no complex configuration)

**What could improve:**

- Consider automating parts of cutover checklist (scripts for verification steps)
- User password reset communication could be supplemented with in-app wizard/tutorial
- May need to adjust timeline based on actual data volume (export/import times may vary)

**Recommendations for cutover execution:**

- Do a full staging rehearsal with production-sized dataset to validate timelines
- Prepare support team FAQ document for password reset questions
- Consider live status page updates during cutover (builds user confidence)
- Document actual vs planned timelines for future cutover process improvements
- Take screenshots/logs of each cutover phase for post-mortem documentation
