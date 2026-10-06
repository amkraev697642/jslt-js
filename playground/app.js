import { basicSetup, EditorView } from "codemirror";
import { Compartment } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { json } from "@codemirror/lang-json";
import { setDiagnostics } from "@codemirror/lint";
import { compile, fromJS, toJS } from "jslt-js";
import { jsltLanguage } from "./editor/jslt-lang.js";
import { toDiagnostic } from "./editor/jslt-lint.js";
import { examples } from "./examples.js";

const $ = (id) => document.getElementById(id);
const pretty = (v) => JSON.stringify(v, null, 2);
const setText = (view, text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });

const b64 = {
  async enc(obj) {
    const gz = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  async dec(str) {
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const gz = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(gz).text());
  },
};

const theme = new Compartment();
const root = document.documentElement;
const isDark = () => root.dataset.theme === "dark";
const themeExt = () => theme.of(isDark() ? oneDark : []);

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
const editable = [basicSetup, themeExt(), EditorView.updateListener.of((u) => { if (u.docChanged) { schedule(); save(); } })];

const input = new EditorView({ parent: $("input"), extensions: [editable, json()] });
const jslt = new EditorView({ parent: $("jslt"), extensions: [editable, jsltLanguage] });
const output = new EditorView({ parent: $("output"), extensions: [basicSetup, themeExt(), json(), EditorView.editable.of(false)] });

$("theme").onclick = () => {
  root.dataset.theme = isDark() ? "light" : "dark";
  try { localStorage.setItem("jslt-theme", root.dataset.theme); } catch {}
  [input, jslt, output].forEach((v) => v.dispatch({ effects: theme.reconfigure(isDark() ? oneDark : []) }));
};

function status(msg, ok) { $("status").textContent = msg; $("status").className = ok ? "ok" : ""; }

function run() {
  jslt.dispatch(setDiagnostics(jslt.state, []));
  let data;
  try { data = fromJS(JSON.parse(input.state.doc.toString())); }
  catch (e) { return fail("Input JSON: " + e.message); }
  const t0 = performance.now();
  try {
    const result = compile(jslt.state.doc.toString(), "playground.jslt").applyInput(data);
    setText(output, pretty(toJS(result)));
    status(`ok · ${(performance.now() - t0).toFixed(1)} ms`, true);
  } catch (e) {
    if (e.getLine) jslt.dispatch(setDiagnostics(jslt.state, [toDiagnostic(e, jslt.state.doc)]));
    fail(e.message);
  }
}
function fail(msg) { setText(output, ""); status(msg); }

function save() {
  try { localStorage.setItem("jslt-playground", JSON.stringify({ i: input.state.doc.toString(), j: jslt.state.doc.toString() })); } catch {}
}
function load(i, j) { setText(input, i); setText(jslt, j); run(); }

$("examples").append(...examples.map((e, n) => new Option(e.name, n)));
$("examples").onchange = (e) => { const x = examples[e.target.value]; load(pretty(x.input), x.jslt); };

$("share").onclick = async () => {
  const s = await b64.enc({ i: input.state.doc.toString(), j: jslt.state.doc.toString() });
  history.replaceState(null, "", "#s=" + s);
  try { await navigator.clipboard.writeText(location.href); status("link copied", true); } catch { status("link is in the address bar", true); }
};

document.querySelectorAll(".gutter").forEach((g) => {
  g.onpointerdown = (down) => {
    const [a, b] = [g.previousElementSibling, g.nextElementSibling];
    const [wa, wb] = [a.offsetWidth, b.offsetWidth];
    g.setPointerCapture(down.pointerId);
    g.onpointermove = (m) => {
      const d = Math.max(-wa + 120, Math.min(wb - 120, m.clientX - down.clientX));
      a.style.flex = `0 0 ${wa + d}px`; b.style.flex = `0 0 ${wb - d}px`;
    };
    g.onpointerup = () => { g.onpointermove = null; };
  };
});

(async () => {
  let st;
  try { if (location.hash.startsWith("#s=")) st = await b64.dec(location.hash.slice(3)); } catch {}
  try { st ??= JSON.parse(localStorage.getItem("jslt-playground")); } catch {}
  st ? load(st.i, st.j) : load(pretty(examples[0].input), examples[0].jslt);
})();
