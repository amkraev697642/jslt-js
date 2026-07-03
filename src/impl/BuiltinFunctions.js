import { randomUUID as cryptoRandomUUID } from "./cryptoGlobal.js";

// Port of impl/BuiltinFunctions.java — all builtin function/macro implementations.
// Kept as one file, mirroring the original (which deliberately keeps every
// builtin as a nested class here rather than splitting into many files).

import { AbstractFunction } from "./AbstractFunction.js";
import { AbstractCallable } from "./AbstractCallable.js";
import { JsltException } from "../JsltException.js";
import {
  isTrue, isValue, toJson, toJsonArray, toStringValue, toArray, number as numberFn,
  convertObjectToArray, mapper,
} from "./NodeUtils.js";
import { NullNode, BooleanNode, TextNode } from "../json/JsonNode.js";
import { IntNode, LongNode, DoubleNode } from "../json/NumericNode.js";
import { readTree } from "../json/mapper.js";
import { EqualsComparison } from "./EqualsComparison.js";
import { ComparisonOperator } from "./ComparisonOperator.js";
import { BoundedCache } from "./BoundedCache.js";
import { printHexBinary } from "./Utils.js";
import { sha256 } from "./sha256.js";

// ===== HELPER METHODS (impl/BuiltinFunctions.java "HELPER METHODS" section)

// Shared regexp cache. Stored as bare (non-global) RegExp objects — the
// stateless-Pattern / stateful-Matcher split Java has: a cached pattern is
// reused directly wherever a single from-position-0 search suffices
// (test/capture/split); call sites that need iteration (replace) clone a
// fresh "g"-flagged RegExp from it instead of mutating the shared object.
const regexpCache = new BoundedCache(1000);

export function getRegexp(regexp) {
  let p = regexpCache.get(regexp);
  if (p == null) {
    try {
      p = new RegExp(regexp);
    } catch (e) {
      throw new JsltException(`Syntax error in regular expression '${regexp}'`, e);
    }
    regexpCache.put(regexp, p);
  }
  return p;
}

// Java's String.split(regex) with the default limit=0: drops trailing empty
// strings only (not leading/middle ones), and special-cases an empty input
// to a single-element [""] before that rule even applies.
function javaSplit(str, pattern) {
  if (str.length === 0) return [""];
  const parts = str.split(pattern);
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

// Java's String.hashCode(): h = h*31 + charCode, over UTF-16 code units,
// wrapping as a 32-bit signed int.
function javaStringHashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

// Canonical JSON text with object keys sorted alphabetically at every level —
// what Jackson's SORT_PROPERTIES_ALPHABETICALLY + ORDER_MAP_ENTRIES_BY_KEYS
// produce when hash-int serializes a JsonNode tree. Scalars reuse each node's
// own toString(), which is already Jackson-compatible (see json/NumericNode.js).
function canonicalJsonForHash(node) {
  if (node.isArray()) {
    const parts = [];
    for (const e of node.elements()) parts.push(canonicalJsonForHash(e));
    return "[" + parts.join(",") + "]";
  }
  if (node.isObject()) {
    const keys = [...node.fieldNames()].sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalJsonForHash(node.get(k)));
    return "{" + parts.join(",") + "}";
  }
  return node.toString();
}

// Java's URLDecoder.decode default form-encoding: "+" means space.
function decodeForm(s) { return decodeURIComponent(s.replace(/\+/g, " ")); }

// A node's underlying numeric value as BigInt, whether it's stored as a JS
// number (IntNode/DoubleNode) or already BigInt (LongNode/BigIntegerNode).
function asBigInt(node) { const v = node.value; return typeof v === "bigint" ? v : BigInt(Math.trunc(v)); }

// ===== Macro contract (Java: private abstract AbstractMacro extends AbstractCallable implements Macro)

class AbstractMacro extends AbstractCallable {
  // call(scope, input, parameters: ExpressionNode[]) -> JsonNode, implemented by Fallback below
}

// Java: private abstract AbstractRegexpFunction extends AbstractFunction implements RegexpFunction.
// JS can't multiple-inherit; FunctionExpression.optimize() detects this contract
// by checking for a regexpArgumentNumber() method rather than by base class.
class AbstractRegexpFunction extends AbstractFunction {
  regexpArgumentNumber() { return 1; }
}

// ===== TYPE PREDICATES (is-boolean, is-object, is-array, is-string,
// is-number, is-integer, is-decimal) — all `toJson(args[0].<method>())`.

