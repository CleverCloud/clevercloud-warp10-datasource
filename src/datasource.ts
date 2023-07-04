import {CoreApp, DataSourceInstanceSettings} from '@grafana/data';
import {DataSourceWithBackend, TestingStatus} from '@grafana/runtime';

import {DEFAULT_QUERY, MyDataSourceOptions, MyQuery} from './types';

export class DataSource extends DataSourceWithBackend<MyQuery, MyDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  async testDatasource(): Promise<any> {
    return {
      message: "I'm alive",
      details: undefined,
      status: "Ok"
    } as TestingStatus
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY
  }
}
