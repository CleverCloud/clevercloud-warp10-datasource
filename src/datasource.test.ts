/**
 * @file datasource.test.ts
 * @description Unit tests for the WarpScript header generation logic in DataSource.
 *
 * These complement the Playwright e2e suite: e2e proves the plugin works inside a
 * real Grafana + Warp10 stack, while these tests pin down the exact WarpScript
 * headers generated for constants, macros, dashboard variables and time bounds —
 * cases that are slow (or impossible) to enumerate through the UI.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DataQueryRequest, DataSourceInstanceSettings } from '@grafana/data';

import type { DataSource } from './datasource';
import type { WarpDataSourceOptions, WarpQuery } from './types/types';

const mockVariables: any[] = [];
const mockReplace = jest.fn((expr: string) => expr);

// jest.mock imported from @jest/globals is NOT hoisted above the ES imports,
// so the tested module must be require()d after the mock is registered (below)
jest.mock('@grafana/runtime', () => ({
  // Prototype methods, not instance fields: an instance field on the base class
  // would shadow DataSource's own query() override
  DataSourceWithBackend: class {
    constructor(_settings: unknown) {}
    query(_request: unknown) {
      return { subscribe: () => {} };
    }
    callHealthCheck() {
      return Promise.resolve({});
    }
  },
  getTemplateSrv: () => ({
    getVariables: () => mockVariables,
    replace: mockReplace,
  }),
  getBackendSrv: () => ({
    fetch: jest.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DataSource: DataSourceClass } = require('./datasource') as typeof import('./datasource');

function makeDataSource(jsonData: Partial<WarpDataSourceOptions> = {}): DataSource {
  return new DataSourceClass({
    jsonData,
  } as DataSourceInstanceSettings<WarpDataSourceOptions>);
}

beforeEach(() => {
  mockVariables.length = 0;
  mockReplace.mockClear();
});

describe('computeGrafanaContext (datasource constants and macros)', () => {
  it('stores each constant as a WarpScript variable and ends with LINEON', () => {
    const ds = makeDataSource({ const: [{ name: 'offset', value: '3000' }] });
    const header = (ds as any).computeGrafanaContext();
    expect(header).toBe("'3000' 'offset' STORE\nLINEON\n");
  });

  it('stores macros after constants', () => {
    const ds = makeDataSource({
      const: [{ name: 'c1', value: 'v1' }],
      macro: [{ name: 'm1', value: 'v2' }],
    });
    const header = (ds as any).computeGrafanaContext();
    expect(header).toBe("'v1' 'c1' STORE\n'v2' 'm1' STORE\nLINEON\n");
  });

  it('does not quote WarpScript macro bodies (<% ... %>)', () => {
    const ds = makeDataSource({ macro: [{ name: 'double', value: '<% 2 * %>' }] });
    const header = (ds as any).computeGrafanaContext();
    expect(header).toBe("<% 2 * %> 'double' STORE\nLINEON\n");
  });

  it('keeps single quotes in plain values as-is (the sanitizing replace is overwritten)', () => {
    // Pin of current behavior: applyVarToHeader first replaces ' with " but the next
    // branch overwrites `value` with the raw quoted original, so the replacement is
    // effectively dead for non-macro values. A value containing a single quote thus
    // produces broken WarpScript — worth a look in the plugin itself.
    const ds = makeDataSource({ const: [{ name: 'quoted', value: "it's" }] });
    const header = (ds as any).computeGrafanaContext();
    expect(header).toContain("'it's' 'quoted' STORE");
  });

  it('stores an empty string value as quoted empty', () => {
    const ds = makeDataSource({ const: [{ name: 'empty', value: '' }] });
    const header = (ds as any).computeGrafanaContext();
    expect(header).toBe("'' 'empty' STORE\nLINEON\n");
  });

  it('stores NULL for a non-string value', () => {
    const ds = makeDataSource({ const: [{ name: 'num', value: 42 as unknown as string }] });
    const header = (ds as any).computeGrafanaContext();
    expect(header).toBe("NULL 'num' STORE\nLINEON\n");
  });

  it('produces only LINEON without constants or macros', () => {
    const ds = makeDataSource();
    expect((ds as any).computeGrafanaContext()).toBe('LINEON\n');
  });
});

describe('processDashboardVariable (dashboard variables)', () => {
  const ds = makeDataSource();
  const process = (myVar: any) => (ds as any).processDashboardVariable(myVar);

  it('stores a scalar value and its single-entry list', () => {
    const header = process({ name: 'sensor', current: { value: 'sensorA' } });
    expect(header).toBe("[ 'sensorA' ] 'sensor_list' STORE\n'sensorA' 'sensor' STORE\n");
  });

  it('stores a single-element array as a plain value', () => {
    const header = process({ name: 'sensor', current: { value: ['sensorA'] } });
    expect(header).toBe("[ 'sensorA' ] 'sensor_list' STORE\n 'sensorA' 'sensor' STORE\n");
  });

  it('stores a multi-value selection as a list plus a ready-to-use regexp', () => {
    const header = process({ name: 'sensor', current: { value: ['sensorA', 'sensorB'] } });
    expect(header).toContain("[ 'sensorA' 'sensorB' ] 'sensor_list' STORE\n");
    expect(header).toContain("'~' $sensor_list REOPTALT + 'sensor' STORE\n");
  });

  it('expands $__all from options, ignoring the special option', () => {
    const header = process({
      name: 'sensor',
      current: { value: '$__all' },
      options: [{ value: '$__all' }, { value: 'sensorA' }, { value: 'sensorB' }],
    });
    expect(header).toContain("[ 'sensorA' 'sensorB' ] 'sensor_list' STORE\n");
    expect(header).toContain("'~' $sensor_list REOPTALT + 'sensor' STORE\n");
  });

  it('uses the custom allValue verbatim when defined', () => {
    const header = process({
      name: 'sensor',
      current: { value: ['$__all'] },
      allValue: 'sensor.*',
      options: [],
    });
    expect(header).toBe("[ 'sensor.*' ] 'sensor_list' STORE\n 'sensor.*' 'sensor' STORE\n");
  });
});

describe('computeTimeVars (time bounds header)', () => {
  it('exposes start/end in microseconds plus ISO variants and intervals', () => {
    const ds = makeDataSource();
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-01T01:00:00.000Z');
    const request = {
      maxDataPoints: 100,
      range: {
        from: { toDate: () => from, toISOString: () => from.toISOString() },
        to: { toDate: () => to, toISOString: () => to.toISOString() },
      },
    } as unknown as DataQueryRequest<WarpQuery>;

    const header = (ds as any).computeTimeVars(request);

    expect(header).toContain(`${from.getTime() * 1000} 'start' STORE`);
    expect(header).toContain(`${to.getTime() * 1000} 'end' STORE`);
    expect(header).toContain(`'${from.toISOString()}' 'startISO' STORE`);
    expect(header).toContain(`'${to.toISOString()}' 'endISO' STORE`);
    const intervalUs = (to.getTime() - from.getTime()) * 1000;
    expect(header).toContain(`${intervalUs} 'interval' STORE`);
    expect(header).toContain(`${Math.floor(intervalUs / 100)} '__interval' STORE`);
  });
});

describe('query (legacy request support)', () => {
  it('maps the deprecated queryText field onto expr', () => {
    const ds = makeDataSource();
    const request = {
      targets: [{ refId: 'A', queryText: 'NOW' }],
      scopedVars: {},
      range: {
        from: { toDate: () => new Date(0), toISOString: () => new Date(0).toISOString() },
        to: { toDate: () => new Date(1000), toISOString: () => new Date(1000).toISOString() },
      },
    } as unknown as DataQueryRequest<WarpQuery>;

    ds.query(request);

    expect(request.targets[0].expr).toContain('NOW');
    // The header must precede the user expression
    expect(request.targets[0].expr).toContain('LINEON\n');
    expect(request.targets[0].expr.endsWith('NOW')).toBe(true);
  });
});
