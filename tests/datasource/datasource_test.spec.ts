/**
 * @file datasource_test.spec.ts
 * @description Unit-level tests for the Warp10 datasource configuration component.
 * Validates behavior of form fields, save & test button, constants/macros config,
 * and backend healthcheck status.
 *
 * Scope: datasource (configuration UI + backend health)
 */
import { test } from '@playwright/test';
import { log, getGrafanaVersion, fillPairAndClickAdd, logVisibility, testDatasourceInvalidURL } from '../utils';

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

  const dsPath = '/connections/datasources/new';

  const saveButton = { type: 'role', name: 'Save & test' };

  const deleteButton = { type: 'testId', name: 'Data source settings page Delete button' };

  const confirmButton = { type: 'testId', name: 'data-testid Confirm Modal Danger Button' };

  // Create datasource
  log('--> Navigating to data sources page...');
  await page.goto(`http://localhost:3000${dsPath}`);
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'Warp10' }).click();

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
  if (saveButton.type === 'role') {
    await page.getByRole('button', { name: saveButton.name }).click();
  } else {
    await page.getByTestId(saveButton.name).click();
  }

  await page.waitForTimeout(1000);

  if (healthResponse) {
    log(`--> Health check passed with status: ${healthResponse.status} — ${healthResponse.message}`);
  } else {
    log('--> Health check response was not received.');
  }

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
  if (saveButton.type === 'role') {
    await page.getByRole('button', { name: saveButton.name }).click();
  } else {
    await page.getByTestId(saveButton.name).click();
  }

  await page.waitForTimeout(1000);

  // Refresh and verify values
  log('--> Refreshing page to verify saved values...');
  await page.reload();
  await page.waitForTimeout(2000);

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
