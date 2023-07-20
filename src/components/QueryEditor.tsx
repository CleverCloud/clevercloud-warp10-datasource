import React, {useState} from 'react';
import {QueryEditorProps} from '@grafana/data';
import {DataSource} from '../datasource';
import {WarpDataSourceOptions, WarpQuery} from '../types';
import {Editor} from "@monaco-editor/react";


type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

/**
 * trigger a function, but only once per use case
 * @param fn trigger function
 * @param ms timelines per use case
 */
function debounce(fn: Function, ms = 3000) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(args), ms);
  };
}

/**
 * return number of lines of text
 * @param text
 */
function nbrLinesText(text: string | undefined) {
  return ([...text ?? ""].filter(x => x === "\n").length + 1)
}

export function QueryEditor({query, onChange, onRunQuery}: Props) {

  const {queryText} = query;

  //height management variable
  let [heightEditor, setHeightEditor] = useState(nbrLinesText(queryText) * 20);


  const onQueryTextChange = (value: string | undefined) => {

    //update height editor
    const nbrLine = nbrLinesText(value)
    if (nbrLine > 10) {
      setHeightEditor(200)
    } else {
      setHeightEditor(nbrLine * 20)
    }

    onChange({...query, queryText: value ?? ''});
    debounceOnRunQuery()
  };

  const debounceOnRunQuery = debounce(() => onRunQuery());


  return (

    <div className="gf-form" style={{border: "solid 1px #2e3136"}}>
      <Editor height={heightEditor} defaultLanguage="Warp10" theme="grafanaTheme" defaultValue=""
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
