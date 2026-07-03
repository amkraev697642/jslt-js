// Hand-written recursive-descent parser, transcribed from the grammar in
// core/src/main/jjtree/jslt.jjt, fused with the tree-building logic from
// parser/ParserImpl.java's node2*/build* methods (no intermediate parse tree —
// this builds ExpressionNode instances directly while parsing, since there's
// no JavaCC/JJTree equivalent in JS to generate one).

import { Lexer } from "./Lexer.js";
import { JsltException } from "../JsltException.js";
import { Location } from "../impl/Location.js";
import { ParseContext } from "../impl/ParseContext.js";
import { ExpressionImpl } from "../impl/ExpressionImpl.js";
import { JstlFile } from "../impl/JstlFile.js";

import { LiteralExpression } from "../impl/LiteralExpression.js";
import { VariableExpression } from "../impl/VariableExpression.js";
import { DotExpression } from "../impl/DotExpression.js";
import { ArraySlicer } from "../impl/ArraySlicer.js";
import { ArrayExpression } from "../impl/ArrayExpression.js";
import { PairExpression } from "../impl/PairExpression.js";
import { MatcherExpression } from "../impl/MatcherExpression.js";
import { ObjectExpression } from "../impl/ObjectExpression.js";
import { ObjectComprehension } from "../impl/ObjectComprehension.js";
import { IfExpression } from "../impl/IfExpression.js";
import { ForExpression } from "../impl/ForExpression.js";
import { LetExpression } from "../impl/LetExpression.js";
import { FunctionExpression } from "../impl/FunctionExpression.js";
import { MacroExpression } from "../impl/MacroExpression.js";
import { FunctionDeclaration } from "../impl/FunctionDeclaration.js";

import { PlusOperator } from "../impl/PlusOperator.js";
import { MinusOperator } from "../impl/MinusOperator.js";
import { MultiplyOperator } from "../impl/MultiplyOperator.js";
import { DivideOperator } from "../impl/DivideOperator.js";
import { EqualsComparison } from "../impl/EqualsComparison.js";
import { UnequalsComparison } from "../impl/UnequalsComparison.js";
import { BiggerComparison } from "../impl/BiggerComparison.js";
import { BiggerOrEqualComparison } from "../impl/BiggerOrEqualComparison.js";
import { SmallerComparison } from "../impl/SmallerComparison.js";
import { SmallerOrEqualsComparison } from "../impl/SmallerOrEqualsComparison.js";
import { AndOperator } from "../impl/AndOperator.js";
import { OrOperator } from "../impl/OrOperator.js";
import { PipeOperator } from "../impl/PipeOperator.js";

import { NullNode, BooleanNode, TextNode } from "../json/JsonNode.js";
import { IntNode, LongNode, DoubleNode } from "../json/NumericNode.js";

