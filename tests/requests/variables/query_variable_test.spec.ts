/**
 * @file query_variable_test.spec.ts
 * @description Tests for query-driven variable behavior in Warp10.
 * Checks:
 *  - Variable value loading from data source queries
 *  - Dynamic updating and usage in panel queries
 *  - Correct integration with templates and data
 *
 * Scope: variable (query variable data integration)
 */

import {
  log,
  setupDatasource,
  createDashboardWithQueryVariable,
  executeQueryAndCapturePayload,
  cleanupDashboard,
  deleteDatasource,
} from '../../utils';
import { test, expect } from '@playwright/test';

// === TEST ===

test('Single variable substitution (Query type)', async ({ page }) => {
  const dsName = 'ds_var_test_single';
  const varName = 'queryval';
  const varQuery = '10 20 +';
  const dashboardTitle = 'SingleVariableDashboard';

  log('--> Starting Single variable substitution test');
  await setupDatasource(page, dsName);
  await createDashboardWithQueryVariable(page, dsName, varName, varQuery, dashboardTitle);

  // Use the variable in a Warp10 query
  const query = `$queryval`;
  log('--> Sending final test query');
  const { payload } = await executeQueryAndCapturePayload(page, dsName, query);
  const expr = payload.queries[0].expr;

  log('--> Asserting that expr contains substituted value "30"');
  expect(expr).toContain('30');
  log('--> OK: Substituted value "30" found in expr');

  log(`--> Asserting expr contains "[ '30' ] 'queryval_list' STORE"`);
  expect(expr).toContain(`[ '30' ] 'queryval_list' STORE`);
  log('--> OK: Correct query variable list storage found in expr');

  log(`--> Asserting expr contains "'30' 'queryval' STORE"`);
  expect(expr).toContain(`'30' 'queryval' STORE`);
  log('--> OK: Correct query variable value storage found in expr');

  log(`--> Asserting expr contains "$queryval"`);
  expect(expr).toContain(`$queryval`);
  log('--> OK: Variable reference "$queryval" found in expr');

  log('--> Single variable substitution verified');
  await deleteDatasource(page, dsName);
  await cleanupDashboard(page, dashboardTitle);
  await page.waitForTimeout(500);
  log('--> Test Ended successfully');
});
