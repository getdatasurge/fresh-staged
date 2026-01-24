# Production Cutover Checklist

## Overview

**Strategy:** Blue-green cutover with controlled downtime window
**Expected Downtime:** 2-4 hours
**Rollback Window:** 7 days (data in Supabase retained for rollback if needed)
**Communication Plan:** 48h advance notice, status updates during cutover, post-cutover confirmation

## Prerequisites

Before starting T-48h timeline:

- [ ] All Phase 6 migration scripts tested in staging
- [ ] Phase 7 Plans 01-04 completed (infrastructure, monitoring, deployment automation)
- [ ] Production server provisioned and configured
- [ ] All secrets generated and stored securely
- [ ] Backup procedures tested and verified
- [ ] Emergency contact list confirmed
- [ ] Rollback procedure reviewed and understood
- [ ] Status page (Uptime Kuma) configured and accessible

---

## T-48h: Pre-Cutover Preparation

**When:** 48 hours before cutover window

### DNS Preparation
- [ ] Lower DNS TTL to 300 seconds (5 minutes) for all domains
  - [ ] `freshtrackpro.com` A/AAAA records
  - [ ] `api.freshtrackpro.com` A/AAAA records
  - [ ] `status.freshtrackpro.com` A/AAAA records
  - [ ] Verify TTL change propagated: `dig freshtrackpro.com` shows 300s TTL

### User Communication (T-48h)
- [ ] Send advance notice email to all users (see `USER_NOTICE_TEMPLATE.md`)
- [ ] Post announcement on status page
- [ ] Update in-app banner with cutover schedule
- [ ] Notify key stakeholders individually (if applicable)

### Staging Verification
- [ ] Run full migration pipeline in staging environment
- [ ] Verify all data migrated correctly (run `verify-migration.ts`)
- [ ] Test authentication flows (login, signup, password reset)
- [ ] Test critical user workflows:
  - [ ] View temperature readings
  - [ ] Acknowledge alerts
  - [ ] Create new site/area/unit
  - [ ] Configure TTN integration
- [ ] Performance test: Load test with realistic traffic
- [ ] Backup staging database before proceeding

---

## T-24h: Final Verification

**When:** 24 hours before cutover window

### System Health Check
- [ ] Verify Supabase export completes successfully (dry run)
- [ ] Verify production server ready:
  - [ ] All services healthy
  - [ ] Monitoring active (Grafana, Prometheus, Loki)
  - [ ] Status page operational
  - [ ] Backup cron jobs configured
- [ ] Test rollback procedure in staging (restore from backup)

### Data Preparation
- [ ] Create final Supabase backup (pre-freeze)
- [ ] Document current system state:
  - [ ] Total user count
  - [ ] Total organization count
  - [ ] Total readings count
  - [ ] Latest reading timestamp
- [ ] Verify MinIO buckets ready to receive exports

### Communication (T-24h)
- [ ] Send 24h reminder email to users
- [ ] Update status page with cutover timeline
- [ ] Confirm all team members available during cutover window

---

## T-0: Cutover Execution

**When:** Start of planned cutover window

### Phase 1: Freeze Supabase (T+0 to T+15min)

**Goal:** Stop writes to legacy system

- [ ] **T+0:** Post "Maintenance in Progress" on status page
- [ ] **T+0:** Enable maintenance mode in application
  - [ ] Set `MAINTENANCE_MODE=true` in frontend
  - [ ] Display user-friendly maintenance banner
- [ ] **T+5:** Verify no new writes happening:
  ```sql
  -- Check last insert timestamp in key tables
  SELECT MAX(created_at) FROM temperature_readings;
  SELECT MAX(created_at) FROM alert_instances;
  ```
- [ ] **T+10:** Create final Supabase snapshot
- [ ] **T+15:** Document cutover point (timestamp, record counts)

### Phase 2: Export Data (T+15min to T+45min)

**Goal:** Export all data from Supabase

- [ ] **T+15:** Run export scripts:
  ```bash
  cd scripts/migration
  npm run export:organizations
  npm run export:sites
  npm run export:areas
  npm run export:units
  npm run export:readings
  npm run export:alerts
  npm run export:users
  npm run export:ttn-config
  ```
- [ ] **T+30:** Verify exports complete (check file sizes, record counts)
- [ ] **T+35:** Upload exports to MinIO bucket `migration-exports`
- [ ] **T+40:** Verify uploads (checksums match)
- [ ] **T+45:** Export verification complete

