import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, ensureSyntaxTree, foldGutter, foldKeymap, indentOnInput, StreamLanguage, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { forEachDiagnostic, lintGutter, lintKeymap, linter, type Diagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { crosshairCursor, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, placeholder as editorPlaceholder, rectangularSelection, dropCursor, type ViewUpdate } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api } from "../api";
import type { EditorDiagnosticSummary, TomlDiagnostic } from "../types";

const basicSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  // Keep the editor's baseline behavior aligned with CodeMirror's public basicSetup.
  // All extensions are imported directly so Vite cannot embed a second state runtime.
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

export interface ConfigTextEditorHandle {
  focusFirstDiagnostic: () => void;
}

/**
 * JSON.parse 是唯一裁决：解析通过绝不报错（部分语法树/错误恢复会对合法大文档误报）；
 * 确认损坏后才用 ensureSyntaxTree 取完整语法树定位。
 */
export function collectJsonDiagnostics(state: EditorState): Diagnostic[] {
  const text = state.doc.toString();
  if (!text.trim()) return [];
  try {
    JSON.parse(text);
    return [];
  } catch {
    // 已确认损坏，继续用语法树定位
  }
  const diagnostics: Diagnostic[] = [];
  // 1 秒预算内强制解析完整棵树；超时则退回当前可用的树（文档已确认损坏，只影响定位精度）
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (!node.type.isError) return;
      diagnostics.push({
        from: node.from,
        to: Math.min(state.doc.length, Math.max(node.to, node.from + 1)),
        severity: "error",
        source: "JSON",
        message: "JSON 语法错误，请检查此处的逗号、括号或值",
      });
    },
  });
  return diagnostics;
}

interface ConfigTextEditorProps {
  value: string;
  language: "toml" | "json";
  placeholder?: string;
  readOnly?: boolean;
  validateToml?: (text: string) => Promise<TomlDiagnostic[]>;
  onChange: (value: string) => void;
  onDiagnostics: (summary: EditorDiagnosticSummary) => void;
}

const ConfigTextEditor = forwardRef<ConfigTextEditorHandle, ConfigTextEditorProps>(function ConfigTextEditor(
  { value, language, placeholder, readOnly = false, validateToml = api.validateToml, onChange, onDiagnostics },
  ref,
) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onDiagnosticsRef = useRef(onDiagnostics);
  const lastSummary = useRef<EditorDiagnosticSummary | null>(null);
  const syncingValueRef = useRef(false);
  const editingCompartment = useRef(new Compartment());

  valueRef.current = value;
  onChangeRef.current = onChange;
  onDiagnosticsRef.current = onDiagnostics;

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    focusFirstDiagnostic: () => {
      const view = viewRef.current;
      if (!view) return;
      let firstFrom: number | null = null;
      let firstTo: number | null = null;
      forEachDiagnostic(view.state, (_diagnostic, from, to) => {
        if (firstFrom === null) {
          firstFrom = from;
          firstTo = to;
        }
      });
      if (firstFrom === null || firstTo === null) return;
      view.dispatch({ selection: { anchor: firstFrom, head: firstTo }, scrollIntoView: true });
      view.focus();
    },
  }), []);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const reportDiagnostics = (view: EditorView) => {
      let count = 0;
      let firstLine: number | null = null;
      forEachDiagnostic(view.state, (_diagnostic, from) => {
        count += 1;
        if (firstLine === null) firstLine = view.state.doc.lineAt(from).number;
      });
      if (lastSummary.current?.count === count && lastSummary.current.firstLine === firstLine) return;
      lastSummary.current = { count, firstLine };
      onDiagnosticsRef.current({ count, firstLine });
    };

    const jsonDiagnostics = linter((view) => collectJsonDiagnostics(view.state));
    const tomlDiagnostics = linter(async (view) => {
      const diagnostics = await validateToml(view.state.doc.toString());
      return diagnostics.map(({ from, to, message }) => ({
        from,
        to,
        severity: "error" as const,
        source: "TOML",
        message,
      }));
    });

    const editor = new EditorView({
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          editingCompartment.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          editorPlaceholder(placeholder ?? "在此编辑配置…"),
          language === "toml" ? StreamLanguage.define(toml) : json(),
          language === "toml" ? tomlDiagnostics : jsonDiagnostics,
          lintGutter(),
          ...(dark ? [oneDark] : []),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged && !syncingValueRef.current) onChangeRef.current(update.state.doc.toString());
            reportDiagnostics(update.view);
          }),
        ],
      }),
      parent,
    });
    viewRef.current = editor;
    reportDiagnostics(editor);

    return () => {
      editor.destroy();
      if (viewRef.current === editor) viewRef.current = null;
    };
  }, [dark, language, placeholder, validateToml]);

  useEffect(() => {
    const editor = viewRef.current;
    if (!editor) return;
    editor.dispatch({
      effects: editingCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const editor = viewRef.current;
    if (!editor || editor.state.doc.toString() === value) return;
    syncingValueRef.current = true;
    try {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    } finally {
      syncingValueRef.current = false;
    }
  }, [value]);

  return <div ref={hostRef} className="apple-editor-shell" />;
});

export default ConfigTextEditor;
