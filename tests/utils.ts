import { expect, Page, Request as PWRequest, Response as PWResponse } from '@playwright/test';
import { Locator } from 'playwright';

export function log(message: string) {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  console.log(`[${now}] ${message}`);
}

export async function getGrafanaVersion(page: Page): Promise<string> {
  const resp = await page.request.get('http://localhost:3000/api/health');
  const body = await resp.json();
  return body.version;
}

async function openDashboardEdit(page: Page) {
  const editBtn = page.locator('button[data-testid="data-testid Edit dashboard button"]');
  if ((await editBtn.count()) && (await editBtn.first().isVisible())) {
    await editBtn.first().click();
    log('--> Clicked "Edit dashboard"');
    // Wait for the edit UI to load
    await page.waitForTimeout(200);
  } else {
    log('--> Edit button not found or not visible (maybe already in edit mode or old Grafana version)');
  }

  // Now, try to open dashboard settings using known selectors.
  await clickDashboardSettingsButton(page);
}

function isVersionGreaterOrEqual(v: string, target: string): boolean {
  const vParts = v.split('.').map(Number);
  const tParts = target.split('.').map(Number);
  for (let i = 0; i < tParts.length; i++) {
    if ((vParts[i] ?? 0) > tParts[i]) {
      return true;
    }
    if ((vParts[i] ?? 0) < tParts[i]) {
      return false;
    }
  }
  return true;
}

async function isInDashboardSettings(page: Page) {
  const selectors = [
    'button[data-testid="data-testid Dashboard settings page delete dashboard button"]',
    'button[aria-label="Dashboard settings page delete dashboard button"]',
    'button:has-text("Delete Dashboard")',
    'button:has-text("Delete dashboard")',
    'button.css-ttl745-button:has-text("Delete Dashboard")', // for class-based
    'button.css-ttl745-button:has-text("Delete dashboard")',
  ];
  for (const sel of selectors) {
    if ((await page.locator(sel).count()) > 0) {
      return true;
    }
  }
  return false;
}

async function clickDashboardSettingsButton(page: Page) {
  log('--> Trying to open dashboard settings');
  if (
    (await page.locator('button[data-testid="data-testid Dashboard settings page delete dashboard button"]').count()) >
    0
  ) {
    log('--> Already in dashboard settings, skipping settings button');
    return;
  }
  const byTestId = await page.$('button[data-testid="data-testid Dashboard settings"]');
  if (byTestId) {
    await byTestId.click();
    log('--> Clicked dashboard settings (data-testid)');
    return;
  }
  const byRole = page.getByRole('button', { name: 'Dashboard settings' });
  if ((await byRole.count()) > 0) {
    await byRole.first().click();
    log('--> Clicked dashboard settings (role/name)');
    return;
  }
  throw new Error('Dashboard settings button not found for any known selector.');
}

async function clickDeleteDashboardButton(page: Page, version: string) {
  // Always open settings first for all recent Grafana versions!
  await openDashboardSettingsForDelete(page);

  // Try all known delete button selectors
  const selectors = [
    'button[data-testid="data-testid Dashboard settings page delete dashboard button"]',
    'button[aria-label="Dashboard settings page delete dashboard button"]',
    'button:has-text("Delete dashboard")',
    'button.css-ttl745-button:has-text("Delete dashboard")',
  ];

  let deleteClicked = false;
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      log(`--> Clicked Delete Dashboard button using selector: ${sel}`);
      deleteClicked = true;
      break;
    }
  }
  if (!deleteClicked) {
    throw new Error('Delete dashboard button not found for any known selector');
  }

  // Confirm input if needed
  if (isVersionGreaterOrEqual(version, '10.2.0')) {
    const deleteInput = page.locator('input[placeholder="Type \\"Delete\\" to confirm"]');
    if (await deleteInput.count()) {
      await deleteInput.fill('Delete');
      log('--> Typed "Delete" in confirmation input');
    }
  }

  // Confirm deletion (all versions)
  const confirmBtn = page.getByTestId('data-testid Confirm Modal Danger Button');
  if (await confirmBtn.count()) {
    await confirmBtn.click();
    log('--> Confirmed dashboard deletion');
  } else {
    // fallback
    const altConfirm = page.locator('button:has-text("Delete")');
    if (await altConfirm.count()) {
      await altConfirm.click();
      log('--> Confirmed dashboard deletion (by text)');
    } else {
      log('Confirm deletion button not found for dashboard');
    }
  }
}

export async function clickAddPanelButton(page: Page) {
  const selectors = [
    '[data-testid="data-testid Create new panel button"]',
    '[data-testid="add-panel-button"]',
    'button[aria-label="Add new panel"]',
    'button:has-text("Add visualization")',
  ];

  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      log(`--> Clicked Add Panel button with selector: ${sel}`);
      return;
    }
  }

  throw new Error('Could not find "Add Panel" button for any known selector or Grafana version.');
}

export async function setupDatasource(page: Page, dsName: string) {
  log('--> Creating test datasource');
  await page.goto('http://localhost:3000/connections/datasources/new');
  await page.getByRole('button', { name: 'Warp10' }).click();
  log('--> Clicked "Warp10" datasource');
  await page.fill('#basic-settings-name', dsName);
  log(`--> Entered datasource name: ${dsName}`);
  await page.fill('#url', 'http://warp10:8080');
  log('--> Entered datasource URL');
  await page.getByRole('button', { name: 'Save & test' }).click();
  log('--> Clicked "Save & test"');
  await page.waitForTimeout(1000);
  log('--> Datasource setup complete');
}

