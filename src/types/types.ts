import {DataSourceJsonData} from '@grafana/data';
import {DataQuery} from '@grafana/schema'

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
  access?: 'DIRECT' | 'PROXY';
  const?: ConstProp[];
  macro?: ConstProp[];
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey?: string;
}

/**
 * Result query interface for GTS
 */
export interface WarpDataResult {
  c: string,
  l: any,
  a: any,
  la: number,
  v: number[][]
}

export type WarpVariableResult = WarpVariableResultEntry[] | WarpVariableResultEntry | Record<string, WarpVariableResultEntry>

export type WarpVariableResultEntry = string | number

export type WarpResult = WarpDataResult[] | WarpDataResult[][]

