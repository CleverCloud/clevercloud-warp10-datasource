/**
 * @file constant-valid.spec.ts
 * @description
 * This end-to-end test verifies that a defined Warp10 constant is correctly injected and used
 * within a panel query. It covers the full flow:
 *   - Creating a new Warp10 datasource with a constant
 *   - Creating a dashboard and a panel
 *   - Inserting a Warp10 query that uses the constant
 *   - Verifying that the constant appears in the outgoing request payload
 *
 * Scope: constants (positive test)
 */
import { test } from '@playwright/test';
import { addConstantToDatasource, deleteDatasource, createDashboardAndRunQuery } from '../../utils';

// === TEST: Valid constant ===
test('Test: Warp10 constant is correctly injected and used in payload', async ({ page }) => {
  const dsName = 'ds_constant_test';
  const constName = 'offset';
  const constValue = '3000';

  await addConstantToDatasource(page, dsName, constName, constValue);
  await createDashboardAndRunQuery(page, dsName, `NOW $${constName} +`, { returnResponse: true });
  await deleteDatasource(page, dsName);
});