type SelectorMethod =
  | { method: 'role'; role: string; name: string }
  | { method: 'testId'; testId: string }
  | { method: 'text'; text: string }
  | { method: 'css'; css: string };

async function openDashboardSettingsForDelete(page: Page) {
  if (await isInDashboardSettings(page)) {
    log('--> Already in dashboard settings page (delete button visible), skipping settings button click');
    return;
  }
  const selectors = [
    'button[aria-label="Dashboard settings"]',
    'button[data-testid="data-testid Dashboard settings"]',
    'button[aria-label="Dashboard settings (old)"]',
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      log(`--> Clicked dashboard settings with selector: ${sel}`);
      await page.waitForTimeout(300);
      return;
    }
  }
  throw new Error('Dashboard settings button not found for any known selector, and not already in settings.');
}

async function openDashboardByTitle(page: Page, dashboardTitle: string) {
  let dash = page.getByText(dashboardTitle, { exact: true });
  if (await dash.count()) {
    await dash.first().click();
    log(`--> Opened dashboard "${dashboardTitle}" (top-level)`);
    return;
  }
  const generalSection = page.getByText('General', { exact: true });
  if (await generalSection.count()) {
    await generalSection.first().click();
    log('--> Opened "General" folder');
    // Wait a little for dashboards to appear after folder click
    await page.waitForTimeout(300);
    dash = page.getByText(dashboardTitle, { exact: true });
    if (await dash.count()) {
      await dash.first().click();
      log(`--> Opened dashboard "${dashboardTitle}" (in General)`);
      return;
    }
  }
  throw new Error(`Dashboard "${dashboardTitle}" not found in root or General folder.`);
}

async function clickSaveDashboardButton(page: Page) {
  const selectors: SelectorMethod[] = [
    { method: 'role', role: 'button', name: 'Dashboard settings aside actions Save button' },
    { method: 'testId', testId: 'data-testid Save dashboard button' },
    { method: 'text', text: 'Save dashboard' },
    { method: 'css', css: 'button:has-text("Save dashboard")' },
  ];

  for (const sel of selectors) {
    try {
      let btn;
      if (sel.method === 'role') {
        btn = page.getByRole('button', { name: sel.name });
      } else if (sel.method === 'testId') {
        btn = page.getByTestId(sel.testId);
      } else if (sel.method === 'text') {
        btn = page.getByText(sel.text, { exact: true });
      } else if (sel.method === 'css') {
        btn = page.locator(sel.css);
      }
      if (btn && (await btn.count()) && (await btn.first().isVisible())) {
        await btn.first().click();
        log(`--> Clicked Save Dashboard button using ${sel.method} selector`);
        return;
      }
    } catch (e) {
      // Try next
    }
  }
  throw new Error('No Save Dashboard button found for any known selector or Grafana version.');
}

async function clickDashboardFinalSaveButton(page: Page) {
  const selectors = [
    { method: 'role', role: 'button', name: 'Save dashboard button' },
    { method: 'testId', testId: 'data-testid Save dashboard drawer button' },
    { method: 'testId', testId: 'data-testid Save dashboard button' },
    { method: 'text', text: 'Save' },
    { method: 'css', css: 'button:has-text("Save")' },
  ];

  for (const sel of selectors) {
    try {
      let btn;
      if (sel.method === 'role' && sel.name) {
        btn = page.getByRole('button', { name: sel.name });
      } else if (sel.method === 'testId' && sel.testId) {
        btn = page.getByTestId(sel.testId);
      } else if (sel.method === 'text' && sel.text) {
        btn = page.getByText(sel.text, { exact: true });
      } else if (sel.method === 'css' && sel.css) {
        btn = page.locator(sel.css);
      }
      if (btn && (await btn.count()) && (await btn.first().isVisible())) {
        await btn.first().click();
        log(
          `--> Clicked Save button using ${sel.method}${sel.testId ? ' ' + sel.testId : sel.name ? ' ' + sel.name : ''}`
        );
        return;
      }
    } catch (e) {}
  }
  throw new Error('No "Save" dashboard button found for any known selector or Grafana version.');
}

