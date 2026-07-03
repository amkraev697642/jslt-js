// Port of filters/TrueJsonFilter.java — accepts every value.

import { JsonFilter } from "./JsonFilter.js";

export class TrueJsonFilter extends JsonFilter {
  filter(_value) { return true; }
}
