import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { configuration, languageDef } from './warpDefinition';

export function setupMonaco(monacoInstance: typeof monaco) {
  monacoInstance.languages.register({ id: 'Warp10' });
  monacoInstance.languages.setMonarchTokensProvider('Warp10', languageDef);
  monacoInstance.languages.setLanguageConfiguration('Warp10', configuration);

  console.debug('monaco-editor: custom language and theme registered');
}