class Predicate extends AbstractFunction {
  constructor(name, method) {
    super(name, 1, 1);
    this.method = method;
  }
  call(_input, args) { return toJson(args[0][this.method]()); }
}

// ===== NUMBER

class NumberFn extends AbstractFunction {
  constructor() { super("number", 1, 2); }
  call(_input, args) {
    if (args.length === 1) return numberFn(args[0], true, null);
    return numberFn(args[0], false, null, args[1]);
  }
}

// ===== ROUND / FLOOR / CEILING

// round/floor/ceiling share everything but the name and the Math fn.
class Rounder extends AbstractFunction {
  constructor(name, mathFn) {
    super(name, 1, 1);
    this.mathFn = mathFn;
  }
  call(_input, args) {
    const n = args[0];
    if (n.isNull()) return NullNode.instance;
    if (!n.isNumber()) throw new JsltException(`${this.getName()}() cannot round a non-number: ` + n);
    return new LongNode(BigInt(this.mathFn(n.doubleValue())));
  }
}

// ===== RANDOM

class Random extends AbstractFunction {
  constructor() { super("random", 0, 0); }
  call(_input, _args) { return new DoubleNode(Math.random()); }
}

// ===== SUM

class Sum extends AbstractFunction {
  constructor() { super("sum", 1, 1); }
  call(_input, args) {
    const array = args[0];
    if (array.isNull()) return NullNode.instance;
    if (!array.isArray()) throw new JsltException("sum(): argument must be array, was " + array);

    let sum = 0.0;
    let integral = true;
    for (const value of array.elements()) {
      if (!value.isNumber()) throw new JsltException("sum(): array must contain numbers, found " + value);
      integral = integral && value.isIntegralNumber();
      sum += value.doubleValue();
    }
    return integral ? new LongNode(BigInt(Math.trunc(sum))) : new DoubleNode(sum);
  }
}

// ===== MODULO

class Modulo extends AbstractFunction {
  constructor() { super("modulo", 2, 2); }
  call(_input, args) {
    const dividend = args[0];
    if (dividend.isNull()) return NullNode.instance;
    if (!dividend.isNumber()) throw new JsltException("mod(): dividend cannot be a non-number: " + dividend);

    const divisor = args[1];
    if (divisor.isNull()) return NullNode.instance;
    if (!divisor.isNumber()) throw new JsltException("mod(): divisor cannot be a non-number: " + divisor);

    if (!dividend.isIntegralNumber() || !divisor.isIntegralNumber()) {
      throw new JsltException("mod(): operands must be integral types");
    }

    const D = asBigInt(dividend);
    const d = asBigInt(divisor);
    if (d === 0n) throw new JsltException("mod(): cannot divide by zero");

    let r = D % d;
    if (r < 0n) r += d > 0n ? d : -d;

    return new LongNode(r);
  }
}

// ===== HASH-INT

class HashInt extends AbstractFunction {
  constructor() { super("hash-int", 1, 1); }
  call(_input, args) {
    const node = args[0];
    if (node.isNull()) return NullNode.instance;
    return new IntNode(javaStringHashCode(canonicalJsonForHash(node)));
  }
}

// ===== TEST

class Test extends AbstractRegexpFunction {
  constructor() { super("test", 2, 2); }
  call(_input, args) {
    if (args[0].isNull()) return BooleanNode.FALSE; // missing data never matches

    const string = toStringValue(args[0], false);
    const regexp = toStringValue(args[1], true);
    if (regexp == null) throw new JsltException("test() can't test null regexp");

    return toJson(getRegexp(regexp).test(string));
  }
}

// ===== CAPTURE
//
// Java has to regex-parse its own regex source to learn named-group names,
// because java.util.regex doesn't expose them. JS RegExp exec() results
// already carry a `.groups` object keyed by every named group in the
// pattern (undefined for ones that didn't match) — no workaround needed.

class Capture extends AbstractRegexpFunction {
  constructor() { super("capture", 2, 2); }
  call(_input, args) {
    if (args[0].isNull()) return args[0]; // null

    const string = toStringValue(args[0], false);
    const regexp = toStringValue(args[1], true);
    if (regexp == null) throw new JsltException("capture() can't match against null regexp");

    const node = mapper.createObjectNode();
    const m = getRegexp(regexp).exec(string);
    if (m && m.groups) {
      for (const [name, value] of Object.entries(m.groups)) {
        if (value !== undefined) node.set(name, new TextNode(value));
      }
    }
    return node;
  }
}

