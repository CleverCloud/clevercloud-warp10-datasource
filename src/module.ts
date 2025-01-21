import {DataSourcePlugin} from '@grafana/data';
import {DataSource} from './datasource';
import {ConfigEditor} from './components/ConfigEditor';
import {QueryEditor} from './components/QueryEditor';
import {WarpQuery, WarpDataSourceOptions} from './types/types';

export const plugin = new DataSourcePlugin<DataSource, WarpQuery, WarpDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
