import {DataQueryRequest, DataQueryResponse, DataSourceInstanceSettings,} from '@grafana/data';
import {DataSourceWithBackend, getBackendSrv, TestingStatus} from '@grafana/runtime';
import {from, lastValueFrom, mergeMap, Observable} from 'rxjs';

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
      mergeMap(query => {
        console.log(query.queryText)
        this.const.forEach(function (c) {
          query.queryText.replace("$" + c.name, c.value)
        })
        console.log(query.queryText)
        return this.doRequest(query)
      }),
      fetchResponse => {
        // return fetchResponse.pipe(map(res => ))
        return new Observable<DataQueryResponse>()
      }
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