// ===== SPLIT

class Split extends AbstractRegexpFunction {
  constructor() { super("split", 2, 2); }
  call(_input, args) {
    if (args[0].isNull()) return args[0]; // null

    const string = toStringValue(args[0], false);
    const split = toStringValue(args[1], true);
    if (split == null) throw new JsltException("split() can't split on null");

    return toJsonArray(javaSplit(string, getRegexp(split)));
  }
}

// ===== LOWERCASE / UPPERCASE

// lowercase/uppercase share everything but which String method to call.
class CaseConvert extends AbstractFunction {
  constructor(name, method) {
    super(name, 1, 1);
    this.method = method;
  }
  call(_input, args) {
    if (args[0].isNull()) return args[0];
    return new TextNode(toStringValue(args[0], false)[this.method]());
  }
}

// ===== SHA256

class Sha256 extends AbstractFunction {
  constructor() { super("sha256-hex", 1, 1); }
  call(_input, args) {
    if (args[0].isNull()) return args[0];
    const message = toStringValue(args[0], false);
    return new TextNode(printHexBinary(sha256(new TextEncoder().encode(message))));
  }
}

// ===== NOT / BOOLEAN / IS-BOOLEAN

class Not extends AbstractFunction {
  constructor() { super("not", 1, 1); }
  call(_input, args) { return toJson(!isTrue(args[0])); }
}

class BooleanFn extends AbstractFunction {
  constructor() { super("boolean", 1, 1); }
  call(_input, args) { return toJson(isTrue(args[0])); }
}

// ===== FALLBACK (macro: short-circuits, only evaluates as many args as needed)

class Fallback extends AbstractMacro {
  constructor() { super("fallback", 2, 1024); }
  call(scope, input, parameters) {
    for (const param of parameters) {
      const value = param.apply(scope, input);
      if (isValue(value)) return value;
    }
    return NullNode.instance;
  }
}

// ===== IS-OBJECT / GET-KEY

class GetKey extends AbstractFunction {
  constructor() { super("get-key", 2, 3); }
  call(_input, args) {
    const key = toStringValue(args[1], true);
    if (key == null) return NullNode.instance;

    const obj = args[0];
    if (obj.isObject()) {
      const value = obj.get(key);
      if (value == null) return args.length === 2 ? NullNode.instance : args[2];
      return value;
    }
    if (obj.isNull()) return NullNode.instance;
    throw new JsltException("get-key: can't look up keys in " + obj);
  }
}

// ===== IS-ARRAY / ARRAY

class ArrayFn extends AbstractFunction {
  constructor() { super("array", 1, 1); }
  call(_input, args) {
    const value = args[0];
    if (value.isNull() || value.isArray()) return value;
    if (value.isObject()) return convertObjectToArray(value);
    throw new JsltException("array() cannot convert " + value);
  }
}

// ===== FLATTEN

class Flatten extends AbstractFunction {
  constructor() { super("flatten", 1, 1); }
  call(_input, args) {
    const value = args[0];
    if (value.isNull()) return value;
    if (!value.isArray()) throw new JsltException("flatten() cannot operate on " + value);

    const array = mapper.createArrayNode();
    flatten(array, value);
    return array;
  }
}

function flatten(array, current) {
  for (const node of current.elements()) {
    if (node.isArray()) flatten(array, node);
    else array.add(node);
  }
}

// ===== ALL / ANY

class All extends AbstractFunction {
  constructor() { super("all", 1, 1); }
  call(_input, args) {
    const value = args[0];
    if (value.isNull()) return value;
    if (!value.isArray()) throw new JsltException("all() requires an array, not " + value);

    for (const node of value.elements()) if (!isTrue(node)) return BooleanNode.FALSE;
    return BooleanNode.TRUE;
  }
}

class Any extends AbstractFunction {
  constructor() { super("any", 1, 1); }
  call(_input, args) {
    const value = args[0];
    if (value.isNull()) return value;
    if (!value.isArray()) throw new JsltException("any() requires an array, not " + value);

    for (const node of value.elements()) if (isTrue(node)) return BooleanNode.TRUE;
    return BooleanNode.FALSE;
  }
}

// ===== ZIP / ZIP-WITH-INDEX