export async function createDashboardWithQueryVariable(
  page: Page,
  dsName: string,
  varName: string,
  varQuery: string,
  dashboardTitle: string
) {
  log('--> Creating dashboard with Query variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await page.waitForTimeout(500);

  // Open Dashboard settings
  await clickDashboardSettingsButton(page);
  await page.getByText('Variables').click();
  log('--> Clicked "Variables" tab');
  await page.getByRole('button', { name: 'Add variable' }).click();
  log('--> Clicked "Add variable"');

  // Set variable type to "Query"
  await page.click('input[id^="variable-select-input-Select variable type"]');
  log('--> Clicked type input for variable type selection');
  await page.fill('input[id^="variable-select-input-Select variable type"]', 'Query');
  log('--> Set variable type to "Query"');

  // Set variable name
  await page.fill('[data-testid="data-testid Variable editor Form Name field"]', varName);
  log(`--> Set variable name to "${varName}"`);

  // Select the datasource
  await page.click('input[aria-label="Select a data source"]');
  log('--> Clicked datasource input');
  await page.getByText(dsName, { exact: true }).click();
  log(`--> Selected datasource: ${dsName}`);

  // Set the query for the variable
  const textarea = await getVariableQueryTextarea(page);
  await textarea.fill(varQuery);
  log(`--> Set query for variable: "${varQuery}"`);

  // Save the variable
  await page.getByTestId('data-testid Variable editor Apply button').click();
  log('--> Clicked "Apply" to save variable');

  // Save the dashboard
  await clickSaveDashboardButton(page);
  log('--> Clicked save');
  await page.waitForTimeout(1000);
  await page.fill('input[aria-label="Save dashboard title field"]', dashboardTitle);
  log(`--> Set dashboard title: "${dashboardTitle}"`);
  await clickDashboardFinalSaveButton(page);
  log('--> Clicked "Save dashboard" button');
  log('--> Dashboard with variable created');
}

export async function createDashboardWithConstVariable(
  page: Page,
  dsName: string,
  varName: string,
  constValue: string,
  dashboardTitle: string
) {
  log('--> Creating dashboard with Const variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await page.waitForTimeout(500);

  // Open Dashboard settings
  await clickDashboardSettingsButton(page);
  await page.getByText('Variables').click();
  log('--> Clicked "Variables" tab');
  await page.getByRole('button', { name: 'Add variable' }).click();
  log('--> Clicked "Add variable"');

  // 1. Set variable type first
  await page.click('input[id^="variable-select-input-Select variable type"]');
  log('--> Opened variable type dropdown');
  await page.fill('input[id^="variable-select-input-Select variable type"]', 'Constant');
  log('--> Typed "Constant" into variable type input');
  await page.getByText('Constant', { exact: true }).click();
  log('--> Selected "Constant" from dropdown');

  // 2. Now set variable name (AFTER type)
  await page.fill('[data-testid="data-testid Variable editor Form Name field"]', varName);
  log(`--> Set variable name to "${varName}"`);

  // 3. Set constant value
  await page.fill('[data-testid="data-testid Variable editor Form Constant Query field"]', constValue);
  log(`--> Set constant value to "${constValue}"`);

  // Save the variable
  await page.getByTestId('data-testid Variable editor Apply button').click();
  log('--> Clicked "Apply" to save variable');

  // Save the dashboard
  await clickSaveDashboardButton(page);
  log('--> Clicked save');
  await page.waitForTimeout(1000);
  await page.fill('input[aria-label="Save dashboard title field"]', dashboardTitle);
  log(`--> Set dashboard title: "${dashboardTitle}"`);
  await clickDashboardFinalSaveButton(page);
  log('--> Clicked "Save dashboard" button');
  log('--> Dashboard with const variable created');
}

export async function createDashboardWithCustomMultiVariable(
  page: Page,
  dsName: string,
  varName: string,
  varValues: string[],
  dashboardTitle: string
): Promise<boolean> {
  log('--> Creating dashboard with Custom multi-value variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await page.waitForTimeout(500);

  // Open Dashboard settings
  await clickDashboardSettingsButton(page);
  await page.getByText('Variables').click();
  log('--> Clicked "Variables" tab');
  await page.getByRole('button', { name: 'Add variable' }).click();
  log('--> Clicked "Add variable"');

  // 1. Set variable type first
  await page.click('input[id^="variable-select-input-Select variable type"]');
  log('--> Opened variable type dropdown');
  await page.fill('input[id^="variable-select-input-Select variable type"]', 'Custom');
  log('--> Typed "Custom" into variable type input');
  await page.getByText('Custom', { exact: true }).click();
  log('--> Selected "Custom" from dropdown');

  // 2. Set variable name (AFTER type)
  await page.fill('[data-testid="data-testid Variable editor Form Name field"]', varName);
  log(`--> Set variable name to "${varName}"`);

  // 3. Set values (comma-separated)
  await page.fill('[data-testid="data-testid custom-variable-input"]', varValues.join(','));
  log(`--> Set custom variable values to "${varValues.join(',')}"`);

  // 4. Enable Multi-value
  await page.getByLabel('Multi-value').check();
  log('--> Enabled Multi-value for custom variable');

  // Save the variable
  await page.getByTestId('data-testid Variable editor Apply button').click();
  log('--> Clicked "Apply" to save variable');

  // Save the dashboard
  await clickSaveDashboardButton(page);
  log('--> Clicked save');
  await page.waitForTimeout(1000);
  await page.fill('input[aria-label="Save dashboard title field"]', dashboardTitle);
  log(`--> Set dashboard title: "${dashboardTitle}"`);
  await clickDashboardFinalSaveButton(page);
  log('--> Clicked "Save dashboard" button');
  // --- Add the variable selection code here ---
  let indicator = false;
  const el = page.getByTestId('data-testid template variable');
  if ((await el.count()) > 0 && (await el.isVisible()) && indicator === false) {
    await el.click();
    await page.waitForTimeout(300);
    for (const sensor of ['sensorsB', 'sensorsC']) {
      const option = page.getByText(sensor, { exact: true });
      if (await option.count()) {
        await option.click();
        await page.waitForTimeout(100);
      }
    }
    await page.waitForTimeout(500);
    log('--> Selected all sensors for variable');
  } else {
    log('--> Element data-testid template variable Not Found');
  }

  log('--> Dashboard with custom multi-value variable created');
  return indicator;
}

export async function createDashboardWithIntervalVariable(
  page: Page,
  dsName: string,
  varName: string,
  dashboardTitle: string
) {
  log('--> Creating dashboard with Interval variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await page.waitForTimeout(500);

  // Open Dashboard settings
  await clickDashboardSettingsButton(page);
  await page.getByText('Variables').click();
  log('--> Clicked "Variables" tab');
  await page.getByRole('button', { name: 'Add variable' }).click();
  log('--> Clicked "Add variable"');

  // Set variable type to "Interval"
  await page.click('input[id^="variable-select-input-Select variable type"]');
  log('--> Opened variable type dropdown');
  await page.fill('input[id^="variable-select-input-Select variable type"]', 'Interval');
  log('--> Typed "Interval" into variable type input');
  await page.getByText('Interval', { exact: true }).click();
  log('--> Selected "Interval" from dropdown');

  // Set variable name (default is "interval", but set it explicitly)
  await page.fill('[data-testid="data-testid Variable editor Form Name field"]', varName);
  log(`--> Set interval variable name to "${varName}"`);

  // Save the variable
  await page.getByTestId('data-testid Variable editor Apply button').click();
  log('--> Clicked "Apply" to save interval variable');

  // Save the dashboard
  await clickSaveDashboardButton(page);
  log('--> Clicked save');
  await page.waitForTimeout(1000);
  await page.fill('input[aria-label="Save dashboard title field"]', dashboardTitle);
  log(`--> Set dashboard title: "${dashboardTitle}"`);
  await clickDashboardFinalSaveButton(page);
  log('--> Clicked "Save dashboard" button');
  log('--> Dashboard with interval variable created');
}

export async function executeQueryAndCapturePayload(
  page: Page,
  dsName: string,
  query: string
): Promise<{
  payload: any;
  response: PWResponse;
  responseBody: any;
}> {
  log('--> Preparing to execute query in panel');

  await page.waitForTimeout(1000);
  const backBtn = page.locator('button[data-testid="data-testid Back to dashboard button"]');
  if ((await backBtn.count()) && (await backBtn.first().isVisible())) {
    await backBtn.first().click();
    log('--> Clicked "Back to dashboard"');
  } else {
    log('--> "Back to dashboard" button not found or not visible, skipping.');
  }

  await clickAddPanelButton(page);
  log('--> Clicked to add new panel');
  await page.getByText(dsName).click();
  log(`--> Selected datasource: ${dsName}`);
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.fill(query);
  log(`--> Entered query:\n${query}`);

  // Wait for the request and response triggered by clicking "Run"
  const [queryRequest, queryResponse] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/ds/query') && req.method() === 'POST'),
    page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
    page.getByTestId('data-testid RefreshPicker run button').click(),
  ]);
  log('--> Clicked "Run" button');

  // Parse and log the request payload
  let payload: any = null;
  try {
    const postData = queryRequest.postData();
    payload = postData ? JSON.parse(postData) : null;
    log('--> Request payload sent to backend:');
    log(JSON.stringify(payload, null, 2));
  } catch (e) {
    log('--> Failed to parse request payload');
  }
  expect(payload).not.toBeNull();

  // Parse and log backend response body
  let responseBody: any = null;
  try {
    responseBody = await queryResponse.json();
    log('--> Backend response:');
    log(JSON.stringify(responseBody, null, 2));
  } catch (e) {
    log('--> Failed to parse backend response body');
  }

  return { payload, response: queryResponse, responseBody };
}

export async function executeQueryAndCapturePayloadMulti(
  page: Page,
  dsName: string,
  query: string,
  indicator: boolean
): Promise<{
  payload: any;
  response: PWResponse;
  responseBody: any;
}> {
  log('--> Preparing to execute query in panel');

  await page.waitForTimeout(1000);
  const backBtn = page.locator('button[data-testid="data-testid Back to dashboard button"]');
  if ((await backBtn.count()) && (await backBtn.first().isVisible())) {
    await backBtn.first().click();
    log('--> Clicked "Back to dashboard"');
  } else {
    log('--> "Back to dashboard" button not found or not visible, skipping.');
  }

  await clickAddPanelButton(page);
  log('--> Clicked to add new panel');
  await page.getByText(dsName).click();
  log(`--> Selected datasource: ${dsName}`);
  const el = page.getByTestId('data-testid template variable');
  if ((await el.count()) > 0 && (await el.isVisible()) && indicator === false) {
    await el.click();
    await page.waitForTimeout(300);
    for (const sensor of ['sensorB', 'sensorC']) {
      const option = page.getByText(sensor, { exact: true });
      if (await option.count()) {
        await option.click();
        await page.waitForTimeout(100);
      }
    }
    page.getByTestId('data-testid RefreshPicker run button').click();
    await page.waitForTimeout(500);
    log('--> Selected all sensors for variable');
  } else {
    log('--> Element data-testid template variable Not Found');
  }
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.fill(query);
  log(`--> Entered query:\n${query}`);

  await page.waitForTimeout(3000);
  page.getByTestId('data-testid RefreshPicker run button').click();
  // Wait for the request and response triggered by clicking "Run"
  const [queryRequest, queryResponse] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/ds/query') && req.method() === 'POST'),
    page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
    page.getByTestId('data-testid RefreshPicker run button').click(),
  ]);
  log('--> Clicked "Run" button');

  // Parse and log the request payload
  let payload: any = null;
  try {
    const postData = queryRequest.postData();
    payload = postData ? JSON.parse(postData) : null;
    log('--> Request payload sent to backend:');
    log(JSON.stringify(payload, null, 2));
  } catch (e) {
    log('--> Failed to parse request payload');
  }
  expect(payload).not.toBeNull();

  // Parse and log backend response body
  let responseBody: any = null;
  try {
    responseBody = await queryResponse.json();
    log('--> Backend response:');
    log(JSON.stringify(responseBody, null, 2));
  } catch (e) {
    log('--> Failed to parse backend response body');
  }

  return { payload, response: queryResponse, responseBody };
}