### Phase 3: Data Migration (T+45min to T+90min)

**Goal:** Import data into PostgreSQL

- [ ] **T+45:** Run migration scripts:
  ```bash
  cd scripts/migration
  npm run migrate:organizations
  npm run migrate:sites
  npm run migrate:areas
  npm run migrate:units
  npm run migrate:readings
  npm run migrate:alerts
  npm run migrate:users
  npm run migrate:ttn-config
  ```
- [ ] **T+70:** Run verification script:
  ```bash
  npm run verify:migration
  ```
- [ ] **T+75:** Compare counts (Supabase export vs PostgreSQL):
  - [ ] Organizations match
  - [ ] Sites match
  - [ ] Areas match
  - [ ] Units match
  - [ ] Readings match (within acceptable range)
  - [ ] Alerts match
  - [ ] Users match
- [ ] **T+80:** Verify data integrity:
  - [ ] Foreign keys valid
  - [ ] UUIDs preserved
  - [ ] Timestamps preserved
  - [ ] JSON data valid
- [ ] **T+90:** Migration verification complete

### Phase 4: Deploy New System (T+90min to T+120min)

**Goal:** Start production services

- [ ] **T+90:** Deploy backend and frontend:
  ```bash
  cd /opt/freshtrack-pro
  docker compose -f docker-compose.yml -f compose.production.yaml up -d
  ```
- [ ] **T+95:** Verify all containers healthy:
  ```bash
  docker compose ps
  curl http://localhost:3000/health
  ```
- [ ] **T+100:** Run smoke tests:
  - [ ] Health endpoints responding
  - [ ] Database connection active
  - [ ] Redis connection active
  - [ ] MinIO accessible
- [ ] **T+105:** Test authentication:
  - [ ] Admin login works
  - [ ] Test user login works
  - [ ] Password reset flow works
- [ ] **T+110:** Test critical workflows:
  - [ ] View readings for test unit
  - [ ] Acknowledge test alert
  - [ ] Create test area (read/write works)
- [ ] **T+120:** Application verification complete

### Phase 5: DNS Cutover (T+120min to T+135min)

**Goal:** Point DNS to new server

- [ ] **T+120:** Update DNS records:
  - [ ] `freshtrackpro.com` → new server IP
  - [ ] `api.freshtrackpro.com` → new server IP
  - [ ] `status.freshtrackpro.com` → new server IP
- [ ] **T+125:** Wait for DNS propagation (TTL=300s)
- [ ] **T+130:** Test from external network:
  ```bash
  curl https://api.freshtrackpro.com/health
  curl https://freshtrackpro.com
  ```
- [ ] **T+135:** Verify user traffic routing to new server (check logs)

### Phase 6: Final Validation (T+135min to T+150min)

**Goal:** Confirm cutover success

- [ ] **T+135:** Test from multiple locations/devices:
  - [ ] Desktop browser (Chrome, Firefox)
  - [ ] Mobile browser (iOS Safari, Android Chrome)
  - [ ] Different networks (WiFi, cellular)
- [ ] **T+140:** Verify monitoring active:
  - [ ] Grafana dashboards showing metrics
  - [ ] Uptime Kuma showing all services green
  - [ ] Logs flowing to Loki
- [ ] **T+145:** Send test TTN webhook (verify end-to-end ingestion)
- [ ] **T+150:** Cutover execution complete

### Phase 7: Communication (T+150min)

**Goal:** Notify users system is live

- [ ] Disable maintenance mode
- [ ] Update status page: "All Systems Operational"
- [ ] Send post-cutover email to users (see `USER_NOTICE_TEMPLATE.md`)
- [ ] Post success message in company Slack/Teams

---

## T+0 to T+2h: Critical Monitoring Period

**Focus:** Immediate issue detection

### Every 15 Minutes
- [ ] Check error rates in Grafana
- [ ] Review application logs for exceptions
- [ ] Monitor response times
- [ ] Check database connection pool usage
- [ ] Verify no failed logins (Stack Auth dashboard)

### Active Monitoring
- [ ] Watch for user-reported issues (email, support channels)
- [ ] Monitor TTN webhook success rate
- [ ] Check alert delivery (SMS, email)
- [ ] Verify readings ingestion continuing normally

### Escalation Criteria
**Trigger rollback if:**
- Error rate > 5% of requests
- Database connection failures
- Authentication completely broken
- Critical data loss detected
- Unable to ingest new readings for > 30 minutes

