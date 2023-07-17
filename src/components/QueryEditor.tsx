import React, {useState} from 'react';
import {QueryEditorProps} from '@grafana/data';
import {DataSource} from '../datasource';
import {WarpDataSourceOptions, WarpQuery} from '../types';
import {Editor} from "@monaco-editor/react";


type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

export function QueryEditor({query, onChange, onRunQuery}: Props) {

  const {queryText} = query;
  let [heigthEditor, setHeigthEditor] = useState(20);


  const onQueryTextChange = (value: string | undefined) => {

    const nbrLine = ([...value ?? ""].filter(x => x === "\n").length + 1)

    if (nbrLine > 10) {
      setHeigthEditor(200)
    } else {
      setHeigthEditor(nbrLine * 20)
    }
    onChange({...query, queryText: value ?? ''});
  };

  return (

    <div className="gf-form" style={{border: "solid 1px #2e3136"}}>
      <Editor height={heigthEditor} defaultLanguage="Warp10" theme="grafanaTheme" defaultValue="// some comment"
              value={queryText} onChange={onQueryTextChange}
              options={{
                scrollBeyondLastLine: false,
                minimap: {
                  enabled: false,
                },
              }}
      />
    </div>
  );
}
