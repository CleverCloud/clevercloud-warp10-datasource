/**
 * @file constant-invalid.spec.ts
 * @description
 * This end-to-end test verifies the behavior when using an undefined constant in a Warp10 query.
 * It follows this flow:
 *   - Creating a Warp10 datasource with no constants
 *   - Creating a dashboard and a panel
 *   - Inserting a Warp10 query that references a missing constant
 *   - Validating that Warp10 returns an appropriate error message
 *
 *
 * Scope: constants (negative test)
 */
import { test, expect } from '@playwright/test';
import { log, deleteDatasource, createDashboardAndRunQuery, setupDatasource } from '../../utils';

// === TEST : Invalid constant ===
test('Test: Warp10 fails when constant is missing from datasource', async ({ page }) => {
  const dsName = 'ds_invalid_const';
  const missingConst = 'not_defined';
  log('--> Creating datasource without constants');
  await setupDatasource(page, dsName);

  const json = await createDashboardAndRunQuery(page, dsName, `NOW $${missingConst} +`, { returnResponse: true });

  log('--> Received response for invalid constant:');
  console.log(JSON.stringify(json, null, 2));

  expect(json.results?.A?.error).toBeTruthy();
  log(`--> Constant $${missingConst} is missing and triggered error: test PASSED`);

  await deleteDatasource(page, dsName);
});
