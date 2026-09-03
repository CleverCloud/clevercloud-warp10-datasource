/**
 * @file global-setup.ts
 * @description Purges test state leaked into Grafana by previously failed runs.
 *
 * A failed test never reaches its cleanup step, so its datasources and dashboards
 * survive in Grafana. Leftovers then break the next run (duplicate dashboard titles
 * disable the Save button, datasource renames 409 and suppress the health check),
 * making failures self-sustaining. Purging here makes every run start clean.
 *
 * Only entries recognizably created by this test suite are touched: uniqueName()
 * timestamps old enough not to belong to a concurrently running suite, and the
 * static names used by the UI-flow specs. A developer's own dashboards and
 * datasources on the target Grafana are never deleted.
 */
import { api, apiList, TEST_NAME_PATTERN } from './grafana-api';

// Provisioned entries that must survive between runs
const KEEP_DATASOURCES = ['Warp10-Clever-Cloud'];

// Static names used by the UI-flow specs, plus the default names Grafana gives a
// datasource the moment the plugin tile is clicked ('Warp10' up to Grafana 12, the
// plugin id from 13), which survive when a test dies before its rename is saved
const STATIC_TEST_DATASOURCES = [
  'test_warp10',
  'test_health_warp10',
  'test_warp10_scenario',
  'Warp10',
  'clevercloud-warp10-datasource',
];

// A uniqueName() entry younger than this may belong to a suite still running in
// parallel with this one — leave it for the next run to reap
const MIN_LEFTOVER_AGE_MS = 5 * 60_000;

function isStaleTestName(name: string): boolean {
  const match = name.match(TEST_NAME_PATTERN);
  if (!match) {
    return false;
  }
  return Date.now() - Number(match[1]) > MIN_LEFTOVER_AGE_MS;
}

export default async function globalSetup() {
  const removed: string[] = [];
  const dsBody = await api('GET', '/datasources');
  if (dsBody === null) {
    // Grafana not up yet (or not reachable): let the tests themselves report it
    console.warn('[global-setup] state purge skipped: Grafana not reachable');
    return;
  }
  const datasources: Array<{ id: number; name: string; type: string }> = Array.isArray(dsBody) ? dsBody : [];
  for (const ds of datasources) {
    // Only touch datasources of this plugin, never other locally configured ones —
    // and among those, only names this suite creates
    if (
      ds.type === 'clevercloud-warp10-datasource' &&
      !KEEP_DATASOURCES.includes(ds.name) &&
      (isStaleTestName(ds.name) || STATIC_TEST_DATASOURCES.includes(ds.name))
    ) {
      await api('DELETE', `/datasources/${ds.id}`);
      removed.push(`datasource:${ds.name}`);
    }
  }
  const dashboards: Array<{ uid: string; title: string }> = await apiList('/search?type=dash-db');
  for (const d of dashboards) {
    // Only uniqueName() dashboards: everything else on the target Grafana is not ours
    if (isStaleTestName(d.title)) {
      await api('DELETE', `/dashboards/uid/${d.uid}`);
      removed.push(`dashboard:${d.title}`);
    }
  }
  if (removed.length) {
    console.log(`[global-setup] purged leaked test state: ${removed.join(', ')}`);
  }
}
