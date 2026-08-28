/**
 * @file fixtures.ts
 * @description Shared Playwright test base with guaranteed state cleanup.
 *
 * Specs import { test, expect } from here instead of '@playwright/test'.
 * Helpers (and specs) register every datasource/dashboard they create; the auto
 * fixture below deletes them through the Grafana API after each test, even when
 * the test failed before reaching its own UI cleanup. This keeps a failed run
 * from leaking state that breaks the next one.
 */
import { test as base, expect } from '@grafana/plugin-e2e';

import { api, apiList } from './grafana-api';

// Per-worker registries (each worker process runs its tests serially, so the
// registries only ever hold the current test's entries)
const createdDatasources: string[] = [];
const createdDashboards: string[] = [];

export function registerDatasource(name: string) {
  if (!createdDatasources.includes(name)) {
    createdDatasources.push(name);
  }
}

export function registerDashboard(title: string) {
  if (!createdDashboards.includes(title)) {
    createdDashboards.push(title);
  }
}

/**
 * Unique per-run name: leftovers from a failed run can never collide with the
 * next one (a duplicate dashboard title disables the Save button, a duplicate
 * datasource name 409s the save and suppresses the health check).
 */
export function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

type ConstProp = { name: string; value: string };

export const test = base.extend<{
  autoCleanup: void;
  /**
   * Creates a Warp10 datasource through the Grafana API instead of driving the
   * config UI. Feature specs (variables, constants, macros) use this: the UI
   * creation flow itself stays covered by the dedicated datasource/health/scenario
   * specs, and API setup removes both the time cost and the hydration flakes.
   */
  createWarp10Datasource: (name: string, opts?: { const?: ConstProp[]; macro?: ConstProp[] }) => Promise<void>;
}>({
  createWarp10Datasource: async ({ createDataSource }, use) => {
    await use(async (name, opts = {}) => {
      registerDatasource(name);
      const url = process.env.WARP10_URL || 'http://warp10:8080';
      await createDataSource({
        type: 'clevercloud-warp10-datasource',
        name,
        access: 'proxy',
        url,
        jsonData: { path: url, const: opts.const ?? [], macro: opts.macro ?? [] },
      });
    });
  },
  autoCleanup: [
    async ({}, use) => {
      await use();
      const dsNames = createdDatasources.splice(0);
      const dashTitles = createdDashboards.splice(0);
      for (const name of dsNames) {
        // 404 (already deleted by the test's own UI cleanup) is fine
        await api('DELETE', `/datasources/name/${encodeURIComponent(name)}`);
      }
      if (dashTitles.length > 0) {
        // apiList never yields a JSON error body ({"message": ...}), which would
        // pass a `?? []` guard as a non-null object and crash the for..of below
        const dashboards: Array<{ uid: string; title: string }> = await apiList('/search?type=dash-db');
        for (const d of dashboards) {
          if (dashTitles.includes(d.title)) {
            await api('DELETE', `/dashboards/uid/${d.uid}`);
          }
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
