import {languages} from "monaco-editor";
import {configuration, constants, controls, functions, keywords, languageDef} from "./warpDefinition";

export const languageConfig = (monaco: typeof import("../../node_modules/monaco-editor/esm/vs/editor/editor.api"), constantsPerso: string[], macrosPerso: string[], varPerso: string[]) => {

  //Only if langage Warp10 does not exist
  if (monaco.languages.getEncodedLanguageId("Warp10") === 0) {
    monaco.languages.register({id: "Warp10"})
    monaco.languages.registerCompletionItemProvider("Warp10", {
      provideCompletionItems: (model, position, _context, _token) => {
        return {suggestions: suggestion(monaco, constantsPerso, macrosPerso, varPerso, position, model)}
      }
    })
    monaco.languages.setMonarchTokensProvider("Warp10", languageDef);
    monaco.languages.setLanguageConfiguration('Warp10', configuration);
    monaco.editor.defineTheme('grafanaTheme', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#111217',
      },
    })
  }
}

function suggestion(monaco: typeof import("../../node_modules/monaco-editor/esm/vs/editor/editor.api"), constantsPerso: string[], macrosPerso: string[], varPerso: string[], position: any, model: any) {
  const word = model.getWordUntilPosition(position);

  const constantsPersoList: languages.CompletionItem[] = [
    ...constantsPerso.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  const macroPersoList: languages.CompletionItem[] = [
    ...macrosPerso.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  const varPersoList: languages.CompletionItem[] = [
    ...varPerso.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  const keywordsList: languages.CompletionItem[] = [
    ...keywords.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  const constantsList: languages.CompletionItem[] = [
    ...constants.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  const functionsList: languages.CompletionItem[] = [
    ...functions.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  const controlsList: languages.CompletionItem[] = [
    ...controls.map(k => {
      return {
        label: k,
        kind: monaco.languages.CompletionItemKind.Method,
        insertText: k,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        }
      }
    })
  ];

  let suggestion: languages.CompletionItem[] = []
  suggestion = suggestion.concat(constantsPersoList, macroPersoList, varPersoList, keywordsList, constantsList, functionsList, controlsList)
  return suggestion
}