export async function executeQueryAndValidate(
  page: Page,
  dsName: string,
  query: string,
  expectedConstantValue?: string
): Promise<{
  payload: any;
  response: PWResponse;
  responseBody: any;
}> {
  log('--> Preparing to execute query in panel');

  // Prepare to capture request & response
  let queryRequest: PWRequest | undefined;
  let queryResponse: PWResponse | undefined;

  // UI steps to create panel and execute query
  await page.waitForTimeout(1000);
  const backBtn = page.locator('button[data-testid="data-testid Back to dashboard button"]');
  if ((await backBtn.count()) && (await backBtn.first().isVisible())) {
    await backBtn.first().click();
    log('--> Clicked "Back to dashboard"');
  } else {
    log('--> "Back to dashboard" button not found or not visible, skipping.');
  }
  await clickAddPanelButton(page);
  log('--> Clicked to add new panel');
  await page.getByText(dsName).click();
  log(`--> Selected datasource: ${dsName}`);
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.fill(query);
  await page.waitForTimeout(1000);
  log(`--> Entered query:\n${query}`);

  // Wait for the request and response triggered by clicking "Run"
  const runPromise = Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/ds/query') && req.method() === 'POST'),
    page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
  ]);
  await page.getByTestId('data-testid RefreshPicker run button').click();
  log('--> Clicked "Run" button');
  [queryRequest, queryResponse] = await runPromise;

  // Parse and log the request payload
  let payload: any = null;
  try {
    const postData = queryRequest.postData();
    payload = postData ? JSON.parse(postData) : null;
    log('--> Request payload sent to backend:');
    log(JSON.stringify(payload, null, 2));
  } catch (e) {
    log('--> Failed to parse request payload');
  }
  expect(payload).not.toBeNull();

  // Check constant in payload if needed
  if (expectedConstantValue) {
    const expr = payload?.queries?.[0]?.expr || '';
    log(`--> Checking if payload expr contains constant value: "${expectedConstantValue}"`);
    expect(expr).toContain(expectedConstantValue);
    log('--> Verified: payload contains the expected constant value.');
  }

  // Parse and log backend response body
  let responseBody: any = null;
  try {
    responseBody = await queryResponse.json();
    log('--> Backend response:');
    log(JSON.stringify(responseBody, null, 2));
  } catch (e) {
    log('--> Failed to parse backend response body');
  }

  return { payload, response: queryResponse, responseBody };
}

