/**
 * @file custom_multi_variable_test.spec.ts
 * @description Tests for multi-value custom variable handling in Warp10 queries.
 * Checks:
 *  - Multi-value custom variable substitution in queries
 *  - Correct serialization as a list in the payload
 *  - Presence of custom variable assignment structure in expr
 *
 * Scope: variable (custom multi-value variable integration)
 */

import {
  log,
  setupDatasource,
  createDashboardWithCustomMultiVariable,
  executeQueryAndCapturePayloadMulti,
  cleanupDashboard,
  deleteDatasource,
} from '../../utils';
import { test, expect } from '@playwright/test';

// === TEST ===

test('Multi-value custom variable substitution', async ({ page }) => {
  const dsName = 'ds_custom_multivar';
  const varName = 'sensors';
  const varValues = ['sensorA', 'sensorB', 'sensorC'];
  const dashboardTitle = 'MultiCustomVariableDashboard';

  log('--> Starting multi-value custom variable substitution test');
  await setupDatasource(page, dsName);

  // This utility should create a dashboard with a custom variable (multi-value) with the provided values.
  let indicator = await createDashboardWithCustomMultiVariable(page, dsName, varName, varValues, dashboardTitle);

  // Use the variable in a Warp10 query (classic SPLIT + FOREACH logic)
  const query = `'${varValues.join(',')}' ',' SPLIT
<%
  'sensor' STORE
  NEWGTS 'sensor' STORE
  $sensor 'sensor_id' RENAME
%> FOREACH`;

  log('--> Sending final test query');
  const { payload } = await executeQueryAndCapturePayloadMulti(page, dsName, query, indicator);
  const expr = payload.queries[0].expr;

  // Assert that all selected sensor values are present in the expr as a list
  log('--> Asserting that expr contains the correct list storage');
  expect(expr).toContain(`[ 'sensorA' 'sensorB' 'sensorC' ] 'sensors_list' STORE`);
  log('--> OK: sensors_list is stored as a list in expr');

  // Assert that the script structure uses the correct assignment and map logic
  log(`--> Asserting expr contains "~' $sensors_list REOPTALT + 'sensors' STORE"`);
  expect(expr).toContain(`~' $sensors_list REOPTALT + 'sensors' STORE`);
  log('--> OK: sensors_list is used in assignment');

  // Assert FOREACH block presence and main loop logic
  log('--> Asserting expr contains SPLIT and FOREACH logic');
  expect(expr).toContain('SPLIT');
  expect(expr).toContain('FOREACH');
  log('--> OK: FOREACH loop found in expr');

  // Each sensor name should appear at least once
  for (const sensor of varValues) {
    log(`--> Asserting expr contains sensor name "${sensor}"`);
    expect(expr).toContain(sensor);
    log(`--> OK: Sensor "${sensor}" found in expr`);
  }

  log('--> Multi-value custom variable substitution verified');
  await deleteDatasource(page, dsName);
  await cleanupDashboard(page, dashboardTitle);
  await page.waitForTimeout(500);
  log('--> Test Ended successfully');
});