class Zip extends AbstractFunction {
  constructor() { super("zip", 2, 2); }
  call(_input, args) {
    const [array1, array2] = args;
    if (array1.isNull() || array2.isNull()) return NullNode.instance;
    if (!array1.isArray() || !array2.isArray()) throw new JsltException("zip() requires arrays");
    if (array1.size() !== array2.size()) throw new JsltException("zip() arrays were of unequal size");

    const array = mapper.createArrayNode();
    for (let ix = 0; ix < array1.size(); ix++) {
      const pair = mapper.createArrayNode();
      pair.add(array1.get(ix));
      pair.add(array2.get(ix));
      array.add(pair);
    }
    return array;
  }
}

class ZipWithIndex extends AbstractFunction {
  constructor() { super("zip-with-index", 1, 1); }
  call(_input, args) {
    const arrayIn = args[0];
    if (arrayIn.isNull()) return NullNode.instance;
    if (!arrayIn.isArray()) throw new JsltException("zip-with-index() argument must be an array");

    const arrayOut = mapper.createArrayNode();
    for (let ix = 0; ix < arrayIn.size(); ix++) {
      const pair = mapper.createObjectNode();
      pair.set("index", new IntNode(ix));
      pair.set("value", arrayIn.get(ix));
      arrayOut.add(pair);
    }
    return arrayOut;
  }
}

// ===== INDEX-OF

class IndexOf extends AbstractFunction {
  constructor() { super("index-of", 2, 2); }
  call(_input, args) {
    const array = args[0];
    if (array.isNull()) return NullNode.instance;
    if (!array.isArray()) throw new JsltException("index-of() first argument must be an array");

    const value = args[1];
    let ix = 0;
    for (const node of array.elements()) {
      if (EqualsComparison.equals(node, value)) return new IntNode(ix);
      ix++;
    }
    return new IntNode(-1);
  }
}

// ===== STARTS-WITH / ENDS-WITH

// starts-with/ends-with share everything but which String method to call.
class StringEdgeMatch extends AbstractFunction {
  constructor(name, method) {
    super(name, 2, 2);
    this.method = method;
  }
  call(_input, args) {
    return toJson(toStringValue(args[0], false)[this.method](toStringValue(args[1], false)));
  }
}

// ===== FROM-JSON / TO-JSON

class FromJson extends AbstractFunction {
  constructor() { super("from-json", 1, 2); }
  call(_input, args) {
    const json = toStringValue(args[0], true);
    if (json == null) return NullNode.instance;

    try {
      // Jackson's readTree returns null (not an error) when there's no
      // content at all — empty or whitespace-only input.
      if (json.trim() === "") return NullNode.instance;
      return readTree(json);
    } catch (e) {
      if (args.length === 2) return args[1]; // fallback on parse failure
      throw new JsltException(`from-json can't parse ${json}: ${e}`);
    }
  }
}

class ToJson extends AbstractFunction {
  constructor() { super("to-json", 1, 1); }
  call(_input, args) {
    // every node's own toString() already produces Jackson-compatible JSON
    // text (see json/JsonNode.js / NumericNode.js) — reuse it directly.
    return new TextNode(args[0].toString());
  }
}

// ===== REPLACE

class Replace extends AbstractRegexpFunction {
  constructor() { super("replace", 3, 3); }
  call(_input, args) {
    const string = toStringValue(args[0], true);
    if (string == null) return NullNode.instance;

    const regexp = toStringValue(args[1], false);
    const sep = toStringValue(args[2], false);

    const pattern = getRegexp(regexp);
    const re = new RegExp(pattern.source, pattern.flags + "g"); // stateful clone for iteration

    let pos = 0;
    let result = "";
    let m;
    while ((m = re.exec(string)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (start === end) {
        throw new JsltException(`Regexp ${regexp} in replace() matched empty string in '${args[0]}'`);
      }

      result += string.slice(pos, start) + sep;
      pos = end;
      re.lastIndex = pos;
    }

    if (pos === 0 && args[0].isTextual()) return args[0]; // unchanged: keep original node/type
    result += string.slice(pos);
    return new TextNode(result);
  }
}

// ===== TRIM

class Trim extends AbstractFunction {
  constructor() { super("trim", 1, 1); }
  call(_input, args) {
    const string = toStringValue(args[0], true);
    if (string == null) return NullNode.instance;
    return new TextNode(string.trim());
  }
}

// ===== UUID

class Uuid extends AbstractFunction {
  constructor() { super("uuid", 0, 2); }

  maskMSB(n) {
    const version = 1n << 12n;
    const least12 = (n & 0x000000000000ffffn) >> 4n;
    return (n & 0xffffffffffff0000n) + version + least12;
  }