export async function findDatasourceLink(page: Page, dsName: string): Promise<Locator> {
  await page.goto('http://localhost:3000/connections/datasources');
  await page.waitForTimeout(1500);

  let dsLocator = page.getByRole('link', { name: dsName });
  if (!(await dsLocator.count())) {
    dsLocator = page.locator(`h2 a:has-text("${dsName}")`);
  }
  if (!(await dsLocator.count())) {
    dsLocator = page.locator(`text="${dsName}"`);
  }
  return dsLocator;
}

export async function cleanupDashboard(page: Page, dashboardTitle: string) {
  log('--> Cleaning up: Deleting dashboard');
  const version = await getGrafanaVersion(page);
  log(`--> Grafana version detected: ${version}`);
  await page.goto('http://localhost:3000/dashboards');
  await page.waitForTimeout(1000);

  await openDashboardByTitle(page, dashboardTitle);
  log(`--> Opened dashboard "${dashboardTitle}"`);

  await page.waitForTimeout(1000);

  await openDashboardEdit(page);

  await clickDeleteDashboardButton(page, version);
  await page.waitForTimeout(500);
  log('--> Confirmed dashboard deletion');
}

async function getVariableQueryTextarea(page: Page) {
  let textarea = page.locator(
    '[data-testid="data-testid Variable editor Form Default Variable Query Editor textarea"]'
  );
  if ((await textarea.count()) > 0 && (await textarea.first().isVisible({ timeout: 2000 }))) {
    log('--> Found textarea by data-testid');
    return textarea.first();
  }
  textarea = page.locator('textarea[aria-label="Variable editor Form Default Variable Query Editor textarea"]');
  if ((await textarea.count()) > 0 && (await textarea.first().isVisible({ timeout: 2000 }))) {
    log('--> Found textarea by aria-label');
    return textarea.first();
  }
  throw new Error('Could not find the variable query textarea using known selectors!');
}

export async function FinalTestValidation(responses: Array<{ url: string; json: any; status: number }>) {
  if (responses.length > 0) {
    const lastResponse = responses[responses.length - 1];
    log('--> Last /api/ds/query response:');
    console.log(JSON.stringify(lastResponse.json, null, 2));

    if (lastResponse.status === 200) {
      log('--> Test completed successfully');
    } else {
      log(`--> Test failed — Last response status: ${lastResponse.status}`);
    }
  } else {
    log('--> No /api/ds/query response captured.');
  }
}

