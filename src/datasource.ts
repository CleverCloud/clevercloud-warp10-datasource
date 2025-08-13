import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  MetricFindValue,
  ScopedVars,
} from '@grafana/data';
import { DataSourceWithBackend, getBackendSrv, getTemplateSrv } from '@grafana/runtime';

import { lastValueFrom, map, Observable } from 'rxjs';

import {
  ConstProp,
  WarpDataSourceOptions,
  WarpQuery,
  WarpResult,
} from './types/types';

import { isArray, isObject } from 'lodash';

export class DataSource extends DataSourceWithBackend<WarpQuery, WarpDataSourceOptions> {
  //Information database
  private path: string;

  private const: ConstProp[];

  private macro: ConstProp[];

  private request!: DataQueryRequest<WarpQuery>;

  /**
   * @param instanceSettings
   */
  constructor(instanceSettings: DataSourceInstanceSettings<WarpDataSourceOptions>) {
    super(instanceSettings);
    this.path = instanceSettings.jsonData.path ?? '';

    this.const = instanceSettings.jsonData.const ?? [];

    this.macro = instanceSettings.jsonData.macro ?? [];

  }

  /**
   * NOTE: if you do modify the structure or use template variables, alerting queries may not work
   * as expected
   * */
  applyTemplateVariables(query: WarpQuery, _scopedVars: ScopedVars): WarpQuery {
    let header =  this.computeTimeVars(this.request) +
      this.addDashboardVariables() +
      this.computeGrafanaContext() +
      this.computePanelRepeatVars(_scopedVars);

    let script = header + query.expr;

    return {
      ...query,
      expr: script,
    };
  }

  query(request: DataQueryRequest<WarpQuery>): Observable<DataQueryResponse> {
    // Fix to make the change progressive in Grafana
    // Previous version of these plugin as already be deployed
    // this support previous plugin's data structure version
    // @ts-ignore
    request.targets = request.targets.map((t) => {
      if (!t.expr && t.expr !== '') {
        console.warn('Deprecate request detected');
        // @ts-ignore
        t.expr = t.queryText ?? '';
      }
      return t;
    });

    this.request = request;

    // apply headers for proxy mode
    const query: WarpQuery = {
      expr: request.targets[0].expr,
      refId: request.targets[0].refId,
      hideLabels: request.targets[0]?.hideLabels ? request.targets[0]?.hideLabels : false,
    };
    request.targets[0] = this.applyTemplateVariables(query, request.scopedVars);

    return super.query(request);
  }
  /**
   * send request to Warp10
   * @param query
   * @return {Observable<FetchResponse<unknown>>} Response
   */
  doRequest<T = WarpResult>(query: WarpQuery) {
    return getBackendSrv().fetch<T>({
      url: this.path + '/api/v0/exec',
      method: 'POST',
      data: query.expr,
      headers: [
        ['Accept', 'undefined'],
        ['Content-Type', 'text/plain; charset=UTF-8'],
      ],
      responseType: 'json',
    });
  }

  private computePanelRepeatVars(scopedVars: any): string {
    let wsHeader = '';
    getTemplateSrv()
      .getVariables()
      .forEach((myVar) => {
        const replace = getTemplateSrv().replace(`$${myVar.name}`, scopedVars)
        wsHeader += ` '${replace}' '${myVar.name}_repeat' STORE\n`;

      });
    return wsHeader;
  }

