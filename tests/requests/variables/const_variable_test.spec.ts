/**
 * @file const_variable_test.spec.ts
 * @description Tests for constant variable handling in Warp10 queries.
 * Validates:
 *  - Value substitution in queries
 *  - Usage in request editor and templates
 *  - Correct rendering and data output for static values
 *
 * Scope: variable (constant variable integration and substitution)
 */

import {
  log,
  setupDatasource,
  cleanupDashboard,
  deleteDatasource,
  createDashboardWithConstVariable,
  executeQueryAndValidate,
} from '../../utils';
import { test, expect } from '@playwright/test';

test('Single constant substitution (Datasource constant)', async ({ page }) => {
  const dsName = 'ds_const_test_single';
  const constName = 'myConstVar';
  const constValue = '42';
  const dashboardTitle = 'DashboardWithConst';

  log('--> Starting Single constant substitution test');
  await setupDatasource(page, dsName);

  // Create dashboard and add the constant variable
  await createDashboardWithConstVariable(page, dsName, constName, constValue, dashboardTitle);

  // Use the constant in a Warp10 query
  const query = `$myConstVar TOLONG 20 +`;
  log('--> Sending final test query');
  const { payload, response, responseBody } = await executeQueryAndValidate(page, dsName, query, constValue);

  log('--> Checking test assertions');
  log(`--> Asserting that expr contains the constant value: ${constValue}`);
  expect(payload.queries[0].expr).toContain(constValue);
  log('--> OK: expr contains the constant value.');

  log('--> Asserting response status is 200');
  expect(response.status()).toBe(200);
  log('--> OK: Response status is 200');

  log('--> Asserting responseBody.results.A is defined');
  expect(responseBody.results.A).toBeDefined();
  log('--> OK: responseBody.results.A is defined');

  log('--> Asserting responseBody.results.A.status is 200');
  expect(responseBody.results.A.status).toBe(200);
  log('--> OK: responseBody.results.A.status is 200');

  const result = responseBody?.results?.A?.frames?.[0]?.data?.values?.[0]?.[0];
  log('--> Asserting computed result equals 62');
  expect(result).toBe(62);
  log('--> OK: Computed result is 62');

  const expr = payload.queries[0].expr;
  log(`--> Asserting expr contains "[ '${constValue}' ] '${constName}_list' STORE"`);
  expect(expr).toContain(`[ '${constValue}' ] '${constName}_list' STORE`);
  log('--> OK: Correct list storage line found in expr');

  log(`--> Asserting expr contains "'${constValue}' '${constName}' STORE"`);
  expect(expr).toContain(`'${constValue}' '${constName}' STORE`);
  log('--> OK: Correct value storage line found in expr');

  log(`--> Asserting expr contains "$${constName} TOLONG 20 +"`);
  expect(expr).toContain(`$${constName} TOLONG 20 +`);
  log('--> OK: Final usage of variable in expr is correct');

  log('--> Verified backend response value is 62');

  log('--> Single constant substitution verified');
  await deleteDatasource(page, dsName);
  await cleanupDashboard(page, dashboardTitle);
  await page.waitForTimeout(500);
  log('--> Test Ended successfully');
});
