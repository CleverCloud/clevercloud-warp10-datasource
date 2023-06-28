import {DataSourceInstanceSettings,} from '@grafana/data';
import {DataSourceWithBackend, getBackendSrv, TestingStatus} from '@grafana/runtime';
import {lastValueFrom} from 'rxjs';

import {WarpDataSourceOptions, WarpQuery} from './types';


export class DataSource extends DataSourceWithBackend<WarpQuery, WarpDataSourceOptions> {

  //Information database
  private path: string

  /*private access: string
  private const: ConstProp[]*/

  /**
   * @param instanceSettings
   */
  constructor(instanceSettings: DataSourceInstanceSettings<WarpDataSourceOptions>) {
    super(instanceSettings);
    this.path = instanceSettings.jsonData.path ?? ""
    /*this.access = instanceSettings.jsonData.access ?? ""
    this.const = instanceSettings.jsonData.const ?? []*/
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

  /*query(request: DataQueryRequest<MyQuery>): Observable<DataQueryResponse> {

  }*/

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
