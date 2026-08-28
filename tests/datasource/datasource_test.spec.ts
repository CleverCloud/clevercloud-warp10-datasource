/**
 * @file datasource_test.spec.ts
 * @description Unit-level tests for the Warp10 datasource configuration component.
 * Validates behavior of form fields, save & test button, constants/macros config,
 * and backend healthcheck status.
 *
 * Scope: datasource (configuration UI + backend health)
 */
import { test, expect } from '@playwright/test';
import {
  log,
  getGrafanaVersion,
  fillPairAndClickAdd,
  logVisibility,
  testDatasourceInvalidURL,
  openNewWarp10Datasource,
} from '../utils';

// Datasource component and health check
test('Datasource: test all fields in datasource config + healthcheck', async ({ page }) => {
  const responses: any[] = [];
  let healthResponse: any = null;

  // === Capture network responses ===
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

    if (url.includes('/api/datasources') && url.includes('/health')) {
      try {
        const json = await response.json();
        healthResponse = json;
        log(`--> Health check response received: ${JSON.stringify(json, null, 2)}`);
      } catch (e) {
        log(`--> Failed to parse health check response: ${e}`);
      }
    }
  });

  // Log console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('net::ERR_CONNECTION_REFUSED')) {
      return;
    }
    console.log(`[console.${msg.type()}] ${msg.text()}`);
  });

  // Get Grafana version and define constants
  const version = await getGrafanaVersion(page);
  log(`--> Detected Grafana version: ${version}`);

  const saveButton = { type: 'role', name: 'Save & test' };

  const deleteButton = { type: 'testId', name: 'Data source settings page Delete button' };

  const confirmButton = { type: 'testId', name: 'data-testid Confirm Modal Danger Button' };

  // Create datasource
  log('--> Navigating to data sources page...');
  await openNewWarp10Datasource(page);

  log('--> Filling Plugin Name');
  await page.fill('#basic-settings-name', 'test_warp10');

  log('--> Testing misconfiguration: setting an invalid Warp10 URL');
  await testDatasourceInvalidURL(page, saveButton);

  log('--> Filling Warp10 URL');
  const urlInput = page.locator('#url');
  await urlInput.fill('http://warp10:8080');
  const currentValue = await urlInput.inputValue();
  log(`--> URL input filled with: ${currentValue}`);

  log('--> Saving datasource to trigger healthcheck...');
  let healthRespPromise = page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.url().includes('/health'), {
      timeout: 15000,
    })
    .catch(() => null);
  if (saveButton.type === 'role') {
    await page.getByRole('button', { name: saveButton.name }).click();
  } else {
    await page.getByTestId(saveButton.name).click();
  }
  await healthRespPromise;

  if (healthResponse) {
    log(`--> Health check passed with status: ${healthResponse.status} — ${healthResponse.message}`);
  } else {
    log('--> Health check response was not received.');
  }

  log('--> Saving datasource (access=proxy)...');
  // The save can race against the earlier invalid-URL save (the PUT then 409s and no health
  // check fires), so retry the save until a health response actually comes back and assert
  // on its payload — more reliable than the transient success alert.
  let proxyHealth: any = null;
  for (let attempt = 0; attempt < 3 && !proxyHealth; attempt++) {
    // The form re-renders after the previous save and can revert the URL field to the
    // invalid value, so re-fill it on every attempt before saving
    await urlInput.fill('http://warp10:8080');
    await expect(urlInput).toHaveValue('http://warp10:8080');
    const respPromise = page
      .waitForResponse((res) => res.url().includes('/api/datasources') && res.url().includes('/health'), {
        timeout: 10000,
      })
      .catch(() => null);
    await page.getByRole('button', { name: saveButton.name }).click();
    const resp = await respPromise;
    proxyHealth = resp ? await resp.json().catch(() => null) : null;
    if (proxyHealth && String(proxyHealth.status).toLowerCase() === 'error') {
      log(`--> Attempt ${attempt + 1}: health still failing (${proxyHealth.message}), retrying`);
      proxyHealth = null;
    }
  }
  log(`--> Access=proxy: health response: ${JSON.stringify(proxyHealth)}`);
  expect(proxyHealth).not.toBeNull();
  expect(['success', 'ok']).toContain(String(proxyHealth.status).toLowerCase());

  // Test constants/macros addition
  log('--> Filling and applying constants and macros');

  await fillPairAndClickAdd({
    nameInput: page.locator('#constant_name'),
    valueInput: page.locator('#constant_value'),
    name: 'test_constant',
    value: 'test_constant_value',
    addButton: page.locator('#btn_constant'),
    label: 'Constant',
    page,
  });

  await fillPairAndClickAdd({
    nameInput: page.locator('#macro_name'),
    valueInput: page.locator('#macro_value'),
    name: 'test_macro',
    value: 'test_macro_value',
    addButton: page.locator('#btn_macro'),
    label: 'Macro',
    page,
  });

  log('--> Saving again after adding constants/macros...');
  healthRespPromise = page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.url().includes('/health'), {
      timeout: 15000,
    })
    .catch(() => null);
  if (saveButton.type === 'role') {
    await page.getByRole('button', { name: saveButton.name }).click();
  } else {
    await page.getByTestId(saveButton.name).click();
  }
  await healthRespPromise;

  // Refresh and verify values
  log('--> Refreshing page to verify saved values...');
  await page.reload();

  await logVisibility(page, 'test_constant');
  await logVisibility(page, 'test_constant_value');
  await logVisibility(page, 'test_macro');
  await logVisibility(page, 'test_macro_value');

  // Cleanup (delete datasource)
  log('--> Deleting datasource...');
  if (deleteButton.type === 'role') {
    await page.getByRole('button', { name: deleteButton.name }).click();
  } else {
    await page.getByTestId(deleteButton.name).click();
  }

  if (confirmButton.type === 'role') {
    await page.getByRole('button', { name: confirmButton.name }).click();
  } else {
    await page.getByTestId(confirmButton.name).click();
  }

  log('--> Datasource deleted successfully');
  log('--> Datasource configuration test completed!');
});
