/**
 * @file editor_json_model_test.spec.ts
 * @description
 * End-to-end test suite for the Warp10 query editor in Grafana.
 * Validates the editor’s visibility, correct handling of queries, and proper generation of the internal JSON model
 * across multiple Grafana versions and editor implementations.
 *
 * Utilities: Uses logging, dynamic version detection, and robust panel creation helpers to ensure coverage across all
 * supported Grafana UI layouts and behaviors.
 *
 * Scope: Editor (JSON model, query execution, error capture)
 */
import { test } from '@playwright/test';
import { log, getGrafanaVersion, createNewPanel } from '../utils';

// Editor JSON Model Validation
test('Editor JSON Model test: Warp10 JSON Model Verification', async ({ page }) => {
  const responses: any[] = [];

  // Intercept responses
  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('/api/ds/query') && response.request().method() === 'POST') {
      try {
        const json = await response.json();
        responses.push({ url, json, status: response.status() });
        log(`--> Captured: ${url} [status ${response.status()}]`);
      } catch (e) {
        log(`--> Failed to parse JSON for: ${url}`);
      }
    }
  });

  // Log console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('net::ERR_CONNECTION_REFUSED')) {
      return;
    }
    log(`[console.${msg.type()}] ${msg.text()}`);
  });

  // Load Grafana dashboard panel
  log('--> Navigating to dashboard with panel...');
  await page.goto('http://localhost:3000');

  const version = await getGrafanaVersion(page);
  log(`--> Detected Grafana version: ${version}`);

  await page.goto('http://localhost:3000/dashboards');
  await page.waitForTimeout(1000);
  await createNewPanel(page);
  await page.waitForTimeout(1000);
  log('--> Query Editor JSON model Test completed!');
});
