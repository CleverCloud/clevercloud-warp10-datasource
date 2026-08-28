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
import { test, expect, uniqueName } from '../../fixtures';
import { log, createDashboardAndRunQuery } from '../../utils';

// === TEST : Invalid constant ===
test('Test: Warp10 fails when constant is missing from datasource', async ({ page, createWarp10Datasource }) => {
  const dsName = uniqueName('ds_invalid_const');
  const missingConst = 'not_defined';
  log('--> Creating datasource without constants');
  await createWarp10Datasource(dsName);

  const json = await createDashboardAndRunQuery(page, dsName, `NOW $${missingConst} +`, { returnResponse: true });

  log('--> Received response for invalid constant:');
  console.log(JSON.stringify(json, null, 2));

  expect(json.results?.A?.error).toBeTruthy();
  log(`--> Constant $${missingConst} is missing and triggered error: test PASSED`);

});
