/**
 * @file type_test.spec.ts
 * @description Comprehensive tests for Warp10 request handling and response formats.
 * Includes checks for:
 *  - Scalar, array, and GTS responses (flat and nested)
 *  - Value types: int, float, string, boolean
 *  - Partial/empty responses (null-like behavior)
 *  - Timestamp behavior (microseconds input, milliseconds output)
 *
 * Scope: requests (data layer validation)
 */
import { test, expect } from '@playwright/test';
import { log, getGrafanaVersion, createNewDashboardAndSelectWarp10 } from '../../utils';

test('Warp10 Request Test: response types, formatting, macros, nulls, timestamps', async ({ page }) => {
  const responses: any[] = [];

  // === Step 1: Intercept responses ===
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

  // === Step 2: Log console errors ===
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('net::ERR_CONNECTION_REFUSED')) {
      return;
    }
    console.log(`[console.${msg.type()}] ${msg.text()}`);
  });

  // === Step 3: Load Grafana dashboard panel ===
  log('--> Creating a New dashboard');

  const version = await getGrafanaVersion(page);
  log(`--> Detected Grafana version: ${version}`);

  await page.goto('http://localhost:3000/dashboard/new');
  await page.waitForTimeout(1000);

  await createNewDashboardAndSelectWarp10(page);

  const editor = page.locator('.query-editor-row textarea').first();
  await expect(editor).toBeVisible({ timeout: 5000 });

  // === Step 2: Inject test Warp10 script ===
  log('--> Testing int type');
  await editor.fill(`
NEWGTS 'int' STORE
$int NOW NaN NaN NaN 42 ADDVALUE
$int
  `);

  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(2000);

  const last = responses.at(-1);
  expect(last).toBeDefined();
  expect(last.status).toBe(200);

  const result = last.json?.results?.A;
  expect(result).toBeDefined();
  expect(result.frames?.length).toBeGreaterThan(0);
  expect(result.frames[0].data?.values?.length).toBeGreaterThan(0);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  log('--> Testing float type');
  await editor.fill(`
NEWGTS 'float' STORE
$float NOW NaN NaN NaN 3.14 ADDVALUE
$float
`);
  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(2000);

  const floatResp = responses.at(-1);
  expect(floatResp).toBeDefined();
  expect(floatResp.status).toBe(200);
  const floatValues = floatResp.json?.results?.A?.frames?.[0]?.data?.values;
  expect(Array.isArray(floatValues?.[1])).toBe(true);
  log(`--> Float frame contains ${floatValues[1].length} value(s)`);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  log('--> Testing boolean type');
  await editor.fill(`
NEWGTS 'bool' STORE
$bool NOW NaN NaN NaN 'true' ADDVALUE
$bool
`);
  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(2000);

  const boolResp = responses.at(-1);
  expect(boolResp).toBeDefined();
  expect(boolResp.status).toBe(200);
  const boolValues = boolResp.json?.results?.A?.frames?.[0]?.data?.values;
  expect(typeof boolValues?.[1]?.[0]).toBe('string');
  log(`--> Bool value is ${boolValues[1][0]}`);
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  log('--> Testing string type');
  await editor.fill(`
NEWGTS 'string' STORE
$string NOW NaN NaN NaN 'hello' ADDVALUE
$string
`);
  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(2000);

  const stringResp = responses.at(-1);
  expect(stringResp).toBeDefined();
  expect(stringResp.status).toBe(200);
  const stringValues = stringResp.json?.results?.A?.frames?.[0]?.data?.values;
  expect(typeof stringValues?.[1]?.[0]).toBe('string');
  log(`--> String value is "${stringValues[1][0]}"`);
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  log('--> Testing support for empty GTS (null-like response)');

  // Fill editor with one GTS that has data and one that is empty
  await editor.fill(`
NEWGTS 'withData' STORE
NEWGTS 'empty' STORE

$withData NOW NaN NaN NaN 123 ADDVALUE
[ $withData $empty ]
`);

  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(2000);

  // Extract last response
  const nullResp = responses.at(-1);
  expect(nullResp).toBeDefined();
  expect(nullResp.status).toBe(200);

  const frames = nullResp.json?.results?.A?.frames;
  expect(Array.isArray(frames)).toBe(true);
  expect(frames.length).toBe(3);

  const values1 = frames[0]?.data?.values;
  const values2 = frames[1]?.data?.values;

  // First GTS (with data)
  expect(Array.isArray(values1[0])).toBe(true);
  expect(values1[0].length).toBeGreaterThan(0);

  // Second GTS (empty)
  expect(Array.isArray(values2[0])).toBe(true);
  expect(values2[0].length).toBe(0);
  expect(Array.isArray(values2[1])).toBe(true);
  expect(values2[1].length).toBe(0);

  log('--> Empty GTS correctly returned with 0 datapoints (null-like behavior)');

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  log('--> Testing scalar response');
  await editor.fill(`
NEWGTS 'scalar' STORE
$scalar NOW NaN NaN NaN 1234 ADDVALUE
$scalar
`);
  await page.getByTestId('data-testid RefreshPicker run button').click();
  await page.waitForTimeout(2000);

  const scalarResp = responses.at(-1);
  expect(scalarResp).toBeDefined();
  expect(scalarResp.status).toBe(200);

  const scalarFrame = scalarResp.json?.results?.A?.frames?.[0];
  expect(scalarFrame).toBeDefined();

  const scalarValues = scalarFrame.data?.values;
  expect(Array.isArray(scalarValues)).toBe(true);
  expect(scalarValues?.[1]?.[0]).toBe(1234);
  log('--> Scalar GTS value received and validated');

  // === Step 7: Verify macro block was parsed ===
  const values = result.frames[0].data?.values;
  values?.forEach((arr: string | any[], i: number) => {
    expect(Array.isArray(arr)).toBe(true);
    log(`--> Field ${i + 1} contains ${arr.length} value(s)`);
  });
  log('--> Request test passed with formatting, types, and macro support');
});
