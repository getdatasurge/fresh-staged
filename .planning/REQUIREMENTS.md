# Requirements: FreshTrack Pro v2.0 Real-Time & Billing

**Defined:** 2026-01-24
**Core Value:** Food safety data must flow reliably from sensors to alerts without interruption.

## v2.0 Requirements

Requirements for real-time features, background processing, billing, and backend API migration.

### Real-Time Communication

- [ ] **RT-01**: Socket.io server integrated with Fastify backend
- [ ] **RT-02**: Redis adapter configured for horizontal scaling
- [ ] **RT-03**: Multi-tenant room architecture with organization isolation
- [ ] **RT-04**: Live sensor reading updates pushed to dashboard
- [ ] **RT-05**: Real-time alert notifications delivered to connected clients

### Background Job Processing

- [ ] **BG-01**: BullMQ job queue integrated with Fastify
- [ ] **BG-02**: Worker containers deployable independently from API
- [ ] **BG-03**: SMS notifications delivered via Telnyx through job queue
- [ ] **BG-04**: Alert SMS delivery with retry and backoff strategy
- [ ] **BG-05**: Email digest jobs scheduled with cron patterns
- [ ] **BG-06**: Bull Board dashboard deployed for queue monitoring

### Billing Integration

- [ ] **BILL-01**: Stripe subscription checkout flow functional
- [ ] **BILL-02**: Usage metering for active sensors (last_during_period)
- [ ] **BILL-03**: Usage metering for temperature readings (sum)
- [ ] **BILL-04**: Stripe webhook handler with signature verification
- [ ] **BILL-05**: Customer Portal integrated for self-service billing
- [ ] **BILL-06**: Subscription status enforced in application

### Backend API Migration

- [ ] **API-01**: tRPC infrastructure configured on Fastify backend
- [ ] **API-02**: Organizations domain migrated to tRPC
- [ ] **API-03**: Sites domain migrated to tRPC
- [ ] **API-04**: Units domain migrated to tRPC
- [ ] **API-05**: Readings domain migrated to tRPC
- [ ] **API-06**: Alerts domain migrated to tRPC
- [ ] **API-07**: Settings/admin domains migrated to tRPC
- [ ] **API-08**: Supabase client removed from frontend (AUTH-02 completed)

### Enterprise Deployment (Optional)

- [ ] **ENT-01**: AWS ECS/Fargate deployment documented
- [ ] **ENT-02**: Multi-region deployment support (deferred if not needed)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RT-01 | Phase 14 | Pending |
| RT-02 | Phase 14 | Pending |
| RT-03 | Phase 14 | Pending |
| RT-04 | Phase 14 | Pending |
| RT-05 | Phase 14 | Pending |
| BG-01 | Phase 15 | Pending |
| BG-02 | Phase 15 | Pending |
| BG-03 | Phase 16 | Pending |
| BG-04 | Phase 16 | Pending |
| BG-05 | Phase 17 | Pending |
| BG-06 | Phase 15 | Pending |
| BILL-01 | Phase 18 | Pending |
| BILL-02 | Phase 18 | Pending |
| BILL-03 | Phase 18 | Pending |
| BILL-04 | Phase 18 | Pending |
| BILL-05 | Phase 18 | Pending |
| BILL-06 | Phase 18 | Pending |
| API-01 | Phase 19 | Pending |
| API-02 | Phase 19 | Pending |
| API-03 | Phase 20 | Pending |
| API-04 | Phase 20 | Pending |
| API-05 | Phase 20 | Pending |
| API-06 | Phase 20 | Pending |
| API-07 | Phase 21 | Pending |
| API-08 | Phase 21 | Pending |
| ENT-01 | Phase 22 | Pending |
| ENT-02 | Phase 22 | Pending |

---

*Requirements defined: 2026-01-24*
