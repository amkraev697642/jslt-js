// Port of filters/DefaultJsonFilter.java — the filter JSLT uses by default:
// drops null, {} and [] from constructed objects (NodeUtils.isValue).

import { JsonFilter } from "./JsonFilter.js";
import { isValue } from "../impl/NodeUtils.js";

export class DefaultJsonFilter extends JsonFilter {
  filter(value) { return isValue(value); }
}