const COMPARATORS = new Set(["EQUALS", "UNEQUALS", "BIGOREQ", "BIGGER", "SMALLER", "SMALLOREQ"]);

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  peek(offset = 0) { return this.tokens[this.pos + offset]; }
  check(kind) { return this.peek().kind === kind; }
  advance() { return this.tokens[this.pos++]; }

  expect(kind) {
    if (!this.check(kind)) {
      const t = this.peek();
      throw new JsltException(`Parse error: expected ${kind} but got ${t.kind} '${t.image}'`, this.locOf(t));
    }
    return this.advance();
  }

  error(message, token = this.peek()) {
    throw new JsltException(`Parse error: ${message}`, this.locOf(token));
  }

  locOf(token) { return new Location(this.ctx.getSource(), token.line, token.column); }
  loc() { return this.locOf(this.peek()); }

  // ===== top-level structure: Start() / Module() =====

  // Start(): (Import())* (Let()|FunctionDecl())* Expr() EOF
  // Module(): (Import())* (Let()|FunctionDecl())* (Expr())? EOF
  parseFile(allowMissingBody) {
    this.parseImports();
    const lets = this.parseLetsAndDefs();

    let body;
    if (!(allowMissingBody && this.check("EOF"))) body = this.parseExpr();
    this.expect("EOF");

    this.ctx.resolveFunctions();

    const impl = new ExpressionImpl(lets, this.ctx.getDeclaredFunctions(), body);
    impl.prepare(this.ctx.getPreparationContext());
    impl.optimize();
    return impl;
  }

  // Import(): <IMPORT> <STRING> <AS> <IDENT>
  parseImports() {
    while (this.check("IMPORT")) {
      const node = this.peek();
      this.advance();
      const source = this.unescapeString(this.expect("STRING"));
      this.expect("AS");
      const prefix = this.expect("IDENT").image;

      const module = this.ctx.getNamedModule(source);
      if (module != null) {
        this.ctx.registerModule(prefix, module);
      } else {
        const file = this.doImport(source, node, prefix);
        this.ctx.registerModule(prefix, file);
        this.ctx.addDeclaredFunction(prefix, file);
        this.ctx.registerJsltFile(file);
      }
    }
  }

  doImport(source, atToken, prefix) {
    if (this.ctx.isAlreadyImported(source)) {
      this.error(`Module '${source}' is already imported`, atToken);
    }

    const resolver = this.ctx.getResolver();
    if (resolver == null) {
      this.error(`Cannot import '${source}': no resource resolver configured`, atToken);
    }
    const text = resolver.resolve(source);

    const childCtx = new ParseContext(
      this.ctx.getExtensions(), source, resolver, this.ctx.getNamedModules(),
      this.ctx.getFiles(), this.ctx.getPreparationContext(), this.ctx.getObjectFilter(),
    );
    childCtx.setParent(this.ctx);

    const expr = new Parser(new Lexer(text).tokenize(), childCtx).parseFile(true);
    return new JstlFile(prefix, source, expr);
  }

  // (Let() | FunctionDecl())* — interleaved arbitrarily at file/function-decl
  // scope. Single-pass parsing still supports forward/mutual/self reference:
  // every def is registered into ctx as soon as it's parsed, and call sites
  // (FunctionExpression) only resolve names at the very end via
  // ctx.resolveFunctions(), regardless of textual order.
  parseLetsAndDefs() {
    const lets = [];
    for (;;) {
      if (this.check("LET")) lets.push(this.parseLet());
      else if (this.check("DEF")) this.parseFunctionDecl();
      else break;
    }
    return lets;
  }

  // Let(): <LET> <IDENT> <ASSIGN> Expr()
  parseLet() {
    const loc = this.loc();
    this.advance();
    const name = this.expect("IDENT").image;
    this.expect("ASSIGN");
    const value = this.parseExpr();
    return new LetExpression(name, value, loc);
  }

  // FunctionDecl(): <DEF> <IDENT> <LPAREN> (<IDENT> (<COMMA> <IDENT>)*)? <RPAREN> (Let())* Expr()
  parseFunctionDecl() {
    this.advance(); // DEF
    const name = this.expect("IDENT").image;
    this.expect("LPAREN");
    const params = [];
    if (!this.check("RPAREN")) {
      params.push(this.expect("IDENT").image);
      while (this.check("COMMA")) { this.advance(); params.push(this.expect("IDENT").image); }
    }
    this.expect("RPAREN");
    const lets = this.parseLetsAndDefsLetsOnly();
    const body = this.parseExpr();

    const func = new FunctionDeclaration(name, params, lets, body);
    func.computeMatchContexts(undefined);
    this.ctx.addDeclaredFunction(name, func);
  }

  // function bodies only allow (Let())*, no nested def
  parseLetsAndDefsLetsOnly() {
    const lets = [];
    while (this.check("LET")) lets.push(this.parseLet());
    return lets;
  }

  // ===== operator precedence chain =====

  // Expr(): OrExpr() (PipeOperator() OrExpr())*  -- left-fold
  parseExpr() {
    let root = this.parseOrExpr();
    while (this.check("PIPE")) {
      const loc = this.loc();
      this.advance();
      root = new PipeOperator(root, this.parseOrExpr(), loc);
    }
    return root;
  }

  // OrExpr(): AndExpr() (<OR> OrExpr())?  -- right-associative (recurses into OrExpr, not AndExpr)
  parseOrExpr() {
    const first = this.parseAndExpr();
    if (!this.check("OR")) return first;
    const loc = this.loc();
    this.advance();
    return new OrOperator(first, this.parseOrExpr(), loc);
  }

  // AndExpr(): ComparativeExpr() (<AND> AndExpr())?  -- right-associative
  parseAndExpr() {
    const first = this.parseComparativeExpr();
    if (!this.check("AND")) return first;
    const loc = this.loc();
    this.advance();
    return new AndOperator(first, this.parseAndExpr(), loc);
  }

  // ComparativeExpr(): AdditiveExpr() (Comparator() AdditiveExpr())?  -- at most ONE comparison, no chaining
  parseComparativeExpr() {
    const first = this.parseAdditiveExpr();
    if (!COMPARATORS.has(this.peek().kind)) return first;
    const loc = this.loc();
    const opKind = this.advance().kind;
    const second = this.parseAdditiveExpr();
    switch (opKind) {
      case "EQUALS": return new EqualsComparison(first, second, loc);
      case "UNEQUALS": return new UnequalsComparison(first, second, loc);
      case "BIGOREQ": return new BiggerOrEqualComparison(first, second, loc);
      case "BIGGER": return new BiggerComparison(first, second, loc);
      case "SMALLER": return new SmallerComparison(first, second, loc);
      case "SMALLOREQ": return new SmallerOrEqualsComparison(first, second, loc);
      default: throw new JsltException("INTERNAL ERROR: unknown comparator " + opKind);
    }
  }

  // AdditiveExpr(): MultiplicativeExpr() ((PLUS|MINUS) MultiplicativeExpr())*  -- left-fold
  parseAdditiveExpr() {
    let root = this.parseMultiplicativeExpr();
    while (this.check("PLUS") || this.check("MINUS")) {
      const loc = this.loc();
      const isPlus = this.check("PLUS");
      this.advance();
      const next = this.parseMultiplicativeExpr();
      root = isPlus ? new PlusOperator(root, next, loc) : new MinusOperator(root, next, loc);
    }
    return root;
  }

  // MultiplicativeExpr(): BaseExpr() ((STAR|SLASH) BaseExpr())*  -- left-fold
  parseMultiplicativeExpr() {
    let root = this.parseBaseExpr();
    while (this.check("STAR") || this.check("SLASH")) {
      const loc = this.loc();
      const isStar = this.check("STAR");
      this.advance();
      const next = this.parseBaseExpr();
      root = isStar ? new MultiplyOperator(root, next, loc) : new DivideOperator(root, next, loc);
    }
    return root;
  }

  // BaseExpr(): NULL|INTEGER|DECIMAL|STRING|TRUE|FALSE|Chainable|Parenthesis|
  //             IfStatement|Array|(Object|ObjectComprehension)
  parseBaseExpr() {
    const loc = this.loc();
    const tok = this.peek();
    switch (tok.kind) {
      case "NULL": this.advance(); return new LiteralExpression(NullNode.instance, loc);
      case "TRUE": this.advance(); return new LiteralExpression(BooleanNode.TRUE, loc);
      case "FALSE": this.advance(); return new LiteralExpression(BooleanNode.FALSE, loc);
      case "INTEGER": return this.parseIntegerLiteral();
      case "DECIMAL": return this.parseDecimalLiteral();
      case "STRING": return new LiteralExpression(new TextNode(this.unescapeString(this.advance())), loc);
      case "VARIABLE": case "IDENT": case "PIDENT": case "DOT":
        return this.parseChainable();
      case "IF": return this.parseIfStatement();
      case "LBRACKET": return this.parseArray();
      case "LCURLY": return this.parseObjectOrComprehension();
      case "LPAREN": {
        this.advance();
        const inner = this.parseExpr();
        this.expect("RPAREN");
        return inner;
      }
      default:
        this.error(`unexpected token '${tok.image}' (${tok.kind})`);
        return undefined; // unreachable
    }
  }

  parseIntegerLiteral() {
    const loc = this.loc();
    const tok = this.advance();
    const value = BigInt(tok.image);
    const node = (value >= -2147483648n && value <= 2147483647n)
      ? new IntNode(Number(value))
      : new LongNode(value);
    return new LiteralExpression(node, loc);
  }

  parseDecimalLiteral() {
    const loc = this.loc();
    const tok = this.advance();
    return new LiteralExpression(new DoubleNode(Number(tok.image)), loc);
  }

  // ===== Chainable: (FunctionCall()|VARIABLE|DOT(IDENT|STRING)?) (ChainLink())? =====

  parseChainable() {
    const loc = this.loc();
    let start;

    if (this.check("VARIABLE")) {
      const tok = this.advance();
      start = new VariableExpression(tok.image.slice(1), loc);
    } else if (this.check("IDENT") || this.check("PIDENT")) {
      start = this.parseFunctionCall();
    } else if (this.check("DOT")) {
      this.advance();
      if (this.check("IDENT") || this.check("STRING")) {
        start = new DotExpression(this.parseIdentOrStringText(), undefined, loc);
      } else {
        // bare dot: identity. If a '[' immediately follows, it's picked up
        // below by parseChainContinuation (ArraySlicing has no leading dot
        // in the grammar, so it only ever appears as a continuation, never
        // consumed here) — this naturally reproduces Java's ".[0]" handling
        // without needing its separate two-step dance.
        start = new DotExpression(loc);
      }
    } else {
      this.error("expected a chainable expression ($var, .field, or a function call)");
    }

    return this.parseChainContinuation(start);
  }

  // ChainLink(): (DotKey()|ArraySlicing()) (ChainLink())?  -- implemented as a loop, same resulting tree shape
  parseChainContinuation(parent) {
    while (this.check("DOT") || this.check("LBRACKET")) {
      if (this.check("DOT")) {
        const loc = this.loc();
        this.advance();
        // DotKey() mandates IDENT|STRING after a continuation DOT (unlike the
        // initial Chainable dot, which allows a bare trailing dot) — no "?" here.
        if (!this.check("IDENT") && !this.check("STRING")) {
          this.error("expected a field name after '.'");
        }
        parent = new DotExpression(this.parseIdentOrStringText(), parent, loc);
      } else {
        parent = this.parseArraySlicer(parent);
      }
    }
    return parent;
  }

  // ArraySlicing(): <LBRACKET> ( Expr() (Colon() (Expr())?)? | Colon() Expr() ) <RBRACKET>
  parseArraySlicer(parent) {
    const loc = this.loc();
    this.advance(); // LBRACKET

    let left; let right; let colon = false;
    if (this.check("COLON")) {
      colon = true;
      this.advance();
      right = this.parseExpr();
    } else {
      left = this.parseExpr();
      if (this.check("COLON")) {
        colon = true;
        this.advance();
        if (!this.check("RBRACKET")) right = this.parseExpr();
      }
    }
    this.expect("RBRACKET");
    return new ArraySlicer(left, colon, right, parent, loc);
  }

  // FunctionCall(): (<IDENT>|<PIDENT>) <LPAREN> (Expr() (<COMMA> Expr())*)? <RPAREN>
  parseFunctionCall() {
    const loc = this.loc();
    const tok = this.advance(); // IDENT or PIDENT
    this.expect("LPAREN");
    const args = [];
    if (!this.check("RPAREN")) {
      args.push(this.parseExpr());
      while (this.check("COMMA")) { this.advance(); args.push(this.parseExpr()); }
    }
    this.expect("RPAREN");

    if (tok.kind === "IDENT") {
      const macro = this.ctx.getMacro(tok.image);
      if (macro != null) return new MacroExpression(macro, args, loc);

      const fn = new FunctionExpression(tok.image, args, loc);
      this.ctx.rememberFunctionCall(fn);
      return fn;
    }

    // PIDENT: imported function/macro must already be registered (the prefix
    // was bound by an earlier `import ... as prefix`) and resolves immediately.
    const colon = tok.image.indexOf(":");
    const prefix = tok.image.slice(0, colon);
    const name = tok.image.slice(colon + 1);
    const callable = this.ctx.getImportedCallable(prefix, name, loc);

    // Java distinguishes via `instanceof Function` (interface); JS has no
    // interfaces, so check the isFunctionDeclaration flag first (a declared
    // `def`, exposed through a module, IS a Function despite its call()
    // signature having the same 3-arg shape as Macro.call — arity alone
    // would misclassify it). Builtin Functions (arity 2) vs builtin Macros
    // (arity 3, e.g. group-by) never collide, so arity is fine for those.
    if (callable.isFunctionDeclaration || callable.call.length === 2) {
      const fun = new FunctionExpression(tok.image, args, loc);
      fun.resolve(callable);
      return fun;
    }
    return new MacroExpression(callable, args, loc);
  }

  // ===== If / Array / Object / ObjectComprehension =====

  // IfStatement(): <IF> <LPAREN> Expr() <RPAREN> (Let())* Expr() (ElseBranch())?
  // ElseBranch(): <ELSE> (Let())* Expr()
  parseIfStatement() {
    const loc = this.loc();
    this.advance(); // IF
    this.expect("LPAREN");
    const test = this.parseExpr();
    this.expect("RPAREN");
    const thenLets = this.parseLetsAndDefsLetsOnly();
    const then = this.parseExpr();

    let elseLets; let orelse;
    if (this.check("ELSE")) {
      this.advance();
      elseLets = this.parseLetsAndDefsLetsOnly();
      orelse = this.parseExpr();
    }

    return new IfExpression(test, thenLets, then, elseLets, orelse, loc);
  }

  // Array(): <LBRACKET> ( <FOR> <LPAREN> Expr() <RPAREN> (Let())* Expr() (<IF> <LPAREN> Expr() <RPAREN>)?
  //                     | (ArrayElem())? ) <RBRACKET>
  parseArray() {
    const loc = this.loc();
    this.advance(); // LBRACKET

    if (this.check("FOR")) {
      this.advance();
      this.expect("LPAREN");
      const valueExpr = this.parseExpr();
      this.expect("RPAREN");
      const lets = this.parseLetsAndDefsLetsOnly();
      const loopExpr = this.parseExpr();
      let ifExpr;
      if (this.check("IF")) {
        this.advance();
        this.expect("LPAREN");
        ifExpr = this.parseExpr();
        this.expect("RPAREN");
      }
      this.expect("RBRACKET");
      return new ForExpression(valueExpr, lets, loopExpr, ifExpr, loc);
    }

    const children = [];
    if (!this.check("RBRACKET")) {
      children.push(this.parseExpr());
      while (this.check("COMMA")) {
        this.advance();
        if (this.check("RBRACKET")) break; // trailing comma
        children.push(this.parseExpr());
      }
    }
    this.expect("RBRACKET");
    return new ArrayExpression(children, loc);
  }

  // dispatch on LCURLY: ObjectComprehension if 2nd token is FOR, else Object
  parseObjectOrComprehension() {
    if (this.peek(1).kind === "FOR") return this.parseObjectComprehension();
    return this.parseObject();
  }

  // ObjectComprehension(): <LCURLY> <FOR> <LPAREN> Expr() <RPAREN> (Let())*
  //                        Expr() <COLON> Expr() (<IF> <LPAREN> Expr() <RPAREN>)? <RCURLY>
  parseObjectComprehension() {
    const loc = this.loc();
    this.advance(); // LCURLY
    this.advance(); // FOR
    this.expect("LPAREN");
    const loopExpr = this.parseExpr();
    this.expect("RPAREN");
    const lets = this.parseLetsAndDefsLetsOnly();
    const keyExpr = this.parseExpr();
    this.expect("COLON");
    const valueExpr = this.parseExpr();
    let ifExpr;
    if (this.check("IF")) {
      this.advance();
      this.expect("LPAREN");
      ifExpr = this.parseExpr();
      this.expect("RPAREN");
    }
    this.expect("RCURLY");
    return new ObjectComprehension(loopExpr, lets, keyExpr, valueExpr, ifExpr, loc, this.ctx.getObjectFilter());
  }

  // Object(): <LCURLY> (Let())* (Pair()|Matcher())? <RCURLY>
  parseObject() {
    const loc = this.loc();
    this.advance(); // LCURLY
    const lets = this.parseLetsAndDefsLetsOnly();

    const pairs = [];
    let matcher;
    if (this.check("STAR")) {
      matcher = this.parseMatcher();
    } else if (!this.check("RCURLY")) {
      for (;;) {
        const pairLoc = this.loc();
        const key = this.parseExpr();
        this.expect("COLON");
        const value = this.parseExpr();
        pairs.push(new PairExpression(key, value, pairLoc));

        if (!this.check("COMMA")) break;
        this.advance();
        if (this.check("STAR")) { matcher = this.parseMatcher(); break; }
        if (this.check("RCURLY")) break; // trailing comma, nothing more
      }
    }

    this.expect("RCURLY");
    return new ObjectExpression(lets, pairs, matcher, loc, this.ctx.getObjectFilter());
  }

  // Matcher(): <STAR> (MatcherMinus())? <COLON> Expr()
  // MatcherMinus(): <MINUS> (<IDENT>|<STRING>) (<COMMA> (<IDENT>|<STRING>))*
  parseMatcher() {
    const loc = this.loc();
    this.advance(); // STAR
    const minuses = [];
    if (this.check("MINUS")) {
      this.advance();
      minuses.push(this.parseIdentOrStringText());
      while (this.check("COMMA")) { this.advance(); minuses.push(this.parseIdentOrStringText()); }
    }
    this.expect("COLON");
    const expr = this.parseExpr();
    return new MatcherExpression(expr, minuses, loc);
  }

  // ===== string/escape handling =====

  parseIdentOrStringText() {
    if (this.check("STRING")) return this.unescapeString(this.advance());
    return this.expect("IDENT").image;
  }

  // Port of ParserImpl.makeString — walks the source text handling escapes.
  // Builds a plain JS string instead of Java's preallocated char[] (every
  // escape shrinks, never grows, the result vs source — JS strings don't
  // need that bookkeeping at all).
  unescapeString(token) {
    const image = token.image;
    let result = "";
    for (let i = 1; i < image.length - 1; i++) {
      const ch = image[i];
      if (ch !== "\\") { result += ch; continue; }
      i++;
      const esc = image[i];
      switch (esc) {
        case "\\": result += "\\"; break;
        case '"': result += '"'; break;
        case "n": result += "\n"; break;
        case "b": result += "\b"; break;
        case "f": result += "\f"; break;
        case "r": result += "\r"; break;
        case "t": result += "\t"; break;
        case "/": result += "/"; break;
        case "u": {
          const hex = image.slice(i + 1, i + 5);
          if (hex.length < 4) this.error("Unfinished Unicode escape sequence", token);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.error(`Bad Unicode escape hex digit in '${hex}'`, token);
          result += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          break;
        }
        default: this.error(`Unknown escape sequence: \\${esc}`, token);
      }
    }
    return result;
  }
}

export function compile(source, sourceName, options = {}) {
  const ctx = ParseContext.root(sourceName, options);
  const tokens = new Lexer(source).tokenize();
  const expr = new Parser(tokens, ctx).parseFile(false);
  expr.setGlobalModules(ctx.getFiles());
  return expr;
}

export { Parser };
