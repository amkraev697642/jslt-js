// The ready-made editor (jslt-editor, and the single-file jslt-editor/standalone): CodeMirror, JSON and XML modes and a theme are included,
// so a page needs one <script> and no bundler. Exposes globalThis.JsltEditor.
import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, keymap } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { linter, setDiagnostics } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { jsltLanguage, jsltHighlight, jsltAssist, toDiagnostic, jsonSyntaxErrors } from "./cm/index.js";
import { formatJslt } from "./core/format.js";
import { tokenRange } from "./core/errors.js";

export { formatJslt, toDiagnostic, tokenRange };
export { FUNCTION_DOCS } from "./core/docs.js";

// Highlighted ranges (search hits and the like): setMarks([{from, to, cls?}]), cls defaults to "find-hit".
const marksEffect = StateEffect.define();
const marksField = StateField.define({
  create: () => Decoration.none,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(marksEffect)) set = Decoration.set(e.value.map((r) => Decoration.mark({ class: r.cls || "find-hit" }).range(r.from, r.to)), true);
    }
    return set;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// language: "jslt" | "json" | "xml" | "text". getFiles() -> Map(name -> text) for import completion.
// swallowKeys: keys (e.g. "Mod-Enter", "Mod-f") the editor must not act on, so the host page can; they still bubble up.
// One editor can show many documents: newState() builds a per-document state (own undo history, selection) and
// setState() swaps it in, the usual CodeMirror pattern for tabs.
export function createEditor({ parent, doc = "", language = "text", readOnly = false, dark = false, onChange, getFiles = () => new Map(), swallowKeys = [] }) {
  const theme = new Compartment(), lang = new Compartment(), access = new Compartment();
  const modes = {
    jslt: () => [jsltLanguage, jsltHighlight, jsltAssist(() => ({ files: getFiles() }))],
    json: () => [json(), linter(jsonSyntaxErrors)],
    xml: () => xml(),
    text: () => [],
  };
  const accessExt = (ro) => [EditorState.readOnly.of(ro), EditorView.editable.of(!ro)];
  const newState = (o = {}) => EditorState.create({
    doc: o.doc ?? "",
    extensions: [
      Prec.highest(keymap.of(swallowKeys.map((key) => ({ key, run: () => true })))),
      basicSetup,
      marksField,
      theme.of(state.dark ? oneDark : []),
      lang.of(modes[o.language || "text"]()),
      access.of(accessExt(!!o.readOnly)),
      EditorView.updateListener.of((u) => { if (u.docChanged && onChange) onChange(u.state.doc.toString(), u); }),
    ],
  });
  const state = { dark };
  const view = new EditorView({ parent, state: newState({ doc, language, readOnly }) });
  const api = {
    view,
    getText: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    newState,
    getState: () => view.state,
    setState: (s) => view.setState(s),
    setLanguage: (name) => view.dispatch({ effects: lang.reconfigure(modes[name]()) }),
    setReadOnly: (ro) => view.dispatch({ effects: access.reconfigure(accessExt(ro)) }),
    setDark(on) {
      state.dark = on;
      view.dispatch({ effects: theme.reconfigure(on ? oneDark : []) });
    },
    // errors: JsltException or [{from, to, message, severity?}]; pass null/[] to clear
    setErrors(errors) {
      const list = !errors ? [] : Array.isArray(errors) ? errors : [toDiagnostic(errors, view.state.doc)];
      view.dispatch(setDiagnostics(view.state, list.map((d) => ({ severity: "error", ...d }))));
    },
    setMarks: (list) => view.dispatch({ effects: marksEffect.of(list) }),
    // 1-based line/column -> {from, to} of the token there
    rangeAt: (line, col) => tokenRange(view.state.doc.toString(), line, col),
    getSelection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    getScroll: () => view.scrollDOM.scrollTop,
    setScroll: (top) => { view.scrollDOM.scrollTop = top; },
    format() {
      const text = view.state.doc.toString(), out = formatJslt(text);
      if (out !== text) api.setText(out);
    },
    // Scrolls pos into view without moving the selection or focus.
    scrollTo: (pos) => view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) }),
    reveal(from, to = from) {
      view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
  return api;
}