  maskLSB(n) {
    const LSB_MASK = 0x3fffffffffffffffn;
    const LSB_VARIANT3_BITFLAG = 0x8000000000000000n;
    return (n & LSB_MASK) + LSB_VARIANT3_BITFLAG;
  }

  // mirrors java.util.UUID(long mostSigBits, long leastSigBits).toString()
  formatUuid(msb, lsb) {
    const digits = (val, count) => {
      const hi = 1n << BigInt(count * 4);
      return (hi | (val & (hi - 1n))).toString(16).slice(1);
    };
    const mask64 = 0xffffffffffffffffn;
    msb &= mask64; lsb &= mask64;
    return [
      digits(msb >> 32n, 8),
      digits(msb >> 16n, 4),
      digits(msb, 4),
      digits(lsb >> 48n, 4),
      digits(lsb, 12),
    ].join("-");
  }

  call(_input, args) {
    let uuid;
    if (args.length === 0) {
      uuid = cryptoRandomUUID();
    } else if (args.length === 2) {
      if (args[0].isNull() && args[1].isNull()) {
        // NIL UUID, RFC 4122 section 4.1.7
        uuid = "00000000-0000-0000-0000-000000000000";
      } else {
        const toLong = (a) => a.isNull() ? 0n : asBigInt(numberFn(a, null));
        const msb = toLong(args[0]);
        const lsb = toLong(args[1]);
        uuid = this.formatUuid(this.maskMSB(msb), this.maskLSB(lsb));
      }
    } else {
      throw new JsltException("Build-in UUID function must be called with either none or two parameters.");
    }
    return new TextNode(uuid);
  }
}

// ===== JOIN

class Join extends AbstractFunction {
  constructor() { super("join", 2, 2); }
  call(_input, args) {
    const array = toArray(args[0], true);
    if (array == null) return NullNode.instance;

    const sep = toStringValue(args[1], false);
    const parts = [];
    for (const e of array.elements()) parts.push(toStringValue(e, false));
    return new TextNode(parts.join(sep));
  }
}

// ===== CONTAINS

class Contains extends AbstractFunction {
  constructor() { super("contains", 2, 2); }
  call(_input, args) {
    const haystack = args[1];
    if (haystack.isNull()) return BooleanNode.FALSE; // nothing is contained in null

    if (haystack.isArray()) {
      for (const e of haystack.elements()) if (e.equals(args[0])) return BooleanNode.TRUE;
      return BooleanNode.FALSE;
    }

    if (haystack.isObject()) {
      const key = toStringValue(args[0], true);
      if (key == null) return BooleanNode.FALSE;
      return toJson(haystack.has(key));
    }

    if (haystack.isTextual()) {
      const sub = toStringValue(args[0], true);
      if (sub == null) return BooleanNode.FALSE;
      return toJson(haystack.asText().indexOf(sub) !== -1);
    }

    throw new JsltException("Contains cannot operate on " + haystack);
  }
}

// ===== SIZE

class Size extends AbstractFunction {
  constructor() { super("size", 1, 1); }
  call(_input, args) {
    if (args[0].isArray() || args[0].isObject()) return new IntNode(args[0].size());
    if (args[0].isTextual()) return new IntNode(args[0].asText().length);
    if (args[0].isNull()) return args[0];
    throw new JsltException("Function size() cannot work on " + args[0]);
  }
}

// ===== ERROR

class ErrorFn extends AbstractFunction {
  constructor() { super("error", 1, 1); }
  call(_input, args) {
    throw new JsltException("error: " + toStringValue(args[0], false));
  }
}

// ===== STRING / IS-STRING / IS-NUMBER / IS-INTEGER / IS-DECIMAL

class ToString extends AbstractFunction {
  constructor() { super("string", 1, 1); }
  call(_input, args) {
    if (args[0].isTextual()) return args[0];
    return new TextNode(args[0].toString());
  }
}

// ===== NOW

class Now extends AbstractFunction {
  constructor() { super("now", 0, 0); }
  call(_input, _args) { return new DoubleNode(Date.now() / 1000.0); }
}

// ===== PARSE-TIME / FORMAT-TIME
//
// Implements Java SimpleDateFormat semantics via Intl (built-in, zero deps).
// Supported tokens: yyyy MM dd HH mm ss S/SS/SSS z Z X and literals.
// Returns/accepts seconds since Unix epoch (double), matching Java JSLT.

const VALID_FMT_CHARS = new Set('yMdHmsSzZX');

// Tokenize a Java SimpleDateFormat pattern.
// Throws "Couldn't parse format" on unknown letter tokens.
function tokenizeJavaFmt(fmt) {
  const tokens = [];
  for (let i = 0; i < fmt.length;) {
    const ch = fmt[i];
    if (/[A-Za-z]/.test(ch)) {
      if (!VALID_FMT_CHARS.has(ch))
        throw new JsltException(`Couldn't parse format: unknown pattern letter '${ch}'`);
      let j = i;
      while (j < fmt.length && fmt[j] === ch) j++;
      tokens.push({ type: ch, count: j - i });
      i = j;
    } else {
      tokens.push({ type: 'lit', ch });
      i++;
    }
  }
  return tokens;
}

// UTC offset of `tzName` at `msec` (ms since epoch), in minutes.
function tzOffsetMin(msec, tzName) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzName, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(msec)).map(x => [x.type, x.value]));
  const h = p.hour === '24' ? 0 : +p.hour;
  return (Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second) - msec) / 60000;
}

