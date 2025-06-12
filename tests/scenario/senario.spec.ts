/**
 * @file scenario.spec.ts
 * @description End-to-end test for a basic usage scenario.
 * This test covers the full flow of creating a Warp10 datasource, creating a dashboard,
 * selecting the datasource, injecting a basic query, and validating a successful response.
 * sometimes delays added are extremely important for the page to load as it should so we shouldn't try to modify or decrease it
 *
 * Scope: scenario (integration)
 */
import { test } from '@playwright/test';
import { log, getGrafanaVersion, clickAddPanelButton, FinalTestValidation, testDatasourceInvalidURL } from '../utils';

// Main test scenario
test('Basic scenario: Create DS, Dashboard, Select Datasource, Get Warp10 Response', async ({ page }) => {
  const responses: any[] = [];
  let healthResponse: any = null;

  // Capture network responses
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

  // Detect Grafana version and setup paths/buttons accordingly
  const version = await getGrafanaVersion(page);
  log(`--> Detected Grafana version: ${version}`);

  const basePath = '/connections/datasources/new';

  const saveButton = { type: 'role', name: 'Save & test' };

  const saveButtonName = 'Save & test';

  const myDsPath = '/connections/datasources';

  const deleteButton = page.getByTestId('Data source settings page Delete button');

  const confirmButton = page.getByTestId('data-testid Confirm Modal Danger Button');

  // === Step 1: Create datasource ===
  log('--> Creating new Warp10 datasource');
  await page.goto(`http://localhost:3000${basePath}`);
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Warp10' }).click();

  // Fill datasource config
  log('--> Filling datasource config');
  await page.fill('#basic-settings-name', 'test_warp10');

  // Fill invalid URL first and test error
  log('--> Attempting to save and test datasource with invalid URL...');
  await testDatasourceInvalidURL(page, saveButton);

  log('--> Filling Warp10 URL 8080');
  // Correct URL for the actual test run
  const urlInput = page.locator('#url');
  await urlInput.fill('http://warp10:8080');
  const currentValue = await urlInput.inputValue();
  log(`--> Warp10 URL set to: ${currentValue}`);

  // Save and test
  log('--> Saving and testing datasource...');
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: saveButtonName }).click();
  await page.waitForTimeout(1000);

  if (healthResponse) {
    log(`--> Health check passed: ${healthResponse.message}`);
  } else {
    log('--> Health check response was not received.');
  }

  // === Step 2: Build dashboard ===
  log('--> Opening dashboard creation wizard');
  await page.getByRole('link', { name: 'Build a dashboard' }).click();
  await page.waitForTimeout(500);

  log('--> Creating new panel');
  await clickAddPanelButton(page);
  await page.waitForTimeout(500);

  log('--> Selecting created datasource');
  await page.locator('[data-testid="data-source-card"] span', { hasText: 'test_warp10' }).click();
  await page.waitForTimeout(500);

  log('--> Injecting Warp10 query into editor');
  await page.locator('.query-editor-row textarea').first().fill('1 2 +');

  log('--> Triggering query execution');
  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(500);

  // === Step 3: Validate results ===
  log('--> Validating last query response...');
  await FinalTestValidation(responses);

  // === Step 4: Cleanup (delete DS) ===
  log('--> Navigating to datasource management page');
  await page.goto(`http://localhost:3000${myDsPath}`);
  await page.getByRole('link', { name: 'test_warp10' }).click();
  await page.waitForTimeout(500);

  log('--> Deleting datasource...');
  await deleteButton.click();
  await confirmButton.click();
  log('--> Datasource deleted successfully');

  log('--> Scenario test completed!');
});
