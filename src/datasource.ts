import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  FieldType,
  MetricFindValue,
  MutableDataFrame,
  ScopedVars,
  TypedVariableModel,
} from '@grafana/data';
import { DataSourceWithBackend, FetchResponse, getBackendSrv, getTemplateSrv, TestingStatus } from '@grafana/runtime';

import { catchError, from, lastValueFrom, map, mergeMap, Observable, tap } from 'rxjs';
import { reduce } from 'rxjs/operators';

import {
  ConstProp,
  WarpDataResult,
  WarpDataSourceOptions,
  WarpQuery,
  WarpResult,
  WarpVariableResult,
} from './types/types';

import { isArray, isObject } from 'lodash';
import { Table } from './types/table';

export class DataSource extends DataSourceWithBackend<WarpQuery, WarpDataSourceOptions> {
  //Information database
  private path: string;

  private access: 'DIRECT' | 'PROXY';

  private const: ConstProp[];

  private macro: ConstProp[];

  private var: TypedVariableModel[];

  private request!: DataQueryRequest<WarpQuery>;

  /**
   * @param instanceSettings
   */
  constructor(instanceSettings: DataSourceInstanceSettings<WarpDataSourceOptions>) {
    console.log(instanceSettings.jsonData);
    super(instanceSettings);
    this.path = instanceSettings.jsonData.path ?? '';

    this.access = instanceSettings.jsonData.access ?? 'DIRECT';

    this.const = instanceSettings.jsonData.const ?? [];

    this.macro = instanceSettings.jsonData.macro ?? [];

    this.var = getTemplateSrv().getVariables();
  }

  /**
   * NOTE: if you do modify the structure or use template variables, alerting queries may not work
   * as expected
   * */
  applyTemplateVariables(query: WarpQuery, _scopedVars: ScopedVars): WarpQuery {
    return {
      ...query,
      expr:
        this.computeTimeVars(this.request) +
        this.addDashboardVariables() +
        this.computeGrafanaContext() +
        this.computePanelRepeatVars(_scopedVars) +
        query.expr,
    };
  }

  /**
   * used by datasource configuration page to make sure the connection is working
   * @return {Promise<any>} Response
   */
  async testDatasource(): Promise<any> {
    return this.access === 'DIRECT' ? this.checkHealth() : super.callHealthCheck();
  }

  async checkHealth(): Promise<any> {
    let message = '';
    let status = '';

    const query = lastValueFrom(this.doRequest({ refId: '', expr: '1 2 +' }));

    await query
      .then((value) => {
        if (value.status === 200) {
          message = 'Datasource is working';
          status = 'Ok';
        } else {
          message = 'An error has occurred';
          status = 'Error';
        }
      })
      .catch(() => {
        message = 'An error has occurred';
        status = 'Error';
      });

    return {
      message: message,
      details: undefined,
      status: status,
    } as TestingStatus;
  }

  query(request: DataQueryRequest<WarpQuery>): Observable<DataQueryResponse> {
    // fix to make progressive change in Grafana Corp
    // Previous version of these plugin as already be deployed
    // this support previous plugin's data structure version
    // @ts-ignore
    request.targets = request.targets.map((t) => {
      if (!t.expr && t.expr !== '') {
        console.warn('Deprecate request detected');
        // @ts-ignore
        t.expr = t.queryText;
      }
      return t;
    });

    this.request = request;

    // apply headers for proxy mode
    if (this.access === 'PROXY') {
      const query: WarpQuery = {
        expr: request.targets[0].expr,
        refId: request.targets[0].refId,
      };
      request.targets[0] = this.applyTemplateVariables(query, request.scopedVars);
    }

    return this.access === 'DIRECT' ? this.queryDirect(request) : super.query(request);
  }

