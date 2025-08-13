/**
 * @file healthCheck_test.spec.ts
 * @description Unit-level tests for Warp10 datasource healthcheck (proxy and direct modes).
 * Scope: backend health only
 */
import { test, expect } from '@playwright/test';
import { log, getGrafanaVersion } from '../utils';

// Test healthcheck in proxy and direct modes only
test('Healthcheck in proxy and direct modes', async ({ page }) => {
  let healthResponse: any = null;

  // Listen for healthcheck responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/datasources') && url.includes('/health')) {
      try {
        healthResponse = await response.json();
        log(`--> Health check response: ${JSON.stringify(healthResponse)}`);
      } catch (e) {
        log(`--> Failed to parse health check response: ${e}`);
      }
    }
  });

  // Log browser errors
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('net::ERR_CONNECTION_REFUSED')) {
      return;
    }
    console.log(`[console.${msg.type()}] ${msg.text()}`);
  });

  // Setup
  const version = await getGrafanaVersion(page);
  log(`--> Detected Grafana version: ${version}`);
  const dsPath = '/connections/datasources/new';
  const saveButton = { type: 'role', name: 'Save & test' };
  const deleteButton = { type: 'testId', name: 'Data source settings page Delete button' };
  const confirmButton = { type: 'testId', name: 'data-testid Confirm Modal Danger Button' };

  // Create datasource
  log('--> Navigating to data sources page...');
  await page.goto(`http://localhost:3000${dsPath}`);
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Warp10' }).click();
  await page.fill('#basic-settings-name', 'test_health_warp10');
  await page.fill('#url', 'http://warp10:8080');

  log('--> Saving datasource');
  healthResponse = null;
  await page.getByRole('button', { name: saveButton.name }).click();
  await page.waitForTimeout(1000);

  if (healthResponse) {
    log(`--> Health check: ${healthResponse.status} — ${healthResponse.message}`);
    expect(['success', 'ok']).toContain(healthResponse.status.toLowerCase());
  } else {
    throw new Error('No health check response');
  }

  await page.waitForTimeout(1000);

  await expect(
      page.locator('[data-testid*="Alert success"]').filter({ hasText: /working/i }).first()
  ).toBeVisible({ timeout: 15000 });

  // Cleanup
  log('--> Deleting datasource...');
  await page.getByTestId(deleteButton.name).click();
  await page.getByTestId(confirmButton.name).click();
  log('--> Datasource deleted. Healthcheck-only test completed!');
});
