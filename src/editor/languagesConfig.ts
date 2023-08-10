import {languages} from "monaco-editor";
import {configuration, constants, controls, functions, keywords, languageDef} from "./warpDefinition";

export const languageConfig = (monaco: typeof import("../../node_modules/monaco-editor/esm/vs/editor/editor.api"), constantsPerso: string[]) => {
  monaco.languages.register({id: "Warp10"})
  monaco.languages.registerCompletionItemProvider("Warp10", {
    provideCompletionItems: (model, position, context, token) => {
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
      suggestion = suggestion.concat(constantsPersoList, keywordsList, constantsList, functionsList, controlsList)
      return {suggestions: suggestion}
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