// Normalize a timezone string for Intl: "CET"→"CET", "+0100"→"+01:00", "Z"→"UTC"
function normalizeTz(tz) {
  if (tz === 'Z' || tz === 'UTC' || tz === 'GMT') return 'UTC';
  // "+0100" or "-0530" → "+01:00"
  const m4 = tz.match(/^([+-])(\d{2})(\d{2})$/);
  if (m4) return `${m4[1]}${m4[2]}:${m4[3]}`;
  // "+01:00" already valid
  return tz;
}

// Parse a date string using a Java format pattern; return seconds since epoch (double) or null.
// throwOnFail: true → throw JsltException("Unparseable..."); false → return null
function doParseTime(str, fmt, embeddedTzName, throwOnFail) {
  const tokens = tokenizeJavaFmt(fmt); // may throw "Couldn't parse format"

  // Build regex from format tokens
  const groups = [];
  let pat = '^';
  for (const t of tokens) {
    if (t.type === 'lit') {
      pat += t.ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (t.type === 'y') { groups.push('year');  pat += '(\\d{4})'; }
    else if (t.type === 'M')   { groups.push('month'); pat += t.count >= 2 ? '(\\d{2})' : '(\\d{1,2})'; }
    else if (t.type === 'd')   { groups.push('day');   pat += t.count >= 2 ? '(\\d{2})' : '(\\d{1,2})'; }
    else if (t.type === 'H')   { groups.push('hour');  pat += t.count >= 2 ? '(\\d{2})' : '(\\d{1,2})'; }
    else if (t.type === 'm')   { groups.push('min');   pat += t.count >= 2 ? '(\\d{2})' : '(\\d{1,2})'; }
    else if (t.type === 's')   { groups.push('sec');   pat += t.count >= 2 ? '(\\d{2})' : '(\\d{1,2})'; }
    else if (t.type === 'S')   { groups.push('frac');  pat += '(\\d+)'; }
    else /* z Z X */           { groups.push('tz');    pat += '([A-Za-z+\\-0-9:]+)'; }
  }
  pat += '$';

  const m = str.match(new RegExp(pat));
  if (!m) {
    if (throwOnFail) throw new JsltException(`Unparseable date "${str}" with format "${fmt}"`);
    return null;
  }

  const vals = {};
  groups.forEach((g, i) => { if (vals[g] == null) vals[g] = m[i + 1]; });

  const yr  = +(vals.year  ?? 1970);
  const mo  = +(vals.month ?? 1);
  const dy  = +(vals.day   ?? 1);
  const hr  = +(vals.hour  ?? 0);
  const mn  = +(vals.min   ?? 0);
  const sc  = +(vals.sec   ?? 0);
  // Java S = ms field; SSS = 3-digit, S = variable. Normalize to ms.
  let msf = 0;
  if (vals.frac != null) msf = +(vals.frac.padEnd(3, '0').slice(0, 3));

  const tzStr = vals.tz ?? embeddedTzName;
  const tzName = tzStr ? normalizeTz(tzStr) : 'UTC';

  // Two-step: compute UTC assuming components are in tzName
  const t0 = Date.UTC(yr, mo - 1, dy, hr, mn, sc, msf);
  if (tzName === 'UTC') return t0 / 1000;

  try {
    const off = tzOffsetMin(t0, tzName);
    return (t0 - off * 60000) / 1000;
  } catch {
    if (throwOnFail) throw new JsltException(`Unknown timezone: ${tzName}`);
    return null;
  }
}

class ParseTime extends AbstractFunction {
  constructor() { super("parse-time", 2, 3); }
  call(_input, args) {
    if (args[0].isNull()) return NullNode.instance;
    const str = args[0].asText();
    const fmt = args[1].asText();
    const hasFallback = args.length >= 3;
    const fallback = hasFallback ? args[2] : null;
    const sec = doParseTime(str, fmt, null, !hasFallback);
    if (sec == null) return fallback ?? NullNode.instance;
    return new DoubleNode(sec);
  }
}

class FormatTime extends AbstractFunction {
  constructor() { super("format-time", 2, 3); }
  call(_input, args) {
    if (args[0].isNull()) return NullNode.instance;
    const sec = args[0].doubleValue();
    const fmt = args[1].asText();
    const tzArg = args.length >= 3 && !args[2].isNull() ? args[2].asText() : 'UTC';

    const tokens = tokenizeJavaFmt(fmt); // may throw "Couldn't parse format"

    // Validate timezone before formatting
    let tzName;
    try {
      tzName = normalizeTz(tzArg);
      // Probe: will throw if timezone is unknown
      new Intl.DateTimeFormat('en-CA', { timeZone: tzName }).format(new Date(0));
    } catch {
      throw new JsltException(`Unknown timezone: ${tzArg}`);
    }

    const ms = sec * 1000;
    const dateFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      fractionalSecondDigits: 3,
    });
    const p = Object.fromEntries(dateFmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    if (p.hour === '24') p.hour = '00';

    // Timezone abbreviation for 'z' token.
    // When caller passes a short uppercase abbreviation (CET, UTC, EST…), use it
    // directly — Intl may return "GMT+1" for "CET" on some runtimes.
    let tzAbbr;
    if (/^[A-Z]{2,5}$/.test(tzArg)) {
      tzAbbr = tzArg;
    } else {
      const abbrFmt = new Intl.DateTimeFormat('en-US', { timeZone: tzName, timeZoneName: 'short' });
      tzAbbr = (abbrFmt.formatToParts(new Date(ms)).find(x => x.type === 'timeZoneName') ?? {}).value ?? tzName;
    }

    // Offset for Z/X tokens
    const offMin = tzOffsetMin(ms, tzName);
    const sign = offMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offMin);
    const offStr = `${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}${String(absMin % 60).padStart(2, '0')}`;

    let result = '';
    for (const t of tokens) {
      if      (t.type === 'lit') result += t.ch;
      else if (t.type === 'y')   result += p.year;
      else if (t.type === 'M')   result += p.month;
      else if (t.type === 'd')   result += p.day;
      else if (t.type === 'H')   result += p.hour;
      else if (t.type === 'm')   result += p.minute;
      else if (t.type === 's')   result += p.second;
      else if (t.type === 'S')   result += (p.fractionalSecond ?? '000').padStart(3, '0').slice(0, t.count);
      else if (t.type === 'z')   result += tzAbbr;
      else /* Z X */             result += offStr;
    }
    return new TextNode(result);
  }
}