  /**
   * Compute Datasource constant and macro, store it on top of the stack
   * @return {string} WarpScript header
   */
  private computeGrafanaContext(): string {
    let wsHeader = '';

    const applyVarToHeader = (myVar: any) => {
      let value = '';
      if (typeof myVar.value === 'string') {
        value = myVar.value.replace(/'/g, '"');
      }
      if (typeof myVar.value === 'string' && !myVar.value.startsWith('<%') && !myVar.value.endsWith('%>')) {
        value = `'${myVar.value}'`;
      }
      return `${value || 'NULL'} '${myVar.name}' STORE\n`;
    };

    //Add constants
    this.const.forEach((myVar) => {
      wsHeader += applyVarToHeader(myVar);
    });

    //Add macros
    this.macro.forEach((myMacro) => {
      wsHeader += applyVarToHeader(myMacro);
    });

    wsHeader += 'LINEON\n';
    return wsHeader;
  }

  /**
   * Compute templating variables store it on top of the stack
   * @return {string} WarpScript header
   * @private
   */
  private addDashboardVariables(): string {
    let wsHeader = '';

    getTemplateSrv()
      .getVariables()
      .forEach((myvar) => {
        wsHeader += this.processDashboardVariable(myvar);
      });

    return wsHeader;
  }

  private processDashboardVariable(myVar: any): string {
    let wsHeadertoAdd = '';

    const value = myVar.current.value;

    if ((Array.isArray(value) && value.length === 1 && value[0] === '$__all') || value === '$__all') {
      // User checked the "select all" checkbox
      if (myVar.allValue && myVar.allValue !== '') {
        // User also defined a custom value in the variable settings
        const customValue: String = myVar.allValue;
        wsHeadertoAdd += `[ '${customValue}' ] '${myVar.name}_list' STORE\n`;
        // custom all value is taken as it is. User may or may not use a regexp.
        wsHeadertoAdd += ` '${customValue}' '${myVar.name}' STORE\n`;
      } else {
        // if no custom all value is defined :
        // it means we shall create a list of all the values in WarpScript from options, ignoring "$__all" special option value.
        const allValues: String[] = myVar.options
          .filter((o: { value: string }) => o.value !== '$__all')
          .map((o: { value: any }) => o.value);
        wsHeadertoAdd += `[ ${allValues.map((s) => `'${s}'`).join(' ')} ] '${myVar.name}_list' STORE\n`; // all is stored as string in generated WarpScript.
        // create a ready to use regexp in the variable
        wsHeadertoAdd += ` '~' $${myVar.name}_list REOPTALT + '${myVar.name}' STORE\n`;
      }
    } else if (Array.isArray(value)) {
      // user checks several choices
      wsHeadertoAdd += `[ ${value.map((s) => `'${s}'`).join(' ')} ] '${myVar.name}_list' STORE\n`; // all is stored as string in generated WarpScript.
      if (1 === value.length) {
        // one value checked : copy it as it is in WarpScript variable
        wsHeadertoAdd += ` '${value[0]}' '${myVar.name}' STORE\n`;
      } else {
        // several values checked : do a regexp
        //also create a ready to use regexp, suffixed by _wsregexp
        wsHeadertoAdd += ` '~' $${myVar.name}_list REOPTALT + '${myVar.name}' STORE\n`;
      }
    } else {
      // no multiple selection, variable is the string. As type is lost by Grafana, there is no safe way to assume something different than a string here.
      // List is also created to create scripts compatible whatever the defined selection mode
      wsHeadertoAdd += `[ '${value}' ] '${myVar.name}_list' STORE\n`;
      wsHeadertoAdd += `'${value}' '${myVar.name}' STORE\n`;
    }
    return wsHeadertoAdd;
  }

  /**
   * Compute time variable store it on top of the stack
   * @param request
   * @private
   */
  private computeTimeVars(request: DataQueryRequest<WarpQuery>): string {
    let vars: any = {};

    // computeTimeVars comes from this.query()
    // If the method is called from Grafana the request.range field is well formed
    // but if the request is called from metricFindQuery() because you are in proxy mode, we need to give fake data to make it through backend server
    try {
      vars = {
        start: request.range.from.toDate().getTime() * 1000,
        startISO: request.range.from.toISOString(),
        end: request.range.to.toDate().getTime() * 1000,
        endISO: request.range.to.toISOString(),
      };
    } catch (error) {
      vars = {
        start: (request.range.from as unknown as Date).getTime() * 1000,
        startISO: (request.range.from as unknown as Date).toISOString(),
        end: (request.range.to as unknown as Date).getTime() * 1000,
        endISO: (request.range.to as unknown as Date).toISOString(),
      };
    }

    vars.interval = vars.end - vars.start;
    vars.__interval = Math.floor(vars.interval / (request.maxDataPoints || 1));
    vars.__interval_ms = Math.floor(vars.__interval / 1000);

    let str = '';
    for (let gVar in vars) {
      str += `${isNaN(vars[gVar]) ? `'${vars[gVar]}'` : vars[gVar]} '${gVar}' STORE `;
    }

    return str;
  }

  /**
   * Management of query type dashboard variables
   * @param query
   * @param options
   */
  async metricFindQuery(query: string, options?: any): Promise<MetricFindValue[]> {
    let warpQuery: WarpQuery = {
      refId: '',
      expr: this.addDashboardVariables() + this.computeGrafanaContext() + query,
      hideLabels: false,
    };

    const result$ = this.query({
      targets: [warpQuery],
      scopedVars: {},
      range: {
        from: new Date(),
        to: new Date(Date.now() + 3600 * 1000),
        raw: {
          from: new Date(),
          to: new Date(Date.now() + 3600 * 1000),
        },
      },
    } as unknown as DataQueryRequest<WarpQuery>).pipe(
      map((value) => {
        return value?.data.flatMap((frame) => {
          return frame.fields.flatMap((field: any) => {
            if (field.values) {
              const elt = field.values;

              if (field.name.includes('array_value')) {
                // simple array response, defined in backend
                // (we cannot differentiate variable query from panels' requests)
                if (elt.buffer !== undefined) {
                  return elt.buffer.map((v: any) => ({ text: v }));
                } else {
                  return elt.map((v: any) => ({ text: v }));
                }
              } else if (isArray(elt)) {
                return elt.map((v) => ({
                  text: v.toString(),
                  value: v.toString(),
                }));
              } else if (isObject(elt)) {
                return Object.entries(elt).map(([key, value]) => ({
                  text: key.toString(),
                  value: value.toString(),
                }));
              } else {
                return [
                  {
                    text: elt.toString(),
                    value: elt.toString(),
                  },
                ];
              }
            } else {
              return [];
            }
          });
        });
      })
    );
    return await lastValueFrom(result$);
  }
}
