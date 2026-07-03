// Port of filters/JsonFilter.java — approves/disapproves a value for inclusion
// in an object literal's output (used by ObjectExpression/ObjectComprehension).

export class JsonFilter {
  filter(_value) { throw new Error("abstract"); }
}
