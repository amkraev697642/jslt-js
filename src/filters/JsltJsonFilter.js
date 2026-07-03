// Port of filters/JsltJsonFilter.java — object filtering driven by a JSLT
// expression (Parser.withObjectFilter(String)).

import { JsonFilter } from "./JsonFilter.js";
import { isTrue } from "../impl/NodeUtils.js";

export class JsltJsonFilter extends JsonFilter {
  constructor(jslt) { super(); this.jslt = jslt; } // jslt: Expression
  filter(value) { return isTrue(this.jslt.apply(value)); }
}
