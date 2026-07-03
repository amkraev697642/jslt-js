// Port of the subset of Jackson's JsonNode hierarchy that JSLT relies on.
// Method names mirror Jackson (isTextual/asText/get/fields/...) so the engine
// translation stays character-identical to the Java source.
//
// Null model: a *missing* value (Jackson/Java null) is JS `undefined`; a JSON
// null is the NullNode.instance singleton. This distinction is load-bearing in
// the engine (e.g. NodeUtils.number uses an absent fallback as a sentinel).

export class JsonNode {
  isNumber() { return false; }
  isIntegralNumber() { return false; }
  isFloatingPointNumber() { return false; }
  isTextual() { return false; }
  isArray() { return false; }
  isObject() { return false; }
  isNull() { return false; }
  isBoolean() { return false; }

  // Jackson: size() is 0 for scalars; arrays/objects override.
  size() { return 0; }

  asText() { return ""; }
  doubleValue() { return 0; }
  intValue() { return 0; }
  booleanValue() { return false; }

  // Jackson get() returns Java null (-> JS undefined) for missing key/index.
  get(_keyOrIndex) { return undefined; }
  has(keyOrIndex) { return this.get(keyOrIndex) !== undefined; }

  *fields() {}    // [key, value] pairs (objects)
  *elements() {}  // values (arrays)

  equals(other) { return this === other; }
  toString() { return ""; }
}

export class NullNode extends JsonNode {
  isNull() { return true; }
  asText() { return "null"; }
  equals(other) { return other instanceof NullNode; }
  toString() { return "null"; }
}
NullNode.instance = new NullNode();

export class BooleanNode extends JsonNode {
  constructor(value) { super(); this.value = value; }
  isBoolean() { return true; }
  booleanValue() { return this.value; }
  asText() { return this.value ? "true" : "false"; }
  equals(other) { return other instanceof BooleanNode && other.value === this.value; }
  toString() { return this.value ? "true" : "false"; }
}
// Singletons — the engine compares against these by reference (value != BooleanNode.FALSE).
BooleanNode.TRUE = new BooleanNode(true);
BooleanNode.FALSE = new BooleanNode(false);

export class TextNode extends JsonNode {
  constructor(value) { super(); this.value = value; }
  isTextual() { return true; }
  asText() { return this.value; }
  equals(other) { return other instanceof TextNode && other.value === this.value; }
  // Jackson valueNode.toString() yields JSON-quoted text.
  toString() { return JSON.stringify(this.value); }
}

export class ArrayNode extends JsonNode {
  constructor(elements = []) { super(); this._elements = elements; }
  isArray() { return true; }
  size() { return this._elements.length; }
  get(index) { return this._elements[index]; } // undefined when out of range
  add(node) { this._elements.push(node); return this; }
  *elements() { yield* this._elements; }
  equals(other) {
    if (!(other instanceof ArrayNode) || other.size() !== this.size()) return false;
    for (let i = 0; i < this._elements.length; i++)
      if (!this._elements[i].equals(other._elements[i])) return false;
    return true;
  }
  toString() { return "[" + this._elements.map((e) => e.toString()).join(",") + "]"; }
}

// Map-backed to preserve true insertion order, including numeric-string keys
// (a plain JS object would reorder "1","2" ahead of string keys).
export class ObjectNode extends JsonNode {
  constructor() { super(); this._fields = new Map(); }
  isObject() { return true; }
  size() { return this._fields.size; }
  get(key) { return this._fields.get(key); } // undefined when absent
  set(key, node) { this._fields.set(key, node); return this; }
  has(key) { return this._fields.has(key); }
  *fields() { yield* this._fields.entries(); }
  *fieldNames() { yield* this._fields.keys(); }
  equals(other) {
    if (!(other instanceof ObjectNode) || other.size() !== this.size()) return false;
    for (const [k, v] of this._fields) {
      const o = other._fields.get(k);
      if (o === undefined || !v.equals(o)) return false;
    }
    return true;
  }
  toString() {
    const parts = [];
    for (const [k, v] of this._fields) parts.push(JSON.stringify(k) + ":" + v.toString());
    return "{" + parts.join(",") + "}";
  }
}
