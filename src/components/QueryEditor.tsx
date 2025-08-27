import React, { ChangeEvent, useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { WarpDataSourceOptions, WarpQuery } from '../types/types';
import { debounceTime, tap, Subject } from 'rxjs';
import { TextArea, Button, Checkbox } from '@grafana/ui';

type Props = QueryEditorProps<DataSource, WarpQuery, WarpDataSourceOptions>;

/**
 * return number of lines of text
 * @param text
 */
function nbrLinesText(text: string | undefined) {
  return [...(text ?? '')].filter((x) => x === '\n').length + 1;
}

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  let { expr, hideLabels } = query;

  // fix to make progressive change in Grafana
  // Previous version of these plugin as already be deployed
  // this support previous plugin's data structure version
  if (!expr && expr !== '') {
    console.warn('Deprecate request detected');
    // @ts-ignore
    expr = query.queryText ?? '';
  }

  //operations changes
  let [subject, _a] = useState(new Subject<string | undefined>());
  let [onChangeObservable, _b] = useState(
    subject.asObservable().pipe(
      tap((value) => {
        onChange({ ...query, expr: value ?? '' });
      }),
      debounceTime(2000)
    )
  );

  useEffect(() => {
    let subscription = onChangeObservable.subscribe((value) => {
      // check if the warpscript is empty
      if ((value ?? '').trim() !== '') {
        onRunQuery();
      }
    });
    return () => subscription.unsubscribe();
  }, [onChangeObservable, onRunQuery]);

  const onExprChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    subject.next(event.target.value);
  };

  const handleRunQueryShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      onRunQuery();
    }
  };

  const onHideLabelsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, hideLabels: event.currentTarget.checked });
  };

  return (
    <div className="gf-form" style={{  display: 'flex', flexDirection: 'column' }}>
      <TextArea rows={nbrLinesText(expr)} value={expr} onChange={onExprChange} onKeyDown={handleRunQueryShortcut} placeholder="Enter your query here (CTRL+ENTER to run)" />
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <Checkbox 
          label="Hide labels" 
          value={hideLabels ?? false} 
          onChange={onHideLabelsChange}
        />

        {/* disabled if expr is empty */}
        <Button variant="primary" style={{ }} onClick={onRunQuery} disabled={(expr ?? '').trim() === ''}>
          Run query
        </Button>
      </div>
    </div>
  );
}
