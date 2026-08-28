/**
 * @file healthCheck_test.spec.ts
 * @description Unit-level tests for Warp10 datasource healthcheck (proxy and direct modes).
 * Scope: backend health only
 */
import { test, expect } from '@playwright/test';
import { log, getGrafanaVersion, openNewWarp10Datasource } from '../utils';

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
  const saveButton = { type: 'role', name: 'Save & test' };
  const deleteButton = { type: 'testId', name: 'Data source settings page Delete button' };
  const confirmButton = { type: 'testId', name: 'data-testid Confirm Modal Danger Button' };

  // Create datasource in proxy mode
  log('--> Navigating to data sources page...');
  await openNewWarp10Datasource(page);
  await page.fill('#basic-settings-name', 'test_health_warp10');
  await page.fill('#url', 'http://warp10:8080');

  log('--> Saving datasource in proxy mode...');
  let healthRespPromise = page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.url().includes('/health'), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.getByRole('button', { name: saveButton.name }).click();
  // The page.on('response') listener parses the body asynchronously and may not have run yet,
  // so read the health payload straight from the awaited response
  const proxyHealthResp = await healthRespPromise;
  if (!healthResponse && proxyHealthResp) {
    healthResponse = await proxyHealthResp.json().catch(() => null);
  }

  if (healthResponse) {
    log(`--> [proxy] Health check: ${healthResponse.status} — ${healthResponse.message}`);
    expect(['success', 'ok']).toContain(healthResponse.status.toLowerCase());
  } else {
    throw new Error('No health check response (proxy mode)');
  }

  log('--> Saving datasource again (proxy mode)...');
  healthResponse = null;
  healthRespPromise = page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.url().includes('/health'), {
      timeout: 15000,
    })
    .catch(() => null);
  await page.getByRole('button', { name: saveButton.name }).click();
  await healthRespPromise;

  try {
    // Several success alerts can stack up (the "updated" toast plus one per health check),
    // so target the health-check one by its text and tolerate duplicates
    const alert = page.locator('[data-testid="data-testid Alert success"]').filter({ hasText: /working/i }).first();
    await expect(alert).toBeVisible({ timeout: 15000 });
    const alertTextProxy = (await alert.textContent())?.trim() || '';
    log(`--> [proxy] Alert: "${alertTextProxy}"`);
    expect(alertTextProxy.toLowerCase()).toContain('working');
  } catch (e) {
    log(`--> [proxy] success alert failure: ${(e as Error).message}`);
    throw new Error('Expected success alert for access=proxy (after switching back)');
  }

  // Cleanup
  log('--> Deleting datasource...');
  await page.getByTestId(deleteButton.name).click();
  await page.getByTestId(confirmButton.name).click();
  log('--> Datasource deleted. Healthcheck-only test completed!');
});
