import {DataQuery, DataSourceJsonData} from '@grafana/data';

export interface WarpQuery extends DataQuery {
  queryText: string;
}

export interface ConstProp {
  name: string,
  value: string
}

/**
 * These are options configured for each DataSource instance
 */
export interface WarpDataSourceOptions extends DataSourceJsonData {
  path?: string;
  access?: string;
  const?: ConstProp[];
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey?: string;
}

export interface WarpDataResult {
  c: string,
  l: any,
  a: any,
  la: number,
  v: number[][]
}

export type WarpResult = WarpDataResult[] | WarpDataResult[][]