export async function createNewDashboardAndSelectWarp10(page: Page) {
  //Click "Add visualization"
  await clickAddPanelButton(page);
  await page.waitForTimeout(500);
  console.log('--> Clicked "Add visualization"');

  //Select the Warp10-Clever-Cloud datasource
  const warp10Card = page.locator('[data-testid="data-source-card"] span', { hasText: 'Warp10-Clever-Cloud' });
  await warp10Card.first().waitFor({ state: 'visible', timeout: 3000 });
  await warp10Card.first().click();
  console.log('--> Selected "Warp10-Clever-Cloud" datasource');
}

export async function deleteDatasource(
  page: Page,
  dsName: string,
  deleteSelectors: string[] = [
    'button[data-testid="Data source settings page Delete button"]',
    '[data-testid="Data source settings page Delete button"]',
    '[data-testid="data-testid Confirm Modal Danger Button"]',
    'button[data-testid="data-testid Confirm Modal Danger Button"]',
    'button:has-text("Delete")',
  ]
) {
  log(`--> Attempting to remove datasource "${dsName}"`);
  const dsLocator = await findDatasourceLink(page, dsName);

  if (await dsLocator.count()) {
    await dsLocator.first().click();
    log(`--> Opened datasource settings for "${dsName}"`);

    let deleteBtn;
    for (const sel of deleteSelectors) {
      deleteBtn = await page.$(sel);
      if (deleteBtn) {
        await deleteBtn.click();
        log(`--> Clicked Delete datasource button using selector: ${sel}`);
        break;
      }
    }

    // Confirm deletion, handling both testId and text cases
    const confirmBtn = page.getByTestId('data-testid Confirm Modal Danger Button');
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      log('--> Confirmed datasource deletion');
    } else {
      const altConfirm = page.locator('button:has-text("Delete")');
      if (await altConfirm.count()) {
        await altConfirm.click();
        log('--> Confirmed datasource deletion (by text)');
      } else {
        log('Confirm deletion button not found for datasource');
      }
    }
  } else {
    log(`Datasource "${dsName}" not found for removal`);
  }
}

export async function addConstantToDatasource(page: Page, dsName: string, constName: string, constValue: string) {
  await deleteDatasource(page, dsName);
  log('--> Navigating to new datasource creation');
  await page.goto('http://localhost:3000/connections/datasources/new');
  await page.getByRole('button', { name: 'Warp10' }).click();

  log('--> Configuring basic settings');
  await page.fill('#basic-settings-name', dsName);
  await page.fill('#url', 'http://warp10:8080');

  log('--> Adding constant');
  await page.locator('#constant_name').fill(constName);
  await page.locator('#constant_value').fill(constValue);
  await page.locator('#btn_constant').click();
  await page.waitForTimeout(1000);

  log('--> Saving datasource');
  await page.getByRole('button', { name: 'Save & test' }).click();
  await page.waitForTimeout(1500);
}

export async function createDashboardAndRunQuery(
  page: Page,
  dsName: string,
  expr: string,
  { expectConstant, returnResponse }: { expectConstant?: string; returnResponse?: boolean } = {}
) {
  log('--> Creating dashboard and panel');
  await page.goto('http://localhost:3000/dashboard/new');
  await page.waitForTimeout(500);

  await clickAddPanelButton(page);
  await page.waitForTimeout(500);

  log('--> Selecting datasource');
  await page.getByText(dsName, { exact: true }).click();
  await page.waitForTimeout(500);

  await page.locator('.query-editor-row textarea').fill(expr);

  log('--> Running query and capturing request...');
  const runButton = page.getByTestId('data-testid RefreshPicker run button');
  let request: PWRequest;
  let response: PWResponse | undefined;

  if (returnResponse) {
    [request, response] = (await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/ds/query') &&
          req.method() === 'POST' &&
          (!expectConstant || (req.postData() || '').includes(expectConstant))
      ),
      page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
      runButton.click(),
    ])) as [PWRequest, PWResponse, void];
  } else {
    [request] = (await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/ds/query') &&
          req.method() === 'POST' &&
          (!expectConstant || (req.postData() || '').includes(expectConstant))
      ),
      runButton.click(),
    ])) as [PWRequest, void];
  }

  const payload = JSON.parse(request.postData() || '{}');
  log('--> Request payload captured:');
  console.log(JSON.stringify(payload, null, 2));

  if (expectConstant) {
    expect(payload.queries?.[0]?.expr).toContain(expectConstant);
    log(`--> Constant ${expectConstant} found in payload: test PASSED`);
  }

  return returnResponse && response ? await response.json() : undefined;
}

export async function goToDashboard(page: Page, dashboardName: string) {
  const directDashboard = page.getByRole('link', { name: dashboardName });
  if ((await directDashboard.count()) > 0 && (await directDashboard.first().isVisible())) {
    await directDashboard.first().click();
    console.log('Clicked direct "${dashboardName}" link.');
    return;
  }

  const generalLink = page.getByText('General', { exact: true });
  if ((await generalLink.count()) > 0 && (await generalLink.first().isVisible())) {
    await generalLink.first().click();
    console.log('Clicked "General" section.');

    const nestedDashboard = page.getByText(dashboardName, { exact: true });
    if ((await nestedDashboard.count()) > 0 && (await nestedDashboard.first().isVisible())) {
      await nestedDashboard.first().click();
      console.log('Clicked nested "${dashboardName}".');
      return;
    }
  }

  throw new Error(`Neither "${dashboardName}" nor "General > ${dashboardName}" was found.`);
}

