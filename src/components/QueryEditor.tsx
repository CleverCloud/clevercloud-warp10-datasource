import React, {ChangeEvent} from 'react';
import {QueryEditorProps} from '@grafana/data';
import {DataSource} from '../datasource';
import {WarpDataSourceOptions, WarpQuery} from '../types';
import {TextArea} from "@grafana/ui";


type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

export function QueryEditor({query, onChange, onRunQuery}: Props) {
  const onQueryTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({...query, queryText: event.target.value});
  };


  const {queryText} = query;

  return (

    <div className="gf-form">
      <TextArea value={queryText} onChange={onQueryTextChange}/>
    </div>
  );
}
