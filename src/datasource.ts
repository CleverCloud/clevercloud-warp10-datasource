import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  FieldType,
  MutableDataFrame
} from '@grafana/data';
import {DataSourceWithBackend, FetchResponse, getBackendSrv, TestingStatus} from '@grafana/runtime';
import {catchError, from, lastValueFrom, map, mergeMap, Observable, tap} from 'rxjs';

import {ConstProp, WarpDataResult, WarpDataSourceOptions, WarpQuery, WarpResult} from './types';
import {loader} from "@monaco-editor/react";

import {languageConfig} from "editor/languagesConfig"
import {isArray} from "lodash";

export class DataSource extends DataSourceWithBackend<WarpQuery, WarpDataSourceOptions> {

  //Information database
  private path: string
  /*private access: string*/
  private const: ConstProp[]

  /**
   * @param instanceSettings
   */
  constructor(instanceSettings: DataSourceInstanceSettings<WarpDataSourceOptions>) {
    super(instanceSettings);
    this.path = instanceSettings.jsonData.path ?? ""

    /*this.access = instanceSettings.jsonData.access ?? ""*/

    this.const = instanceSettings.jsonData.const ?? []

    const constantsPerso = this.const.map(c => "$" + c.name)

    //Warp10 language initialization
    loader.init().then((monaco) => {
      /*monaco.languages.registerCompletionItemProvider("Warp10", {
        provideCompletionItems: function (model, position, context, token) {
          return {suggestions: []};
        }
      }).dispose();*/
      languageConfig(monaco, constantsPerso)

    });
  }

  /**
   * used by datasource configuration page to make sure the connection is working
   * @return {Promise<any>} Response
   */
  async testDatasource(): Promise<any> {

    let message = ""
    let status = ""

    const query = lastValueFrom(this.doRequest({refId: "", queryText: "1 2 +"}))

    await query.then((value) => {
        if (value.status === 200) {
          message = "Datasource is working"
          status = "Ok"
        } else {
          message = "An error has occurred"
          status = "Error"
        }
      }
    ).catch(() => {
      message = "An error has occurred"
      status = "Error"
    })

    return {
      message: message,
      details: undefined,
      status: status
    } as TestingStatus
  }

  query(request: DataQueryRequest<WarpQuery>): Observable<DataQueryResponse> {

    const observableQueries = from(request.targets)

    return observableQueries.pipe(
      //replacing constants
      map(query => {
        query.queryText = this.computeTimeVars(request) + this.computeGrafanaContext() + query.queryText
        /*this.const.reduce(
          (modifiedQuery, {name, value}) => modifiedQuery.replace("$" + name, "'" + value + "'"),
          query.queryText
        )*/
        return query
      }),

      //doing query
      mergeMap(query => this.doRequest(query)),
      tap(request => console.log(request)),

      //creating dataframe
      map((response: FetchResponse<WarpResult>): DataQueryResponse => {

        let dataFrames;
        if (isArray(response.data[0])) {
          dataFrames = response.data[0].map((d: WarpDataResult) => this.createDataFrame(d))
        } else {
          dataFrames = [this.createDataFrame(response.data[0])]
        }
        console.log(dataFrames)
        return {
          data: dataFrames
        }
      }),
      catchError((error, _) => {
        console.log(error)
        throw error
      })
    )
  }

  createDataFrame(d: WarpDataResult) {
    return new MutableDataFrame({
      refId: d.l.host || "",
      fields: [
        {name: 'Time', type: FieldType.time, values: d.v.map(point => point[0] / 1000)},
        {
          name: 'Value',
          type: FieldType.number || FieldType.string,
          labels: d.l, values: d.v.map(point => point[point.length - 1])
        },
      ],

    })
  }

  /**
   * send request to Warp10
   * @param query
   * @return {Observable<FetchResponse<unknown>>} Response
   */
  doRequest(query: WarpQuery) {
    return getBackendSrv().fetch<WarpResult>(
      {
        url: this.path + "/api/v0/exec",
        method: "POST",
        data: query.queryText,
        headers: [['Accept', "undefined"], ['Content-Type', 'text/plain; charset=UTF-8']],
        responseType: "json"
      }
    )
  }