---

## T+2h to T+24h: Stabilization Period

**Focus:** Performance tuning and minor fixes

### Every 2 Hours
- [ ] Review error logs and trends
- [ ] Check performance metrics vs baseline
- [ ] Verify backup jobs ran successfully
- [ ] Monitor disk space usage
- [ ] Check memory/CPU usage trends

### Active Support
- [ ] Respond to user questions about password reset
- [ ] Fix minor UI issues if discovered
- [ ] Tune database query performance if needed
- [ ] Adjust rate limits if necessary

### Rollback Decision Point (T+24h)
- [ ] Review 24h stability metrics
- [ ] Assess user feedback
- [ ] Determine: Proceed or rollback?
- [ ] If proceeding: Document lessons learned

---

## T+24h: First Day Review

**When:** 24 hours after cutover

### Metrics Review
- [ ] Compare error rates: Pre-cutover vs post-cutover
- [ ] Compare response times: Before vs after
- [ ] User activity levels normal?
- [ ] TTN webhook success rate normal?
- [ ] Alert delivery success rate normal?

### User Feedback
- [ ] Collect user feedback (survey, direct outreach)
- [ ] Address any usability concerns
- [ ] Document common user questions for FAQ

### System Health
- [ ] Database size trending as expected
- [ ] Backup jobs completing successfully
- [ ] Log rotation working correctly
- [ ] Resource usage within limits

### Decision
- [ ] **PROCEED:** Continue with new system, begin monitoring ramp-down
- [ ] **ROLLBACK:** Execute rollback procedure (see below)

---

## T+48h to T+7d: Rollback Window

**Purpose:** Safety net for unforeseen issues

### Daily Checks (Until T+7d)
- [ ] Review error logs for patterns
- [ ] Monitor user retention/activity
- [ ] Check for data inconsistencies
- [ ] Verify backup integrity

### Rollback Criteria
**Consider rollback if:**
- Persistent critical bugs affecting > 10% of users
- Data integrity issues discovered
- Performance degradation > 50% slower
- User complaints indicate major workflow breakage
- Critical third-party integration failure (TTN, Telnyx)

### Rollback Decision Authority
- **Minor issues:** Engineering team fixes forward
- **Major issues:** Engineering + Product leads decide
- **Critical issues:** Immediate rollback, notify all stakeholders

---

## T+7d: Cutover Complete

**When:** 7 days after cutover (rollback window closed)

### Final Actions
- [ ] Archive Supabase export data (long-term backup)
- [ ] Update DNS TTL back to normal (86400s / 24h)
- [ ] Remove maintenance mode code from application
- [ ] Document post-cutover changes made
- [ ] Conduct retrospective meeting

### Formal Sign-Off
- [ ] Engineering lead confirms system stable
- [ ] Product lead confirms user acceptance
- [ ] Operations confirms monitoring/backup operational
- [ ] Document cutover completion in project records

---

## Rollback Procedure

**See:** `docs/PRODUCTION_DEPLOYMENT.md` (Rollback section)

### Quick Rollback Steps
1. **Immediately:** Revert DNS to old Supabase backend
2. **Within 5min:** Disable new system (stop containers)
3. **Within 15min:** Verify users can access old system
4. **Within 30min:** Communicate rollback to users
5. **Within 1h:** Post-mortem to identify root cause

### Data Considerations
- **Writes during new system:** May be lost if rollback required
- **Mitigation:** Minimize rollback window, fix forward if possible
- **Last resort only:** Rollback is disruptive and loses new data

---

## Emergency Contacts

**On-Call Engineers:**
- Primary: [Name] - [Phone] - [Email]
- Secondary: [Name] - [Phone] - [Email]

**External Services Support:**
- Stack Auth: support@stack-auth.com
- Uptime Robot: (if using for external monitoring)
- Infrastructure Provider: [Contact info]

**Escalation Path:**
1. On-call engineer (immediate response)
2. Engineering lead (15min response)
3. CTO/VP Engineering (30min response)

---

## Notes

- **Keep Supabase Read-Only:** After cutover, Supabase database remains accessible read-only for 7 days (rollback safety net)
- **Status Page Updates:** Update status.freshtrackpro.com at every major phase
- **Communication Templates:** See `USER_NOTICE_TEMPLATE.md` for pre-written messages
- **Automation:** Where possible, script repetitive verification steps
- **Documentation:** Record actual times and any deviations from this checklist

**Last Updated:** 2026-01-23
