import {DataQueryRequest, DataQueryResponse, DataSourceInstanceSettings, FieldType, toDataFrame,} from '@grafana/data';
import {DataSourceWithBackend, FetchResponse, getBackendSrv, TestingStatus} from '@grafana/runtime';
import {from, lastValueFrom, map, mergeMap, Observable, tap} from 'rxjs';

import {ConstProp, WarpDataSourceOptions, WarpQuery} from './types';
import {loader} from "@monaco-editor/react";

import {languageConfig} from "editor/languagesConfig"

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
      const {dispose} = monaco.languages.registerCompletionItemProvider("Warp10", {
        provideCompletionItems: function (model, position, context, token) {
          return {suggestions: []};
        }
      })
      dispose();
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
        query.queryText = this.const.reduce(
          (modifiedQuery, {name, value}) => modifiedQuery.replace("$" + name, value),
          query.queryText
        )
        return query
      }),

      //doing query
      mergeMap(query => this.doRequest(query)),
      tap(request => console.log(request)),

      //creating dataframe
      map((response: FetchResponse<any>): DataQueryResponse => {

        let dataFrames = response.data[0].map((d: { v: any[], l: { host: string } }) => {
          return toDataFrame({
            name: d.l.host,
            fields: [
              {name: 'Time', type: FieldType.time, values: d.v.map(point => point[0])},
              {name: 'Value', type: FieldType.number, values: d.v.map(point => point[4])},
            ],
          })
        })

        return {
          data: dataFrames
        }
      })
    )
  }

  /**
   * send request to Warp10
   * @param query
   * @return {Observable<FetchResponse<unknown>>} Response
   */
  doRequest(query: WarpQuery) {
    return getBackendSrv().fetch(
      {
        url: this.path + "/api/v0/exec",
        method: "POST",
        data: query.queryText,
        headers: [['Accept', "undefined"], ['Content-Type', 'text/plain; charset=UTF-8']]
      }
    )
  }


}
