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
const createdDatasourceUids: string[] = [];
const createdDashboards: string[] = [];

export function registerDatasource(name: string) {
  if (!createdDatasources.includes(name)) {
    createdDatasources.push(name);
  }
}

/**
 * Selecting the plugin tile POSTs the datasource under Grafana's default name
 * ('Warp10') before any test code names it. A test dying between that POST and
 * its first save leaks a datasource the name-based cleanup can never find —
 * the uid recorded at creation reaches it regardless of what it is named.
 */
export function registerDatasourceUid(uid: string) {
  if (!createdDatasourceUids.includes(uid)) {
    createdDatasourceUids.push(uid);
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
      const dsUids = createdDatasourceUids.splice(0);
      const dashTitles = createdDashboards.splice(0);
      for (const name of dsNames) {
        // 404 (already deleted by the test's own UI cleanup) is fine
        await api('DELETE', `/datasources/name/${encodeURIComponent(name)}`);
      }
      for (const uid of dsUids) {
        // Reaches datasources still under Grafana's default name (see registerDatasourceUid);
        // 404 (already deleted by name above, or by the test itself) is fine
        await api('DELETE', `/datasources/uid/${encodeURIComponent(uid)}`);
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
