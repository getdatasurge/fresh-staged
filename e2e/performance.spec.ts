import { expect, test } from '@playwright/test';

test('dashboard loads quickly', async ({ page, context }) => {
  // Enable request logging
  await context.tracing.start({ screenshots: true, snapshots: true });

  // Navigate to dashboard
  const startTime = Date.now();
  await page.goto('/');
  const loadTime = Date.now() - startTime;

  // Check if page loaded within 3 seconds
  expect(loadTime).toBeLessThan(3000);

  // Check for key elements to ensure page is functional
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({
    timeout: 2000,
  });

  // Log performance metrics
  console.log(`Dashboard load time: ${loadTime}ms`);

  // Stop tracing
  await context.tracing.stop({ path: 'dashboard-trace.zip' });
});

test('units page loads quickly with data', async ({ page, context }) => {
  await context.tracing.start({ screenshots: true, snapshots: true });

  const startTime = Date.now();
  await page.goto('/units');
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(3000);

  // Check if units are displayed
  await expect(page.getByRole('listitem')).toBeVisible({ timeout: 2000 });

  console.log(`Units page load time: ${loadTime}ms`);

  await context.tracing.stop({ path: 'units-trace.zip' });
});

test('filtering data responds quickly', async ({ page }) => {
  await page.goto('/units');

  // Wait for page to load
  await page.waitForSelector('[role="listitem"]');

  // Perform search
  const searchInput = page.getByPlaceholder('Search units');
  if (await searchInput.isVisible()) {
    const startTime = Date.now();
    await searchInput.fill('test');
    await searchInput.press('Enter');

    // Wait for results to update
    await page.waitForTimeout(500);

    const searchTime = Date.now() - startTime;
    console.log(`Search time: ${searchTime}ms`);

    expect(searchTime).toBeLessThan(2000);
  }
});
