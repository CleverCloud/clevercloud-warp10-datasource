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
import { test as base, expect } from '@playwright/test';

const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');

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

async function api(method: string, path: string): Promise<any> {
  try {
    const res = await fetch(`${GRAFANA_URL}/api${path}`, {
      method,
      headers: { Authorization: AUTH },
    });
    return await res.json();
  } catch {
    return null;
  }
}

export const test = base.extend<{ autoCleanup: void }>({
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
        const dashboards: Array<{ uid: string; title: string }> = (await api('GET', '/search?type=dash-db')) ?? [];
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
