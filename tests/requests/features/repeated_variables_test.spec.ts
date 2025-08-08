/**
 * @file repeated_variables_test.spec.ts
 * @description End-to-end test for repeated variables feature in Grafana.
 * - verify values in warpscript header
 * - verifies that repeated variables are correctly rendered in the dashboard.
 */
import { test, expect } from '@playwright/test';
import { goToDashboard, log } from '../../utils';

const GRAFANA_HOST = 'http://localhost:3000';
const PLAYWRIGHT_TIMEOUT = 5000;

test.describe('Repeated Variables Feature', () => {
  const responses: any[] = [];

  test('setup test, go to test dashboard', async ({ page }) => {
    // Listen for API requests
    page.on('request', async (request) => {
      const url = request.url();
      if (
        url.includes('/api/ds/query?ds_type=clevercloud-warp10-datasource&requestId=') &&
        request.method() === 'POST'
      ) {
        try {
          const postData = request.postData();
          if (postData) {
            const payload = JSON.parse(postData);
            responses.push({
              url,
              payload,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          log(`Error parsing request payload: ${e}`);
        }
      }
    });

    // Navigate to the dashboard
    await page.goto(`${GRAFANA_HOST}/dashboards`);
    await page.waitForTimeout(PLAYWRIGHT_TIMEOUT);
    await goToDashboard(page, 'Test repeated vars');

    // ---- Verify the payloads, wait for the requests
    await page.waitForTimeout(PLAYWRIGHT_TIMEOUT);
    expect(responses.length).toBe(4);

    // Check each response for the expected WarpScript values
    responses.map((response) => {
      const queries = response.payload?.queries || [];
      for (const query of queries) {
        const warpScript = query.expr || '';

        // we cannot detect where the request comes from, this is the maximum depth of verification
        if (warpScript.includes('$var_serie_1_repeat')) {
          expect(warpScript).toMatch(/'serie_1__value_[A-C]' 'var_serie_1_repeat' STORE/);
        } else if (warpScript.includes('$var_serie_2_repeat')) {
          expect(warpScript).toMatch(/'serie_2__value_[A-C]' 'var_serie_2_repeat' STORE/);
        } else {
          throw new Error('repeat vars series not detected in warpscript:' + warpScript);
        }
      }
    });

    // ---- Should correctly display repeated variable panels
    // test panels' titles
    await expect(page.getByRole('heading', { name: 'serie_1__value_A' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'serie_1__value_B' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'serie_1__value_C' })).toBeVisible({ visible: false });

    await expect(page.getByRole('heading', { name: 'serie_2__value_A' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'serie_2__value_B' })).toBeVisible();

    // test panels' values
    await expect(
      page
        .getByTestId('data-testid Panel header serie_1__value_A')
        .getByTitle('scalar_value_string')
        .getByText('serie_1__value_A')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('data-testid Panel header serie_1__value_B')
        .getByTitle('scalar_value_string')
        .getByText('serie_1__value_B')
    ).toBeVisible();

    await expect(
      page
        .getByTestId('data-testid Panel header serie_2__value_A')
        .getByTitle('scalar_value_string')
        .getByText('serie_2__value_A')
    ).toBeVisible();
    await expect(
      page
        .getByTestId('data-testid Panel header serie_2__value_B')
        .getByTitle('scalar_value_string')
        .getByText('serie_2__value_B')
    ).toBeVisible();
  });
});
