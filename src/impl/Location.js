// Port of impl/Location.java — a position in a JSLT source file, for error messages.

export class Location {
  constructor(source, line, column) {
    this.source = source; // can be null/undefined — we don't always know
    this.line = line;
    this.column = column;
  }

  toString() {
    if (this.source != null) return `${this.source}:${this.line}:${this.column}`;
    return `${this.line}:${this.column}`;
  }
}