  /**
   * Compute Datasource variables and templating variables, store it on top of the stack
   * @return {string} WarpScript header
   */
  private computeGrafanaContext(): string {

    let wsHeader = ''
    // Datasource vars
    // this.const.forEach((myVar) => {
    //   let value = myVar.value
    //   if (typeof value === 'string') {
    //     value = value.replace(/'/g, '"')
    //   }
    //   if (typeof value === 'string' && !value.startsWith('<%') && !value.endsWith('%>')) {
    //     value = `'${value}'`
    //   }
    //   wsHeader += `${value || 'NULL'} '${myVar}' STORE\n`
    // })

    // Dashboad templating vars
    // current.text is the label. In case of multivalue, it is a string 'valueA + valueB'
    // current.value is a string, depending on query output. In case of multivalue, it is an array of strings. array contains "$__all" if user selects All.
    this.const.forEach((myVar) => {
      const value = myVar.value;


      // if (((Array.isArray(value) && (value.length === 1 && value[0] === '$__all')) || value === "$__all")) {
      //   // User checked the "select all" checkbox
      //   if (myVar.allValue && myVar.allValue !== "") {
      //     // User also defined a custom value in the variable settings
      //     const customValue: String = myVar.allValue;
      //     wsHeader += `[ '${customValue}' ] '${myVar.name}_list' STORE\n`
      //     // custom all value is taken as it is. User may or may not use a regexp.
      //     wsHeader += ` '${customValue}' '${myVar.name}' STORE\n`
      //   } else {
      //     // if no custom all value is defined :
      //     // it means we shall create a list of all the values in WarpScript from options, ignoring "$__all" special option value.
      //     const allValues: String[] = myVar.options.filter(o => o.value !== "$__all").map(o => o.value);
      //     wsHeader += `[ ${allValues.map(s => `'${s}'`).join(" ")} ] '${myVar.name}_list' STORE\n`; // all is stored as string in generated WarpScript.
      //     // create a ready to use regexp in the variable
      //     wsHeader += ` '~' $${myVar.name}_list REOPTALT + '${myVar.name}' STORE\n`
      //   }
      // } else if (Array.isArray(value)) {
      //   // user checks several choices
      //   wsHeader += `[ ${value.map(s => `'${s}'`).join(" ")} ] '${myVar.name}_list' STORE\n`; // all is stored as string in generated WarpScript.
      //   if (1 === value.length) {
      //     // one value checked : copy it as it is in WarpScript variable
      //     wsHeader += ` '${value[0]}' '${myVar.name}' STORE\n`
      //   } else {
      //     // several values checked : do a regexp
      //     //also create a ready to use regexp, suffixed by _wsregexp
      //     wsHeader += ` '~' $${myVar.name}_list REOPTALT + '${myVar.name}' STORE\n`
      //   }
      // } else {
      // no multiple selection, variable is the string. As type is lost by Grafana, there is no safe way to assume something different than a string here.
      // List is also created to create scripts compatible whatever the defined selection mode
      // wsHeader += `[ '${value}' ] '${myVar.name}_list' STORE\n`;
      wsHeader += `'${value}' '${myVar.name}' STORE\n`;
      // }
    })
    wsHeader += "LINEON\n";
    return wsHeader
  }

  /*private computePanelRepeatVars(opts): string {
    let str = ''
    if (opts.scopedVars) {
      for (let k in opts.scopedVars) {
        let v = opts.scopedVars[k]
        if (v.selected) {
          str += `'${v.value}' '${k}' STORE `
        }
      }
    }
    return str
  }*/

  private computeTimeVars(request: DataQueryRequest<WarpQuery>): string {
    let vars: any = {
      start: request.range.from.toDate().getTime() * 1000,
      startISO: request.range.from.toISOString(),
      end: request.range.to.toDate().getTime() * 1000,
      endISO: request.range.to.toISOString(),
    }
    vars.interval = vars.end - vars.start
    vars.__interval = Math.floor(vars.interval / (request.maxDataPoints || 1))
    vars.__interval_ms = Math.floor(vars.__interval / 1000)

    let str = ''
    for (let gVar in vars) {
      str += `${isNaN(vars[gVar]) ? `'${vars[gVar]}'` : vars[gVar]} '${gVar}' STORE `
    }

    return str
  }
}