export async function goToNewDashboard(page: Page) {
  goToDashboard(page, "New dashboard");
}

export async function createNewPanel(page: Page, panelTitle = 'Test Editor JSON', panelQuery = '1 2 +') {
  // Step 1: Go to a new dashboard
  log('--> Navigating to a new dashboard');
  await goToNewDashboard(page);
  await page.waitForTimeout(500);

  // Step 2: If "Edit" is needed, click it
  // Some Grafana versions require you to enter edit mode before adding a panel
  const editBtn = page.getByTestId('data-testid Edit dashboard button');
  if ((await editBtn.count()) > 0 && (await editBtn.first().isVisible())) {
    log('--> "Edit" button found, clicking it first');
    await editBtn.first().click();
    await page.waitForTimeout(500);
  } else {
    log('--> "Edit" button not present, proceeding directly to "Add"');
  }

  // Step 3: Click "Add" then "Add new visualization"
  log('--> Looking for "Add" button (classic selector)');
  let addBtn = page.getByTestId('data-testid Add button');
  if (!(await addBtn.count())) {
    log('--> "Add" button not found with classic selector, trying alternate selector');
    addBtn = page.getByTestId('data-testid Add panel button');
    if (!(await addBtn.count())) {
      throw new Error('--> Could not find "Add" button by any known selector');
    } else {
      log('--> "Add" button found with alternate selector');
    }
  } else {
    log('--> "Add" button found with classic selector');
  }
  await addBtn.first().waitFor({ state: 'visible', timeout: 3000 });
  await addBtn.first().click();

  log('--> Clicking "Add new visualization" button');
  const addVisBtn = page.getByTestId('data-testid Add new visualization menu item');
  await addVisBtn.first().waitFor({ state: 'visible', timeout: 3000 });
  await addVisBtn.first().click();
  await page.waitForTimeout(1000);

  // Step 4: Fill panel title and query
  log('--> Setting panel title');
  let titleInput = page.locator('input[data-testid="data-testid Panel editor option pane field input Title"]');
  if (!(await titleInput.count())) {
    log('--> Title input with data-testid not found, trying #PanelFrameTitle');
    titleInput = page.locator('input#PanelFrameTitle');
    if (!(await titleInput.count())) {
      log('--> #PanelFrameTitle not found, trying generic input inside [data-testid="input-wrapper"]');
      titleInput = page.locator('[data-testid="input-wrapper"] input');
      if (!(await titleInput.count())) {
        throw new Error('--> Could not find title input by any known selector');
      } else {
        log('--> Title input found with generic selector inside input-wrapper');
      }
    } else {
      log('--> Title input found with #PanelFrameTitle');
    }
  } else {
    log('--> Title input found with data-testid');
  }
  await titleInput.waitFor({ state: 'visible', timeout: 2000 });
  await titleInput.fill(panelTitle);

  log('--> Checking if datasource picker is present');

  const dsPicker = page.locator('input[data-testid="Select a data source"], input#data-source-picker');
  if ((await dsPicker.count()) && (await dsPicker.first().isVisible())) {
    log('--> Datasource picker found, selecting "Warp10-Clever-Cloud"');
    await dsPicker.first().click();
    const option = page.locator('text=Warp10-Clever-Cloud'); // Super broad but often effective
    await option.first().waitFor({ state: 'visible', timeout: 5000 });
    await option.first().click();
    log('--> "Warp10-Clever-Cloud" selected as datasource');
    await page.waitForTimeout(500);
  } else {
    log('--> No datasource picker found, skipping selection');
  }
  await page.waitForTimeout(500);

  log('--> Filling query in editor');
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.waitFor({ state: 'visible', timeout: 2000 });
  await editor.fill(panelQuery);

  // Step 5: Run the query
  log('--> Running query');
  const refreshButton = page.getByTestId('data-testid RefreshPicker run button');
  await refreshButton.first().waitFor({ state: 'visible', timeout: 3000 });
  await refreshButton.first().click();
  await page.waitForTimeout(500);

  // Step 6: Save panel and dashboard
  log('--> Saving panel/dashboard');
  const saveBtn = page.getByRole('button', { name: 'Save' });
  await saveBtn.first().waitFor({ state: 'visible', timeout: 3000 });
  await saveBtn.first().click();
  await page.waitForTimeout(500);

  // Step 7: Extract JSON model from editor (Monaco or legacy)
  log('--> Extracting JSON model');
  const jsonContent = await getPanelJsonModel(page);
  log('--> JSON content retrieved:');
  log(jsonContent);
  await page.waitForTimeout(500);

  // Step 8: Cleanup UI (close drawer, discard, confirm)
  log('--> Cleaning up: closing JSON drawer');
  const exitSave = page.getByTestId('data-testid Drawer close');
  if ((await exitSave.count()) > 0 && (await exitSave.first().isVisible())) {
    log('--> Drawer close button found via data-testid');
    await exitSave.first().click();
    await page.waitForTimeout(500);
  } else {
    log('--> Drawer close button not found via data-testid, trying aria-label fallback');
    const closeBtn = page.locator('button[aria-label="Drawer close"]');
    if ((await closeBtn.count()) > 0 && (await closeBtn.first().isVisible())) {
      log('--> Drawer close button found via aria-label');
      await closeBtn.first().click();
      await page.waitForTimeout(500);
    } else {
      log('--> Drawer close button not found by any known selector. Skipping.');
    }
  }

  // "Discard" and confirm are optional depending on version/state
  log('--> Attempting cleanup with "Discard" button');
  const discardBtn = page.getByRole('button', { name: 'Discard' });
  if ((await discardBtn.count()) > 0 && (await discardBtn.first().isVisible())) {
    log('--> "Discard" button found, clicking...');
    await discardBtn.first().click();

    const confirmBtn = page.getByTestId('data-testid Confirm Modal Danger Button');
    if ((await confirmBtn.count()) > 0 && (await confirmBtn.first().isVisible())) {
      log('--> Confirm modal found after discard, clicking...');
      await confirmBtn.first().click();
    } else {
      log('--> No confirm modal appeared after discard.');
    }
  } else {
    log('--> No "Discard" button found, skipping discard cleanup.');
  }

  // Step 9: Parse JSON and validate required fields
  log('--> Parsing JSON and validating required keys');
  let model;
  try {
    model = JSON.parse(jsonContent);
  } catch (e) {
    throw new Error('Textarea does not contain valid JSON');
  }
  const hasExpr = searchObject(model, 'expr', '1 2 +');
  const hasTitle = searchObject(model, 'title', 'Test Editor JSON');

  log(`--> "expr: 1 2 +" found: ${hasExpr}`);
  log(`--> "title: Test Editor JSON" found: ${hasTitle}`);

  expect(hasExpr).toBe(true);
  expect(hasTitle).toBe(true);
}

