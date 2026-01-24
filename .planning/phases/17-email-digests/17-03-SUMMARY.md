---
phase: 17
plan: 03
subsystem: email-digests
tags: [jwt, unsubscribe, email, plain-text, resend]

dependency_graph:
  requires: [17-01]
  provides: [unsubscribe-tokens, unsubscribe-endpoint, grouped-digest-processor]
  affects: [email-deliverability, user-preferences]

tech_stack:
  added: []
  patterns:
    - JWT-based one-click unsubscribe
    - Plain text email fallback for deliverability
    - Site-filtered grouped digest

key_files:
  created:
    - backend/src/utils/unsubscribe-token.ts
    - backend/src/routes/unsubscribe.ts
  modified:
    - backend/src/app.ts
    - backend/src/services/email.service.ts
    - backend/src/workers/processors/email-digest.processor.ts

decisions:
  - id: UNSUB-01
    decision: JWT token for unsubscribe with 30-day expiry
    rationale: Secure, stateless, doesn't require database lookup for validation
  - id: UNSUB-02
    decision: UNSUBSCRIBE_SECRET env var with JWT_SECRET fallback
    rationale: Allows dedicated secret but works out of box with existing JWT setup
  - id: UNSUB-03
    decision: Unsubscribe endpoint at /unsubscribe (not /api/unsubscribe)
    rationale: Email links are public, no /api prefix needed for user-facing action

metrics:
  duration: 5 minutes
  completed: 2026-01-24
---

# Phase 17 Plan 03: Unsubscribe & Processor Updates Summary

JWT-based one-click unsubscribe with secure tokens, plus processor updates for grouped digest data and plain text email support.

## One-Liner

Secure unsubscribe via JWT tokens, processor uses grouped data with site filtering, both HTML and plain text emails sent.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create unsubscribe token utility | 0616800 | generateUnsubscribeToken, verifyUnsubscribeToken with 30-day expiry |
| 2 | Create /unsubscribe endpoint | 2c0d3b9 | GET /unsubscribe?token=xxx, updates preferences, syncs schedulers |
| 3 | Update digest processor | ae18704 | Generates JWT URLs, renders HTML+text, uses grouped data |

## Key Artifacts

### backend/src/utils/unsubscribe-token.ts
```typescript
// JWT-based token generation and verification
export async function generateUnsubscribeToken(
  userId: string,
  type: 'daily' | 'weekly' | 'all'
): Promise<string>

export async function verifyUnsubscribeToken(
  token: string
): Promise<UnsubscribePayload | null>
```

### backend/src/routes/unsubscribe.ts
```typescript
// GET /unsubscribe?token=xxx
// - Verifies JWT token
// - Updates profile.digestDaily/digestWeekly
// - Syncs or removes schedulers
// - Returns JSON success/error
```

### email-digest.processor.ts Changes
```typescript
// Generate secure unsubscribe URL
const unsubscribeToken = await generateUnsubscribeToken(userId, period);
const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}`;

// Render both HTML and plain text
const html = await render(Template(templateProps));
const text = await render(Template(templateProps), { plainText: true });

// Send with both versions
await emailService.sendDigest({ to, subject, html, text });
```

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| UNSUB-01 | JWT token with 30-day expiry | Secure, stateless, no DB lookup needed |
| UNSUB-02 | UNSUBSCRIBE_SECRET with JWT_SECRET fallback | Dedicated secret optional, works with existing setup |
| UNSUB-03 | Endpoint at /unsubscribe (no /api prefix) | Public user-facing link from emails |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Weekly digest template used old structure**
- **Found during:** Task 2 TypeScript verification
- **Issue:** weekly-digest.tsx still referenced `displayAlerts` instead of grouped `sites` structure
- **Fix:** Template had already been auto-fixed (likely by previous plan execution or linter)
- **Files:** backend/src/emails/weekly-digest.tsx

**2. [Rule 3 - Blocking] EmailService missing text parameter**
- **Found during:** Task 2
- **Issue:** SendDigestParams interface didn't include optional `text` field for plain text emails
- **Fix:** Added `text?: string` to interface and pass-through to Resend API
- **Files:** backend/src/services/email.service.ts

## Verification Results

1. TypeScript compilation: PASSED - no errors in src/
2. Unsubscribe token utility:
   - generateUnsubscribeToken creates HS256-signed JWT
   - verifyUnsubscribeToken returns payload or null
   - 30-day expiration configured
3. /unsubscribe endpoint:
   - Token verification via verifyUnsubscribeToken
   - Updates profile digestDaily/digestWeekly based on type
   - Syncs schedulers via syncUserDigestSchedulers
4. Processor:
   - Uses buildGroupedDigestData with site filtering
   - Generates secure unsubscribe URL with JWT
   - Renders both HTML and plain text
   - Passes both to EmailService

## Next Phase Readiness

Phase 17 Email Digests is now complete with all three plans executed:
- 17-01: Digest preferences in profiles table
- 17-02: Grouped digest data builder and email templates (executed previously)
- 17-03: Unsubscribe tokens and processor updates (this plan)

Ready for Phase 18 (Stripe Billing Integration).

## Integration Points

- **Frontend:** Can hit GET /unsubscribe?token=xxx directly from email links
- **Schedulers:** syncUserDigestSchedulers called on unsubscribe to remove jobs
- **EmailService:** Now accepts `text` parameter for plain text fallback
- **Processor:** Generates JWT-based unsubscribe URLs per digest type
