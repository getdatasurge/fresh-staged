# Requirements: FreshTrack Pro v2.8

**Defined:** 2026-01-30
**Core Value:** Food safety data must flow reliably from sensors to alerts without interruption.

## v2.8 Requirements — Production Polish

Fix known production issues discovered during v2.7 deployment verification. The app renders and functions but has console errors, uncaught promise rejections, and WebSocket reconnection flicker that degrade the user experience.

### SuperAdmin Context Fix

- [ ] **SA-01**: `useSuperAdmin` does not throw when called during initial render
- [ ] **SA-02**: No `useSuperAdmin` context error in browser console on page load

### ServiceWorker Handling

- [ ] **SW-01**: ServiceWorker registration failure on self-signed cert does not produce uncaught promise rejection
- [ ] **SW-02**: App functions normally when ServiceWorker registration is unavailable

### WebSocket Stability

- [ ] **WS-01**: Socket.io connection does not disconnect/reconnect on JWT token refresh
- [ ] **WS-02**: Socket.io uses WebSocket transport directly (no polling upgrade)
- [ ] **WS-03**: No visible connection flicker during normal app usage

## Out of Scope

| Feature | Reason |
|---------|--------|
| Domain setup / Let's Encrypt | Staying IP-based with self-signed certs |
| New features or UI changes | Polish only, no feature work |
| Backend changes | Issues are frontend-only |
| Test coverage expansion | Fix bugs only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SA-01 | TBD | Pending |
| SA-02 | TBD | Pending |
| SW-01 | TBD | Pending |
| SW-02 | TBD | Pending |
| WS-01 | TBD | Pending |
| WS-02 | TBD | Pending |
| WS-03 | TBD | Pending |

**Coverage:**
- v2.8 requirements: 7 total
- Mapped to phases: 0 (awaiting roadmap)
- Unmapped: 7

---
*Requirements defined: 2026-01-30*
*Last updated: 2026-01-30*