  queryDirect(request: DataQueryRequest<WarpQuery>): Observable<DataQueryResponse> {
    const observableQueries = from(request.targets);

    return observableQueries.pipe(
      //replacing constants
      map((query) => this.applyTemplateVariables(query, request.scopedVars) as WarpQuery),

      //doing query
      mergeMap((query) => {
        return this.doRequest(query);
      }),
      tap((request) => console.log('request', request)),

      //creating dataframe
      map((response: FetchResponse<WarpResult>): DataQueryResponse => {
        // is it for a Table graph ?
        if (response.data.length === 1 && response.data[0] && Table.isTable(response.data[0])) {
          const d: Table = response.data[0] as unknown as Table;
          return {
            data: this.createDataFrameFromTable(d),
          };
        }

        const refId: string = (request.targets[0] || {}).refId ?? '';
        let dataFrames: MutableDataFrame[] = [];
        response.data.map((elt) => {
          if (isArray(elt)) {
            dataFrames = [...dataFrames, ...elt.map((d: WarpDataResult) => this.createDataFrame(refId, d))];
          } else {
            dataFrames = [...dataFrames, this.createDataFrame(refId, elt)];
          }
        });

        return {
          data: dataFrames,
        };
      }),
      catchError((error, _) => {
        console.log('error', error);
        throw error;
      })
    );
  }

  createDataFrameFromTable(d: Table) {
    return [
      new MutableDataFrame({
        // @ts-ignore : should return this kind of object to be compatible to ovh plugin
        fields: d.columns.map((c, index) => {
          let obj = {
            name: c.text,
            config: {},
            type: c.type,
            values: d.rows.map((r) => r[index]),
          };

          if (c.sort && c.desc) {
            obj = {
              ...obj,
              config: {
                sort: c.sort,
                desc: c.desc,
              },
            };
          }

          return obj;
        }),
      }),
    ];
  }

  createDataFrame(refId: string, d: WarpDataResult): MutableDataFrame {
    return new MutableDataFrame({
      refId: refId,
      name: d.c || '',
      fields: [
        {
          name: 'Time',
          type: FieldType.time,
          values: d.v.map((point) => point[0] / 1000),
        },
        {
          name: 'Value',
          type: FieldType.number || FieldType.string,
          values: d.v.map((point) => point[point.length - 1]),
        },
      ],
    });
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
    let str = '';
    if (scopedVars) {
      for (let k in scopedVars) {
        let v = scopedVars[k];

        if (v.selected || this.scopedVarIsAll(k)) {
          str += `'${v.value}' '${k}' STORE \n`;
        }
      }
    }

    return str;
  }

  /**
   * Test if a named scoped variable is set to all
   *
   * @param name string The name of scoped variable
   * @return bool If the scoped variable is set to all
   */
  private scopedVarIsAll(name: string): boolean {
    for (let i = 0; i < this.var.length; i++) {
      const v = this.var[i] as any;
      if (v.name === name && v.current.value.length === 1 && v.current.value[0] === '$__all') {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute Datasource constant and macro, store it on top of the stack
   * @return {string} WarpScript header
   */
  private computeGrafanaContext(): string {
    let wsHeader = '';

    //Add constants
    this.const.forEach((myVar) => {
      wsHeader += `'${myVar.value}' '${myVar.name}' STORE\n`;
    });

    //Add macros
    this.macro.forEach((myMacro) => {
      wsHeader += `${myMacro.value} '${myMacro.name}' STORE\n`;
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
    let vars: any = {
      start: request.range.from.toDate().getTime() * 1000,
      startISO: request.range.from.toISOString(),
      end: request.range.to.toDate().getTime() * 1000,
      endISO: request.range.to.toISOString(),
    };
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
    };

    // Grafana can handle different text/value for the variable drop list. User has three possibilites in the WarpScript result:
    // 1 - let a list on the stack : text = value for each entry.
    // 2 - let a map on the stack : text = map key, value = map value. value will be used in the WarpScript variable.
    // 3 - let some strings or numbers on the stack : it will be considered as a list, refer to case 1.
    // Values could be strings or number, ignore other objects.
    return lastValueFrom(
      this.doRequest<WarpVariableResult[]>(warpQuery).pipe(
        reduce<FetchResponse<WarpVariableResult[]>, MetricFindValue[]>((entries, res) => {
          let tab: MetricFindValue[] = res.data.flatMap((elt) => {
            if (isArray(elt)) {
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
          });
          return entries.concat(tab);
        }, [])
      )
    );
  }
}
