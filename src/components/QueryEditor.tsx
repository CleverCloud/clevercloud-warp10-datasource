import React, {useEffect, useState} from 'react';
import {QueryEditorProps} from '@grafana/data';
import {DataSource} from '../datasource';
import {WarpDataSourceOptions, WarpQuery} from '../types';
import {Editor} from "@monaco-editor/react";
import {debounceTime, tap, Subject} from 'rxjs';


type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

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
  let [heightEditor, setHeightEditor] = useState(nbrLinesText(queryText) * 20)

  //operations changes
  let [subject, _a] = useState(new Subject<string | undefined>())
  let [onChangeObservable, _b] = useState(subject.asObservable().pipe(
    tap(value => {
      //update height editor
      const nbrLine = nbrLinesText(value)
      if (nbrLine > 10) {
        setHeightEditor(200)
      } else {
        setHeightEditor(nbrLine * 20)
      }

      onChange({...query, queryText: value ?? ''})
    }),
    debounceTime(2000),
  ))

  useEffect(() => {
    let subscription = onChangeObservable.subscribe(() => onRunQuery())
    return () => subscription.unsubscribe()
  }, [onChangeObservable, onRunQuery])

  const onQueryTextChange = (value: string | undefined) => {
    subject.next(value)
  }

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
