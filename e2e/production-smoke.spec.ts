import fs from 'node:fs'
import { expect, test } from '@playwright/test'

test.beforeAll(() => {
	fs.mkdirSync('e2e/screenshots', { recursive: true })
})

test.describe('Production Smoke Tests', () => {
	test('frontend serves HTML successfully', async ({ page }) => {
		const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })
		expect(response).not.toBeNull()
		expect(response!.status()).toBeLessThan(400)

		// Page should have the correct title
		const title = await page.title()
		expect(title).toContain('FrostGuard')

		// HTML structure should be present
		await expect(page.locator('#root')).toBeAttached()
		await expect(page.locator('script[src*="index-"]')).toBeAttached()

		// Take a reference screenshot
		await page.screenshot({ path: 'e2e/screenshots/production-landing.png' })
	})

	test('API health endpoint responds', async ({ request }) => {
		// API is behind Caddy reverse proxy, accessed via /api/health over HTTPS
		const response = await request.get('https://192.168.4.181/api/health', {
			ignoreHTTPSErrors: true,
			timeout: 15000,
		})
		expect(response.status()).toBe(200)

		const body = await response.json()
		console.log('Health endpoint response:', JSON.stringify(body))
		expect(body.status).toBe('healthy')
		expect(body.checks.database.status).toBe('pass')
		expect(body.checks.redis.status).toBe('pass')
	})

	test('React app renders successfully', async ({ page }) => {
		const pageErrors: string[] = []
		page.on('pageerror', (err) => pageErrors.push(err.message))

		await page.goto('/', { waitUntil: 'networkidle', timeout: 45000 })

		// JS bundle should have been fetched (network request succeeded)
		const jsLoaded = await page.evaluate(() => {
			return document.querySelectorAll('script[src*="index-"]').length > 0
		})
		expect(jsLoaded).toBe(true)

		// Assert React mounted - #root must have children
		const rootChildren = await page.locator('#root').evaluate((el) => el.children.length)
		console.log('React root children count:', rootChildren)
		if (rootChildren === 0) {
			console.log('Page errors collected:', pageErrors)
		}
		expect(rootChildren).toBeGreaterThan(0)

		// Assert no "is not a function" errors (the specific tRPC crash signature)
		const crashErrors = pageErrors.filter((msg) => msg.includes('is not a function'))
		if (crashErrors.length > 0) {
			console.log('tRPC crash errors detected:', crashErrors)
		}
		expect(crashErrors).toHaveLength(0)

		// Take a screenshot as evidence
		await page.screenshot({ path: 'e2e/screenshots/production-react-mounted.png' })
	})

	test('no critical resources fail to load', async ({ page }) => {
		const failedRequests: { url: string; error: string }[] = []

		page.on('requestfailed', (request) => {
			const url = request.url()
			const failure = request.failure()
			// Filter out non-critical: analytics, tracking, external services, favicons, SW
			const isNonCritical =
				url.includes('analytics') ||
				url.includes('tracking') ||
				url.includes('pixel') ||
				url.includes('favicon') ||
				url.includes('google') ||
				url.includes('facebook') ||
				url.includes('sw.js') ||
				url.includes('registerSW')
			if (!isNonCritical) {
				failedRequests.push({
					url,
					error: failure?.errorText || 'unknown',
				})
			}
		})

		await page.goto('/', { waitUntil: 'networkidle', timeout: 45000 })

		if (failedRequests.length > 0) {
			console.log('Failed requests:', JSON.stringify(failedRequests, null, 2))
		}

		// No critical resources should fail to load
		expect(failedRequests).toHaveLength(0)
	})
})
