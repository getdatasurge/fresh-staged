# Phase 17: Email Digests - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Scheduled email digest generation via BullMQ job schedulers. Configure cron patterns for daily/weekly digests, handle timezone-aware scheduling per user profile, render and deliver email templates. This phase delivers scheduled email summaries of alert activity — it doesn't add new notification types, reporting features, or compliance documentation.

</domain>

<decisions>
## Implementation Decisions

### Digest Content & Structure
- Primary purpose: Alert summary (not compliance reports or operational overview)
- Grouping: By site, then by unit within each site
- Detail level: Essential only — alert type, time, duration, resolution status (fits on mobile)
- Empty digests: Skip if no alerts — don't send "all clear" emails

### Schedule Options
- Frequencies: Daily and weekly available
- Daily timing: User configurable (each user picks their preferred time)
- Weekly timing: Monday (fixed day)
- Timezone: User profile timezone — each user sets their timezone in profile settings

### Recipient Targeting
- Eligibility: All users can opt-in via profile settings
- Default state: Opt-out by default — users must explicitly enable digests
- Site filtering: Users can select specific sites to include in their digest
- Admin controls: None — user choice only, no admin enforcement

### Email Design
- Format: HTML with plain text fallback
- Template style: Clean minimal — simple header, content, footer
- Links: Include direct links to relevant dashboard pages (sites/units with issues)
- Unsubscribe: One-click unsubscribe link in footer (standard email best practice)

### Claude's Discretion
- Exact HTML/CSS template implementation
- Email sending service integration (likely existing email infrastructure)
- Plain text generation approach
- Specific cron schedule syntax
- Job retry and failure handling strategy

</decisions>

<specifics>
## Specific Ideas

- Daily digest should feel like a morning briefing — quick scan of what happened
- Weekly digest summarizes the full week, grouped the same way (by site → unit)
- Essential alert info only: don't overwhelm with data, keep it scannable on mobile
- One-click unsubscribe is required for email deliverability compliance

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-email-digests*
*Context gathered: 2026-01-24*