// ===== MIN / MAX

class Min extends AbstractFunction {
  constructor() { super("min", 2, 2); }
  call(_input, args) {
    // works because null is the smallest of all values
    return ComparisonOperator.compareStatic(args[0], args[1], null) < 0 ? args[0] : args[1];
  }
}

class Max extends AbstractFunction {
  constructor() { super("max", 2, 2); }
  call(_input, args) {
    if (args[0].isNull() || args[1].isNull()) return NullNode.instance;
    return ComparisonOperator.compareStatic(args[0], args[1], null) > 0 ? args[0] : args[1];
  }
}

// ===== PARSE-URL
//
// ponytail: built on the native WHATWG URL (browser + Node), not a hand-rolled
// URI parser — matches java.net.URL behavior for common/typical usage. Two
// known gaps vs java.net.URL, both edge
// cases: (1) WHATWG normalizes pathname to "/" minimum for http(s)/ftp, so a
// bare "http://host" reports path "/" where Java's URL reports no path at
// all; (2) Java's getRef()/getUserInfo() null-check (not empty-check) is
// replicated for the fragment via a raw-string scan since WHATWG can't
// otherwise distinguish "no fragment" from "empty fragment after bare #".
// Upgrade to a manual URI splitter if exact java.net.URL parity is needed.

class ParseUrl extends AbstractFunction {
  constructor() { super("parse-url", 1, 1); }
  call(_input, args) {
    if (args[0].isNull()) return NullNode.instance;

    const urlString = args[0].asText();
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      throw new JsltException("Can't parse " + urlString, e);
    }

