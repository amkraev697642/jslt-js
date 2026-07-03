// Port of JsltException.java — parent exception for all compile/run-time JSLT errors.
// No subclasses in the original; unchecked there, and Error is naturally "unchecked" in JS.

export class JsltException extends Error {
  constructor(message, locationOrCause, maybeLocation) {
    // Java has 4 overloads keyed on (message), (message, Location),
    // (message, Throwable), (message, Throwable, Location). Mirror that via
    // a duck-typed 2nd/3rd param instead of 4 separate constructors (JS has one ctor).
    let cause; let location;
    if (locationOrCause instanceof Location) location = locationOrCause;
    else { cause = locationOrCause; location = maybeLocation; }

    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "JsltException";
    this.location = location;
    this.rawMessage = message;
  }

  // Overridden message: append location info, like Java's getMessage().
  get message() {
    return this.location != null ? `${this.rawMessage} at ${this.location}` : this.rawMessage;
  }

  getMessageWithoutLocation() {
    return this.rawMessage;
  }

  getSource() {
    return this.location == null ? null : this.location.source;
  }

  getLine() {
    return this.location == null ? -1 : this.location.line;
  }

  getColumn() {
    return this.location == null ? -1 : this.location.column;
  }
}

// Imported late to avoid a circular import cycle at module-eval time
// (Location has no dependency back on JsltException, so this is safe).
import { Location } from "./impl/Location.js";
