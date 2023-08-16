import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  FieldType,
  MutableDataFrame, TypedVariableModel
} from '@grafana/data';
import {DataSourceWithBackend, FetchResponse, getBackendSrv, getTemplateSrv, TestingStatus} from '@grafana/runtime';
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

  private macro: ConstProp[]

  private var: TypedVariableModel[]

  /**
   * @param instanceSettings
   */
  constructor(instanceSettings: DataSourceInstanceSettings<WarpDataSourceOptions>) {
    super(instanceSettings);
    this.path = instanceSettings.jsonData.path ?? ""

    /*this.access = instanceSettings.jsonData.access ?? ""*/

    this.const = instanceSettings.jsonData.const ?? []

    this.macro = instanceSettings.jsonData.macro ?? []

    this.var = getTemplateSrv().getVariables()


    const constantsPerso = this.const.map(c => "$" + c.name)
    const macrosPerso = this.macro.map(c => "@" + c.name)
    const varPerso = this.var.map(c => "$" + c.name)

    //Warp10 language initialization
    loader.init().then((monaco) => {
      languageConfig(monaco, constantsPerso, macrosPerso, varPerso)

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
   * Compute Datasource constant, macro and templating variables, store it on top of the stack
   * @return {string} WarpScript header
   */
  private computeGrafanaContext(): string {

    let wsHeader = ''

    //Add constants
    this.const.forEach((myVar) => {

      wsHeader += `'${myVar.value}' '${myVar.name}' STORE\n`;

    })

    //Add macros
    this.macro.forEach((myMacro) => {
      wsHeader += `${myMacro.value} '${myMacro.name}' STORE\n`;
    })


    //Add Variables
    const templateSrv = getTemplateSrv();
    this.var.forEach((myVar) => {
      const label = '${' + myVar.name + ':json}';
      let val = templateSrv.replace(label);

      //Variable multi
      if (val[0] === "[") {
        let valList = JSON.parse(val)
        let valListChar = "[ "
        valList.forEach((x: string) => {

          //string
          if (!isNaN(+x)) {
            valListChar += x + " "

            //int
          } else {
            valListChar += "'" + x + "' "
          }
        })
        valListChar += "]"

        wsHeader += `${valListChar} '${myVar.name}' STORE\n`;
      } else {

        //string
        if (isNaN(+val)) {
          wsHeader += `'${val}' '${myVar.name}' STORE\n`;

          //int
        } else {
          wsHeader += `${val} '${myVar.name}' STORE\n`;
        }
      }
    })


    wsHeader += "LINEON\n";
    return wsHeader
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


