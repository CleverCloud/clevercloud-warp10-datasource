/**
 * @file global-setup.ts
 * @description Purges test state leaked into Grafana by previously failed runs.
 *
 * A failed test never reaches its cleanup step, so its datasources and dashboards
 * survive in Grafana. Leftovers then break the next run (duplicate dashboard titles
 * disable the Save button, datasource renames 409 and suppress the health check),
 * making failures self-sustaining. Purging here makes every run start clean.
 */
const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');

// Provisioned entries that must survive between runs
const KEEP_DATASOURCES = ['Warp10-Clever-Cloud'];
const KEEP_DASHBOARDS = ['New dashboard', 'Test repeated vars', 'Test Dashboard'];

async function api(method: string, path: string): Promise<any> {
  const res = await fetch(`${GRAFANA_URL}/api${path}`, {
    method,
    headers: { Authorization: AUTH },
  });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default async function globalSetup() {
  const removed: string[] = [];
  try {
    const datasources: Array<{ id: number; name: string; type: string }> = (await api('GET', '/datasources')) ?? [];
    for (const ds of datasources) {
      // Only touch datasources of this plugin, never other locally configured ones
      if (ds.type === 'clevercloud-warp10-datasource' && !KEEP_DATASOURCES.includes(ds.name)) {
        await api('DELETE', `/datasources/${ds.id}`);
        removed.push(`datasource:${ds.name}`);
      }
    }
    const dashboards: Array<{ uid: string; title: string }> = (await api('GET', '/search?type=dash-db')) ?? [];
    for (const d of dashboards) {
      if (!KEEP_DASHBOARDS.includes(d.title)) {
        await api('DELETE', `/dashboards/uid/${d.uid}`);
        removed.push(`dashboard:${d.title}`);
      }
    }
  } catch (e) {
    // Grafana not up yet (or not reachable): let the tests themselves report it
    console.warn(`[global-setup] state purge skipped: ${(e as Error).message}`);
    return;
  }
  if (removed.length) {
    console.log(`[global-setup] purged leaked test state: ${removed.join(', ')}`);
  }
}
