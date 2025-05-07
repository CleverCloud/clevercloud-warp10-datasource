import React, { useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { WarpDataSourceOptions, WarpQuery } from '../types/types';
import { debounceTime, tap, Subject } from 'rxjs';
import { Editor } from '@monaco-editor/react';
import { setupMonaco } from '../editor/languageConfig';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

setupMonaco(monaco);

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  let { expr } = query;

  // fix to make progressive change in Grafana
  // Previous version of these plugin as already be deployed
  // this support previous plugin's data structure version
  if (!expr && expr !== '') {
    console.warn('Deprecate request detected');
    // @ts-ignore
    expr = query.queryText;
  }

  //operations changes
  const [heightEditor, setHeightEditor] = useState(200);
  let [subject, _a] = useState(new Subject<string | undefined>());
  let [onChangeObservable, _b] = useState(
    subject.asObservable().pipe(
      tap((value) => {
        setHeightEditor((value ?? '').split('\n').length > 10 ? 200 : (value ?? '').split('\n').length * 20);
        onChange({ ...query, expr: value ?? '' });
      }),
      debounceTime(2000)
    )
  );

  useEffect(() => {
    let subscription = onChangeObservable.subscribe(() => onRunQuery());
    return () => subscription.unsubscribe();
  }, [onChangeObservable, onRunQuery]);

  const onExprChange = (value: string | undefined) => {
    subject.next(value);
  };

  return (
    <div className="gf-form" style={{ border: 'solid 1px #2e3136' }}>
      <Editor
        height={heightEditor}
        defaultLanguage="Warp10"
        theme="vs-dark"
        defaultValue=""
        value={expr}
        onChange={onExprChange}
        options={{
          minimap: { enabled: false },
        }}
      />
    </div>
  );
}
