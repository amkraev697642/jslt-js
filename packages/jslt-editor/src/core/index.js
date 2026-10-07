// Framework-free editor logic: usable in Node (language servers) as well as in the browser.
export { FUNCTION_DOCS, KEYWORDS, CONSTANTS } from "./docs.js";
export { scan, candidates, wordInfo } from "./scan.js";
export { formatJslt } from "./format.js";
export { tokenLength, tokenRange } from "./errors.js";
