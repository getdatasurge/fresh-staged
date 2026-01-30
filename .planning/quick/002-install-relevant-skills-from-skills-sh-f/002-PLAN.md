---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .skills/stripe/ai/**
  - .skills/wshobson/agents/**
autonomous: true

must_haves:
  truths:
    - 'Claude has access to Stripe integration patterns for Phase 18 billing work'
    - 'Claude has access to TypeScript/API design patterns for ongoing development'
  artifacts:
    - path: '.skills/stripe/ai'
      provides: 'Stripe AI integration patterns and best practices'
    - path: '.skills/wshobson/agents'
      provides: 'TypeScript patterns, API design, error handling'
  key_links: []
---

<objective>
Install relevant skills from skills.sh to enhance Claude's capabilities for this TypeScript React Fastify Stripe project.

Purpose: Prepare Claude with domain-specific knowledge for upcoming Phase 18 (Stripe Billing) and ongoing TypeScript/API development patterns.
Output: Skills installed in .skills/ directory, available for Claude context.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
Project uses: React + Vite, Fastify 5, PostgreSQL + Drizzle ORM, Socket.io, BullMQ, Stripe (Phase 18), Stack Auth, TypeScript
Next phases: 17-email-digests, 18-stripe-billing
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install Stripe AI skill for billing integration patterns</name>
  <files>.skills/stripe/ai/**</files>
  <action>
Install the stripe/ai skill using npx skills add:

```bash
npx skills add stripe/ai
```

This skill provides Stripe integration patterns, payment processing best practices, webhook handling, and subscription management - directly relevant for Phase 18 Stripe Billing.

If prompted about creating .skills directory, accept. The skill will be installed to .skills/stripe/ai/.
</action>
<verify>

```bash
ls -la .skills/stripe/ai/ 2>/dev/null || echo "Stripe skill not found"
```

Directory exists with skill content.
</verify>
<done>Stripe AI skill installed and available in .skills/stripe/ai/</done>
</task>

<task type="auto">
  <name>Task 2: Install wshobson/agents skill for TypeScript patterns</name>
  <files>.skills/wshobson/agents/**</files>
  <action>
Install the wshobson/agents skill using npx skills add:

```bash
npx skills add wshobson/agents
```

This skill provides TypeScript patterns, API design best practices, and error handling patterns useful for ongoing Fastify API development.

The skill will be installed to .skills/wshobson/agents/.
</action>
<verify>

```bash
ls -la .skills/wshobson/agents/ 2>/dev/null || echo "Agents skill not found"
```

Directory exists with skill content.
</verify>
<done>wshobson/agents skill installed and available in .skills/wshobson/agents/</done>
</task>

<task type="auto">
  <name>Task 3: Add .skills to .gitignore if not present</name>
  <files>.gitignore</files>
  <action>
Check if .skills/ is already in .gitignore. If not, add it to prevent committing downloaded skills to the repository.

Skills are developer-local context and should not be version controlled.

Add to .gitignore:

```
# Skills (developer-local context)
.skills/
```

  </action>
  <verify>
```bash
grep -q "\.skills" .gitignore && echo ".skills in gitignore" || echo ".skills NOT in gitignore"
```
  </verify>
  <done>.skills/ directory is gitignored to prevent accidental commits</done>
</task>

</tasks>

<verification>
- Both skills directories exist under .skills/
- .skills/ is in .gitignore
- Skills content is readable (not empty directories)
</verification>

<success_criteria>

- stripe/ai skill installed and available for Phase 18 billing work
- wshobson/agents skill installed for TypeScript/API pattern reference
- .skills/ directory properly gitignored
  </success_criteria>

<output>
After completion, create `.planning/quick/002-install-relevant-skills-from-skills-sh-f/002-SUMMARY.md`
</output>