function searchObject(obj: any, key: string, value: string): boolean {
  // This is a deep search. Stops at first match.
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  if (obj[key] === value) {
    return true;
  }
  for (const k of Object.keys(obj)) {
    if (searchObject(obj[k], key, value)) {
      return true;
    }
  }
  return false;
}

export async function getPanelJsonModel(page: Page): Promise<string> {
  // Try Monaco editor (used in recent Grafana versions) first.
  const monacoContent = await page.evaluate(() => {
    // @ts-ignore
    return window.monaco?.editor?.getEditors?.()[0]?.getValue?.() ?? '';
  });
  if (monacoContent && monacoContent.trim().startsWith('{')) {
    log('--> JSON model found in Monaco editor');
    return monacoContent;
  }
  // List of known textarea selectors for the JSON model
  const selectors = ['textarea.css-rn6xsd', 'textarea.css-1q116cm', 'textarea.css-ch361'];
  for (const selector of selectors) {
    const textarea = page.locator(selector);
    if (await textarea.count()) {
      const value = await textarea.inputValue();
      if (value && value.trim().startsWith('{')) {
        log(`--> JSON model found in textarea: ${selector}`);
        return value;
      }
    }
  }
  throw new Error('Could not extract JSON model from panel editor using any known selector!');
}

export async function clickEditButton(page: Page) {
  const roleBased = page.getByRole('link', { name: 'Edit' });
  if ((await roleBased.count()) > 0 && (await roleBased.first().isVisible())) {
    await roleBased.first().click();
    console.log('Clicked Edit link (role=link).');
    return;
  }

  const menuItemEdit = page.locator('button[role="menuitem"]:has-text("Edit")');
  if ((await menuItemEdit.count()) > 0 && (await menuItemEdit.first().isVisible())) {
    await menuItemEdit.first().click();
    console.log('Clicked Edit button (role=menuitem).');
    return;
  }

  throw new Error('Edit button not found in either format.');
}

export async function fillPairAndClickAdd({
  nameInput,
  valueInput,
  name,
  value,
  addButton,
  label,
  page,
}: {
  nameInput: Locator;
  valueInput: Locator;
  name: string;
  value: string;
  addButton?: Locator;
  label: string;
  page: Page;
}) {
  log(`--> Filling ${label} name`);
  await nameInput.pressSequentially(name);
  await page.waitForTimeout(500);
  const actualName = await nameInput.inputValue();
  log(`--> ${label} Name value after typing: "${actualName}"`);
  if (actualName === name) {
    log(`--> ${label} name added successfully`);
  }

  log(`--> Filling ${label} value`);
  await valueInput.pressSequentially(value);
  await page.waitForTimeout(500);
  const actualValue = await valueInput.inputValue();
  log(`--> ${label} Value after typing: "${actualValue}"`);
  if (actualValue === value) {
    log(`--> ${label} value added successfully`);
  }

  if (addButton) {
    log(`--> Clicking ${label} Add button...`);
    await addButton.click();
    await page.waitForTimeout(1000);
  }
}

export async function logVisibility(page: Page, label: string) {
  try {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    log(`--> '${label}' is visible`);
  } catch (error) {
    console.error(`--> '${label}' is NOT visible`);
  }
}

export async function testDatasourceInvalidURL(
  page: Page,
  saveButton: {
    type: string;
    name: string;
  },
  urlSelector = '#url'
) {
  const urlInput = page.locator(urlSelector);
  await urlInput.fill('http://localhost:9999');
  log('--> Attempting to save and test datasource with invalid URL...');
  if (saveButton.type === 'role') {
    await page.getByRole('button', { name: saveButton.name }).click();
  } else {
    await page.getByTestId(saveButton.name).click();
  }
  const alertSelector = page.locator('[data-testid="data-testid Alert info"]');
  await expect(alertSelector).toBeVisible({ timeout: 3000 });
  const alertText = await alertSelector.textContent();
  expect(alertText).toContain('connect: connection refused');
}
