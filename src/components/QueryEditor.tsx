import React, { ChangeEvent, useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { WarpDataSourceOptions, WarpQuery } from '../types/types';
import { debounceTime, tap, Subject } from 'rxjs';
import { TextArea, Button } from '@grafana/ui';

type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

/**
 * return number of lines of text
 * @param text
 */
function nbrLinesText(text: string | undefined) {
  return [...(text ?? '')].filter((x) => x === '\n').length + 1;
}

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  let { expr } = query;

  // fix to make progressive change in Grafana
  // Previous version of these plugin as already be deployed
  // this support previous plugin's data structure version
  if (!expr && expr !== '') {
    console.warn('Deprecate request detected');
    // @ts-ignore
    expr = query.queryText ?? '';
  }

  //operations changes
  let [subject] = useState(new Subject<string | undefined>());
  let [onChangeObservable] = useState(
    subject.asObservable().pipe(
      tap((value) => {
        onChange({ ...query, expr: value ?? '' });
      }),
      debounceTime(2000)
    )
  );

  useEffect(() => {
    let subscription = onChangeObservable.subscribe((value) => {
      if ((value ?? '').trim() !== '') {
        onRunQuery();
      }
    });
    return () => subscription.unsubscribe();
  }, [onChangeObservable, onRunQuery]);

  const [localExpr, setLocalExpr] = useState(expr ?? '');
  useEffect(() => {
    setLocalExpr(expr ?? '');
  }, [expr]);

  const onExprChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setLocalExpr(value);
    subject.next(value);
  };

  const handleRunQuery = () => {
    if ((localExpr ?? '').trim() === '') {
      return;
    }
    onChange({ ...query, expr: localExpr });
    onRunQuery();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleRunQuery();
    }
  };

  return (
    <div className="gf-form" style={{ border: 'solid 1px #2e3136', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
      <TextArea rows={nbrLinesText(localExpr)} value={localExpr} onChange={onExprChange} onKeyDown={handleKeyDown} placeholder="Enter your query here" />
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button variant="primary" style={{ minWidth: 120 }} onClick={handleRunQuery} disabled={(localExpr ?? '').trim() === ''}>
          Run Query
        </Button>
      </div>
    </div>
  );
}
