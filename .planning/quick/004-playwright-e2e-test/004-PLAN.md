---
phase: quick
plan: 004
type: execute
wave: 1
depends_on: []
files_modified:
  - playwright.production.config.ts
  - e2e/production-smoke.spec.ts
autonomous: true

must_haves:
  truths:
    - "Playwright tests execute against the deployed production instance at 192.168.4.181"
    - "Tests confirm the frontend loads without JS errors over HTTPS with self-signed cert"
    - "Tests confirm the API health endpoint responds at port 3000"
    - "Tests confirm navigation to sign-in page works"
  artifacts:
    - path: "playwright.production.config.ts"
      provides: "Playwright config targeting production deployment"
      contains: "192.168.4.181"
    - path: "e2e/production-smoke.spec.ts"
      provides: "E2E smoke tests for production deployment"
      min_lines: 40
  key_links:
    - from: "playwright.production.config.ts"
      to: "https://192.168.4.181"
      via: "baseURL config"
      pattern: "baseURL.*192\\.168\\.4\\.181"
    - from: "e2e/production-smoke.spec.ts"
      to: "http://192.168.4.181:3000/health"
      via: "API health check request"
      pattern: "health"
---

<objective>
Create Playwright E2E smoke tests that run against the deployed production instance at https://192.168.4.181 to verify the deployment is healthy and functional.

Purpose: Validate the production deployment (14 Docker containers) is serving correctly -- frontend loads, API responds, navigation works, no JS console errors.
Output: A production-specific Playwright config and smoke test spec that can be run on demand.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Existing Playwright setup:
- `playwright.config.ts` -- current config targets localhost:5173 with local webServer
- `e2e/performance.spec.ts` -- existing perf tests for local dev
- Playwright 1.58.0 already installed via node_modules

Production deployment:
- Frontend: https://192.168.4.181 (self-signed cert, needs ignoreHTTPSErrors)
- API health: http://192.168.4.181:3000/health
- Stack Auth handles authentication (external OAuth -- full login not automatable)
- 14 Docker containers running the full stack
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create production Playwright config and smoke test spec</name>
  <files>playwright.production.config.ts, e2e/production-smoke.spec.ts</files>
  <action>
Create `playwright.production.config.ts` in the project root:
- Import from `@playwright/test` (defineConfig, devices)
- Set `testDir: './e2e'` with `testMatch: 'production-smoke.spec.ts'` (only run the production smoke spec)
- Set `fullyParallel: false` (sequential is fine for 4 tests)
- Set `retries: 1` (one retry for network flakiness)
- Set `reporter: 'list'` (simple console output, not HTML)
- In `use` block:
  - `baseURL: 'https://192.168.4.181'`
  - `ignoreHTTPSErrors: true` (critical: self-signed cert)
  - `trace: 'on-first-retry'`
  - `screenshot: 'only-on-failure'`
  - `timeout: 30000` (30s per action, generous for remote)
- Single project: `chromium` with `Desktop Chrome` device
- NO `webServer` block (we are hitting a deployed instance, not starting one)

Create `e2e/production-smoke.spec.ts` with these test cases:

**Test 1: "Landing page loads successfully"**
- `page.goto('/')`
- Assert the page title contains something (not empty)
- Assert no JS console errors: collect `page.on('console', ...)` messages with `msg.type() === 'error'`, filter out known noise (e.g., favicon 404, self-signed cert warnings), assert no real errors remain
- Assert the page has visible content (body is not empty): `expect(page.locator('body')).not.toBeEmpty()`
- Take a screenshot for reference: `page.screenshot({ path: 'e2e/screenshots/production-landing.png' })`

**Test 2: "API health endpoint responds"**
- Use `page.request.get('http://192.168.4.181:3000/health')` (note: HTTP, port 3000, not HTTPS)
- Assert response status is 200
- Assert response body contains expected health check data (log the body for debugging)

**Test 3: "Navigation to sign-in works"**
- From landing page, look for a sign-in / login link or button
- Use broad selectors: `page.getByRole('link', { name: /sign.?in|log.?in/i })` or `page.locator('a[href*="sign"], a[href*="login"], button:has-text("Sign"), button:has-text("Log")')`
- If found, click it and assert the URL changes or a sign-in form/page appears
- If NOT found (page might redirect to auth automatically), assert current URL contains auth-related path or the page has auth-related content
- This test should be resilient: use `try/catch` or conditional logic since Stack Auth may redirect differently

**Test 4: "No critical resources fail to load"**
- Navigate to `/`
- Listen for failed requests via `page.on('requestfailed', ...)`
- Collect failed requests, filter out non-critical ones (e.g., analytics, tracking pixels)
- After page load completes (`networkidle`), assert no critical resource requests failed (JS bundles, CSS, API calls)

Add a `test.beforeAll` that creates the screenshots directory: `fs.mkdirSync('e2e/screenshots', { recursive: true })`

Import `fs` from `node:fs` at the top.
  </action>
  <verify>
Run: `npx playwright test --config=playwright.production.config.ts --reporter=list`
All 4 tests should pass (or provide clear skip messages if network unreachable).
Check that `e2e/screenshots/production-landing.png` was created.
  </verify>
  <done>
4 smoke tests exist in `e2e/production-smoke.spec.ts` targeting the production deployment.
A dedicated `playwright.production.config.ts` configures Playwright for the remote HTTPS instance with self-signed cert support.
Running `npx playwright test --config=playwright.production.config.ts` executes all smoke tests against 192.168.4.181.
  </done>
</task>

<task type="auto">
  <name>Task 2: Run tests and capture results</name>
  <files>e2e/production-smoke.spec.ts</files>
  <action>
Execute the production smoke tests:

1. Ensure Playwright browsers are installed: `npx playwright install chromium` (may already be present, but verify)
2. Run: `npx playwright test --config=playwright.production.config.ts --reporter=list`
3. Capture the output and analyze results
4. If any tests fail:
   - Read the error output carefully
   - Fix the test spec to handle the actual behavior (e.g., if the landing page redirects to auth, update Test 1 and Test 3 accordingly)
   - Re-run until tests reflect actual production behavior
5. The goal is tests that PASS and accurately verify the deployment, not tests that enforce incorrect assumptions

Do NOT change the production deployment. Only adjust the test expectations to match reality.
  </action>
  <verify>
`npx playwright test --config=playwright.production.config.ts --reporter=list` exits with code 0 (all tests pass).
Screenshot file exists at `e2e/screenshots/production-landing.png`.
  </verify>
  <done>
All production smoke tests pass against the live deployment at 192.168.4.181.
Test output confirms: frontend loads, API health responds 200, navigation works, no critical resource failures.
  </done>
</task>

</tasks>

<verification>
Run the full production smoke test suite:
```bash
npx playwright test --config=playwright.production.config.ts --reporter=list
```
Expected: All 4 tests pass. Exit code 0.

Verify screenshot captured:
```bash
ls -la e2e/screenshots/production-landing.png
```
</verification>

<success_criteria>
- `playwright.production.config.ts` exists with baseURL targeting 192.168.4.181 and ignoreHTTPSErrors enabled
- `e2e/production-smoke.spec.ts` exists with 4 smoke tests
- All tests pass against the live production deployment
- Screenshot of the landing page captured for visual reference
- Tests are resilient to Stack Auth redirect behavior
</success_criteria>

<output>
After completion, create `.planning/quick/004-playwright-e2e-test/004-SUMMARY.md`
</output>
