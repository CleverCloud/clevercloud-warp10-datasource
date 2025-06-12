/**
 * @file interval_variable_test.spec.ts
 * @description Tests for interval variable handling and dynamic value generation.
 * Covers:
 *  - Interval variable creation and update
 *  - Query behavior with changing intervals
 *  - Validation of output with time-dependent variables
 *
 * Scope: variable (interval variable behavior)
 */

import { test, expect } from '@playwright/test';
import {
  log,
  setupDatasource,
  cleanupDashboard,
  deleteDatasource,
  createDashboardWithIntervalVariable,
  executeQueryAndValidate,
} from '../../utils';

test('Interval variable substitution works', async ({ page }) => {
  const dsName = 'ds_interval_test';
  const varName = 'myInterval';
  const dashboardTitle = 'DashboardWithInterval';

  log('--> Starting Interval variable substitution test');
  await setupDatasource(page, dsName);

  // Create dashboard with interval variable
  await createDashboardWithIntervalVariable(page, dsName, varName, dashboardTitle);

  // Use the variable in a Warp10 query
  // In Grafana, the value for interval variable is typically '1m', '10m', etc.
  const query = `$myInterval 'intervalValue' STORE $intervalValue`;

  // Run and capture
  const { payload } = await executeQueryAndValidate(page, dsName, query);
  const expr = payload.queries[0].expr;

  // Assert variable name is in the query (the actual value will depend on Grafana's selection)
  log(`--> Asserting that expr contains variable name "$myInterval"`);
  expect(expr).toContain('$myInterval');
  log('--> OK: Interval variable "$myInterval" used in query expr');

  log(`--> Asserting expr contains "[ '1m' ] 'myInterval_list' STORE"`);
  expect(expr).toContain(`[ '1m' ] 'myInterval_list' STORE`);
  log('--> OK: Correct interval list storage found in expr');

  log(`--> Asserting expr contains "'1m' 'myInterval' STORE"`);
  expect(expr).toContain(`'1m' 'myInterval' STORE`);
  log('--> OK: Correct interval value storage found in expr');

  log(`--> Asserting expr contains "$myInterval 'intervalValue' STORE $intervalValue"`);
  expect(expr).toContain(`$myInterval 'intervalValue' STORE $intervalValue`);
  log('--> OK: Interval variable value is stored and used as expected in expr');

  await deleteDatasource(page, dsName);
  await cleanupDashboard(page, dashboardTitle);
  await page.waitForTimeout(500);
  log('--> Test Ended successfully');
});