    const obj = mapper.createObjectNode();
    if (url.hostname !== "") obj.set("host", new TextNode(url.hostname));
    if (url.port !== "") obj.set("port", new IntNode(Number(url.port)));
    // WHATWG normalizes bare hostname to pathname="/"; only emit path when the
    // original URL string has an explicit "/" after the authority, matching
    // java.net.URL.getPath() which returns "" for "http://host" with no path.
    const hasExplicitPath = urlString.slice(urlString.indexOf("//") + 2).includes("/");
    if (url.pathname !== "" && (url.pathname !== "/" || hasExplicitPath)) {
      obj.set("path", new TextNode(url.pathname));
    }

    const scheme = url.protocol.replace(/:$/, "");
    if (scheme !== "") obj.set("scheme", new TextNode(scheme));

    const query = url.search.replace(/^\?/, "");
    if (query !== "") {
      obj.set("query", new TextNode(query));
      const params = mapper.createObjectNode();
      obj.set("parameters", params);
      for (const pair of query.split("&")) {
        const idx = pair.indexOf("=");
        const key = idx > 0 ? decodeForm(pair.substring(0, idx)) : pair;
        if (!params.has(key)) params.set(key, mapper.createArrayNode());
        const value = idx > 0 && pair.length > idx + 1 ? decodeForm(pair.substring(idx + 1)) : null;
        params.get(key).add(value == null ? NullNode.instance : new TextNode(value));
      }
    }

    if (urlString.indexOf("#") !== -1) obj.set("fragment", new TextNode(url.hash.replace(/^#/, "")));

    const userinfo = url.username === "" ? "" : url.password === "" ? url.username : `${url.username}:${url.password}`;
    if (userinfo !== "") obj.set("userinfo", new TextNode(userinfo));

    return obj;
  }
}

// ===== REGISTRY (Java's static initializer blocks)

export const BuiltinFunctions = {
  functions: new Map([
    // GENERAL
    ["contains", new Contains()],
    ["size", new Size()],
    ["error", new ErrorFn()],
    ["min", new Min()],
    ["max", new Max()],
    // NUMERIC
    ["is-number", new Predicate("is-number", "isNumber")],
    ["is-integer", new Predicate("is-integer", "isIntegralNumber")],
    ["is-decimal", new Predicate("is-decimal", "isFloatingPointNumber")],
    ["number", new NumberFn()],
    ["round", new Rounder("round", Math.round)],
    ["floor", new Rounder("floor", Math.floor)],
    ["ceiling", new Rounder("ceiling", Math.ceil)],
    ["random", new Random()],
    ["sum", new Sum()],
    ["mod", new Modulo()],
    ["hash-int", new HashInt()],
    // STRING
    ["is-string", new Predicate("is-string", "isTextual")],
    ["string", new ToString()],
    ["test", new Test()],
    ["capture", new Capture()],
    ["split", new Split()],
    ["join", new Join()],
    ["lowercase", new CaseConvert("lowercase", "toLowerCase")],
    ["uppercase", new CaseConvert("uppercase", "toUpperCase")],
    ["sha256-hex", new Sha256()],
    ["starts-with", new StringEdgeMatch("starts-with", "startsWith")],
    ["ends-with", new StringEdgeMatch("ends-with", "endsWith")],
    ["from-json", new FromJson()],
    ["to-json", new ToJson()],
    ["replace", new Replace()],
    ["trim", new Trim()],
    ["uuid", new Uuid()],
    // BOOLEAN
    ["not", new Not()],
    ["boolean", new BooleanFn()],
    ["is-boolean", new Predicate("is-boolean", "isBoolean")],
    // OBJECT
    ["is-object", new Predicate("is-object", "isObject")],
    ["get-key", new GetKey()],
    // ARRAY
    ["array", new ArrayFn()],
    ["is-array", new Predicate("is-array", "isArray")],
    ["flatten", new Flatten()],
    ["all", new All()],
    ["any", new Any()],
    ["zip", new Zip()],
    ["zip-with-index", new ZipWithIndex()],
    ["index-of", new IndexOf()],
    // TIME
    ["now", new Now()],
    ["parse-time", new ParseTime()],
    ["format-time", new FormatTime()],
    // MISC
    ["parse-url", new ParseUrl()],
  ]),
  macros: new Map([
    ["fallback", new Fallback()],
  ]),
};
