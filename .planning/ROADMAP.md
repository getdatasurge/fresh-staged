# Roadmap: FreshTrack Pro

## Milestones

- ✅ **v1.0 Self-Hosted MVP** - Phases 1-7 (shipped 2026-01-23)
- ✅ **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24)
- ✅ **v2.0 Real-Time & Billing** - Phases 14-21 (shipped 2026-01-25)
- 🚧 **v2.1 Streamlined Deployment** - Phases 22-26 (shipped 2026-01-25)

## Phases

<details>
<summary>✅ v1.0 Self-Hosted MVP (Phases 1-7) - SHIPPED 2026-01-23</summary>

See MILESTONES.md for details. 47 plans completed.

</details>

<details>
<summary>✅ v1.1 Production Ready (Phases 8-13) - SHIPPED 2026-01-24</summary>

See MILESTONES.md for details. 31 plans completed.

</details>

<details>
<summary>✅ v2.0 Real-Time & Billing (Phases 14-21) - SHIPPED 2026-01-25</summary>

See MILESTONES.md for details. 40 plans completed.

</details>

<details>
<summary>✅ v2.1 Streamlined Deployment (Phases 22-26) - SHIPPED 2026-01-25</summary>

See .planning/milestones/v2.1-SUMMARY.md for details. 9 plans completed.

</details>


## Phases

### 🚧 v2.2 Technical Debt & Stabilization (Planned)

**Milestone Goal:** Eliminate Supabase dependency and stabilize TTN integration for long-term maintainability

- [x] **Phase 27: TTN SDK Integration** - Complete.
- [~] **Phase 28: Supabase Removal** - Partial. Edge function calls remain (25 in 9 files).
    - [x] Wave 1: Audit & Event Logging
    - [x] Wave 2: Site & Alert Settings
    - [x] Wave 3: Alert Rules & History
    - [x] Wave 4: System Pages & Sync
    - [x] Wave 5: Core Entity Dashboards (Dashboard, Units, Sites, Alerts)
    - [x] Wave 6: Detail Views & Maintenance
    - [x] Wave 7: Platform Admin & Remaining Cleanup
    - [ ] **Gap:** 25 edge function calls not migrated to tRPC
- [x] ~~**Phase 29: Production Data Migration**~~ - SKIPPED (no Supabase production access)
- [x] **Phase 30: System Hardening** - Complete. Final security audit and performance tuning.
    - [x] 30-01: Backend security headers (@fastify/helmet), body limits, request timeout
    - [x] 30-02: Dependency vulnerability audit (npm audit fix)
    - [x] 30-03: Enhanced supabase-placeholder error handling
    - [x] 30-04: Integration verification

### Gap Closure Phases (from v2.2 Audit)

- [ ] **Phase 31: TTN Provisioning UI Migration**
    - **Goal:** Wire TTN provisioning UI to Phase 27 tRPC endpoints
    - **Closes:** Integration gap (TTN UI → tRPC), Flow gap (TTN Organization Provisioning)
    - **Plans:** 3 plans
    Plans:
    - [ ] 31-01-PLAN.md — Add missing tRPC procedures for TTN provisioning
    - [ ] 31-02-PLAN.md — Migrate TTNCredentialsPanel to tRPC
    - [ ] 31-03-PLAN.md — Add integration tests and verify UI

- [ ] **Phase 32: Remaining Edge Function Migration**
    - **Goal:** Migrate remaining supabase.functions.invoke calls to tRPC
    - **Closes:** 19 remaining edge function calls in 7 files
    - **Files:** EmulatorTTNRoutingCard.tsx (2), SensorManager.tsx (1), 5+ other files
    - **Tasks:** Audit remaining calls, migrate each file, verify

- [ ] **Phase 33: Error Handling UI Integration**
    - **Goal:** Wire SupabaseMigrationError to UI error boundaries
    - **Closes:** Integration gap (SupabaseMigrationError → UI consumers)
    - **Tasks:** Add error boundary for migration errors, update components, fix BLOCKED docs

---
*Roadmap created: 2026-01-25*
*Last updated: 2026-01-28 (Phase 31 planned with 3 plans)*
