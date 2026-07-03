// Opt-in pack of common, non-stock helpers some hosts register alongside the
// JSLT core (see plan §6/§10) — not part of stock JSLT, kept separate so core
// stays a faithful translation. Each is a plain object satisfying the
// Function contract (getName/getMinArguments/getMaxArguments/call), so they
// register directly via `withFunctions`/the `functions` compile option.

import { fromJS, toJS } from "../json/mapper.js";

function fn(name, min, max, impl) {
  return {
    getName: () => name,
    getMinArguments: () => min,
    getMaxArguments: () => max,
    call: (_input, args) => fromJS(impl(...args.map(toJS))),
  };
}

// App-specific — exact output shape must match whatever host system money(x)
// originally meant (this is a placeholder passthrough); override via
// `functions` if your host has different rounding/currency semantics.
const money = fn("money", 1, 1, (x) => (x == null ? null : x));

const fullName = fn("fullName", 2, 2, (first, last) => {
  const parts = [first, last].filter((p) => p != null && p !== "");
  return parts.length ? parts.join(" ") : null;
});

const enumerate = fn("enumerate", 1, 1, (arr) => (arr || []).map((v, i) => ({ i, v })));

export const extensions = [money, fullName, enumerate];
