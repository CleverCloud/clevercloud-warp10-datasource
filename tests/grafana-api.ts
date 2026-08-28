/**
 * @file grafana-api.ts
 * @description Minimal Grafana HTTP API helper shared by global-setup and fixtures.
 *
 * Every call swallows its own network error and returns null: state cleanup must
 * keep going when one call fails, and each caller decides what a null means.
 */
export const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
// Default credentials of the disposable Grafana started by tests/config/docker-compose-plugin.yaml
const AUTH = 'Basic ' + Buffer.from('admin:admin').toString('base64');

export async function api(method: string, path: string): Promise<any> {
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

/**
 * GET returning a list. Grafana serves JSON error bodies ({"message": ...}) with
 * non-2xx statuses, which parse fine but are not arrays — normalize those to [].
 */
export async function apiList(path: string): Promise<any[]> {
  const body = await api('GET', path);
  return Array.isArray(body) ? body : [];
}

/**
 * uniqueName() suffix (see fixtures.ts): `prefix_<ms timestamp>_<0-9999>`.
 * Also used by global-setup to recognize test-created entries.
 */
export const TEST_NAME_PATTERN = /_(\d{13})_\d{1,4}$/;
