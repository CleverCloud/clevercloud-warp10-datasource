/**
 * @file macro_test.spec.ts
 * @description Tests for Warp10 macro parsing, payload, and error handling in the query editor.
 * - Verifies that macros are correctly injected and sent in outgoing payloads.
 * - Checks error handling for invalid macros.
 *
 * Scope: Macro definition, payload structure, error propagation.
 */

import { test, expect } from '@playwright/test';
import { log, getGrafanaVersion, goToNewDashboard, clickEditButton } from '../../utils';

// === TEST: Editor JSON Model Validation ===
test('macros: Warp10 macro definition and usage (positive and negative)', async ({ page }) => {
  // Open Dashboard and Panel Editor
  const version = await getGrafanaVersion(page);
  log(`--> Detected Grafana version: ${version}`);
  await page.goto('http://localhost:3000/dashboards');
  await page.waitForTimeout(1000);
  await goToNewDashboard(page);

  // Click "Menu for panel with title Graph Example"
  await page
    .getByRole('button', {
      name: 'Menu for panel with title Graph Example',
    })
    .click();

  await clickEditButton(page);

  // Wait for editor to be ready
  log('--> Waiting for query editor...');
  const editor = page.locator('.query-editor-row textarea').first();
  await expect(editor).toBeAttached({ timeout: 10000 });
  await expect(editor).toBeVisible({ timeout: 10000 });
  log('--> Editor is visible and attached');

  // === 1. POSITIVE MACRO TEST ===
  log('--> Injecting valid macro and verifying outgoing payload');
  const macroCode = `<%
  2 +
%> 'addmacro' STORE

10 32 $addmacro
`;
  await editor.fill(macroCode);

  // Wait for /api/ds/query request for THIS macro
  const [macroRequest] = await Promise.all([
    page.waitForRequest((req) => {
      const postData = req.postData();
      return (
        req.url().includes('/api/ds/query') &&
        req.method() === 'POST' &&
        !!postData &&
        postData.includes("'addmacro' STORE")
      );
    }),
    page.getByTestId('data-testid RefreshPicker run button').click(),
  ]);

  // Check outgoing payload only
  const macroPayload = JSON.parse(macroRequest.postData() || '{}');
  log('--> Outgoing macro payload: ' + JSON.stringify(macroPayload, null, 2));
  expect(macroPayload.queries?.[0]?.expr).toContain("'addmacro' STORE");
  log('--> Macro definition is present in outgoing payload.');

  // === 2. NEGATIVE MACRO TEST ===
  log('--> Injecting invalid macro and expecting backend error');
  const brokenMacro = `<%
  2 ++    // Invalid: "++" is not valid WarpScript
%> 'brokenmacro' STORE

10 32 $brokenmacro
`;
  await editor.fill(brokenMacro);

  // Wait for error request/response
  const [, errorResponse] = await Promise.all([
    page.waitForRequest((req) => {
      const postData = req.postData();
      return (
        req.url().includes('/api/ds/query') &&
        req.method() === 'POST' &&
        !!postData &&
        postData.includes("'brokenmacro' STORE")
      );
    }),
    page.waitForResponse((res) => {
      const postData = res.request().postData();
      return res.url().includes('/api/ds/query') && !!postData && postData.includes("'brokenmacro' STORE");
    }),
    page.getByTestId('data-testid RefreshPicker run button').click(),
  ]);

  // Parse error response and check error message
  const errorResult = await errorResponse.json();
  log('--> Backend error response: ' + JSON.stringify(errorResult));
  expect(errorResult.results?.A?.error).toBeTruthy();
  expect(errorResult.results.A.status).not.toBe(200);

  log('--> Macro test completed!');
});
