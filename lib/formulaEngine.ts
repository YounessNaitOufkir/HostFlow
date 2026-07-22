// ============================================================
// Formula Engine — Safe expression evaluator for computed columns
// ============================================================
//
// Supports:
//   - Column references: {column_id}
//   - Arithmetic: +, -, *, /, ()
//   - Comparisons: =, !=, <, >, <=, >=
//   - Functions: IF(), SUM(), AVG(), MIN(), MAX(), ROUND(), ABS(), CONCAT()
//   - Cross-board references (via external resolver)
//
// Security: Uses recursive descent parsing — NO eval() or Function()
// ============================================================

import type { Item, Column } from "@/types";

// ============================================================
// Tokenizer
// ============================================================

type TokenType =
  | "NUMBER"
  | "STRING"
  | "COLUMN_REF"
  | "FUNCTION"
  | "OPERATOR"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "COMPARISON"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];

    // Whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Column reference: {column_id}
    if (char === "{") {
      const end = expression.indexOf("}", i);
      if (end === -1) throw new Error("Unclosed column reference at position " + i);
      tokens.push({ type: "COLUMN_REF", value: expression.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    // String literal: "..." or '...'
    if (char === '"' || char === "'") {
      const quote = char;
      let str = "";
      i++;
      while (i < expression.length && expression[i] !== quote) {
        str += expression[i];
        i++;
      }
      if (i >= expression.length) throw new Error("Unterminated string literal");
      i++; // skip closing quote
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Number (including decimals and negative)
    if (/\d/.test(char) || (char === "." && i + 1 < expression.length && /\d/.test(expression[i + 1]))) {
      let num = "";
      while (i < expression.length && (/\d/.test(expression[i]) || expression[i] === ".")) {
        num += expression[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }

    // Function names or comparison keywords
    if (/[a-zA-Z_]/.test(char)) {
      let name = "";
      while (i < expression.length && /[a-zA-Z_0-9]/.test(expression[i])) {
        name += expression[i];
        i++;
      }
      // Check if it's a function (followed by parenthesis)
      if (i < expression.length && expression[i] === "(") {
        tokens.push({ type: "FUNCTION", value: name.toUpperCase() });
      } else {
        // Treat as a string value (e.g., status labels)
        tokens.push({ type: "STRING", value: name });
      }
      continue;
    }

    // Comparison operators
    if (char === "!" && i + 1 < expression.length && expression[i + 1] === "=") {
      tokens.push({ type: "COMPARISON", value: "!=" });
      i += 2;
      continue;
    }
    if (char === "<" || char === ">") {
      if (i + 1 < expression.length && expression[i + 1] === "=") {
        tokens.push({ type: "COMPARISON", value: char + "=" });
        i += 2;
      } else {
        tokens.push({ type: "COMPARISON", value: char });
        i++;
      }
      continue;
    }
    if (char === "=") {
      tokens.push({ type: "COMPARISON", value: "=" });
      i++;
      continue;
    }

    // Arithmetic operators
    if ("+-*/".includes(char)) {
      tokens.push({ type: "OPERATOR", value: char });
      i++;
      continue;
    }

    // Parentheses
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    // Comma
    if (char === ",") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${char}' at position ${i}`);
  }

  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

// ============================================================
// Parser (Recursive Descent)
// ============================================================

type FormulaValue = number | string | boolean | null;

/** Context for resolving column references */
export interface FormulaContext {
  item: Item;
  columns: Column[];
  /** Optional: all items on the board (for aggregate functions) */
  boardItems?: Item[];
  /** Optional: resolver for cross-board references */
  crossBoardResolver?: (boardId: string, columnId: string, filter?: { columnId: string; value: string }) => number[];
}

class Parser {
  private tokens: Token[];
  private pos: number;
  private ctx: FormulaContext;

  constructor(tokens: Token[], ctx: FormulaContext) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} (${token.value})`);
    }
    return this.advance();
  }

  // Entry point: expression
  parse(): FormulaValue {
    const result = this.parseExpression();
    if (this.peek().type !== "EOF") {
      throw new Error(`Unexpected token: ${this.peek().value}`);
    }
    return result;
  }

  // expression = comparison ((+|-) comparison)*
  private parseExpression(): FormulaValue {
    let left = this.parseTerm();

    while (this.peek().type === "OPERATOR" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.advance().value;
      const right = this.parseTerm();
      if (op === "+") {
        // Support string concatenation
        if (typeof left === "string" || typeof right === "string") {
          left = String(left ?? "") + String(right ?? "");
        } else {
          left = (toNumber(left) + toNumber(right));
        }
      } else {
        left = toNumber(left) - toNumber(right);
      }
    }

    return left;
  }

  // term = factor ((*|/) factor)*
  private parseTerm(): FormulaValue {
    let left = this.parseComparison();

    while (this.peek().type === "OPERATOR" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.advance().value;
      const right = this.parseComparison();
      if (op === "*") {
        left = toNumber(left) * toNumber(right);
      } else {
        const divisor = toNumber(right);
        left = divisor === 0 ? null : toNumber(left) / divisor;
      }
    }

    return left;
  }

  // comparison = unary (comp_op unary)?
  private parseComparison(): FormulaValue {
    let left = this.parseUnary();

    if (this.peek().type === "COMPARISON") {
      const op = this.advance().value;
      const right = this.parseUnary();

      const l = left;
      const r = right;

      switch (op) {
        case "=":
          return l === r || String(l) === String(r);
        case "!=":
          return l !== r && String(l) !== String(r);
        case "<":
          return toNumber(l) < toNumber(r);
        case ">":
          return toNumber(l) > toNumber(r);
        case "<=":
          return toNumber(l) <= toNumber(r);
        case ">=":
          return toNumber(l) >= toNumber(r);
        default:
          throw new Error(`Unknown comparison: ${op}`);
      }
    }

    return left;
  }

  // unary = (-) unary | primary
  private parseUnary(): FormulaValue {
    if (this.peek().type === "OPERATOR" && this.peek().value === "-") {
      this.advance();
      return -toNumber(this.parseUnary());
    }
    return this.parsePrimary();
  }

  // primary = NUMBER | STRING | COLUMN_REF | FUNCTION(...) | (expression)
  private parsePrimary(): FormulaValue {
    const token = this.peek();

    switch (token.type) {
      case "NUMBER": {
        this.advance();
        return parseFloat(token.value);
      }

      case "STRING": {
        this.advance();
        return token.value;
      }

      case "COLUMN_REF": {
        this.advance();
        return this.resolveColumnRef(token.value);
      }

      case "FUNCTION": {
        return this.parseFunction();
      }

      case "LPAREN": {
        this.advance();
        const result = this.parseExpression();
        this.expect("RPAREN");
        return result;
      }

      default:
        throw new Error(`Unexpected token: ${token.type} (${token.value})`);
    }
  }

  private resolveColumnRef(columnId: string): FormulaValue {
    const rawValue = this.ctx.item.column_values?.[columnId];
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;

    // Try to parse as number
    const num = parseFloat(String(rawValue));
    if (!isNaN(num) && typeof rawValue !== "boolean") return num;

    // Return as string
    return String(rawValue);
  }

  private parseFunction(): FormulaValue {
    const funcName = this.advance().value; // FUNCTION token
    this.expect("LPAREN");

    const args: FormulaValue[] = [];
    if (this.peek().type !== "RPAREN") {
      args.push(this.parseExpression());
      while (this.peek().type === "COMMA") {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expect("RPAREN");

    return this.evaluateFunction(funcName, args);
  }

  private evaluateFunction(name: string, args: FormulaValue[]): FormulaValue {
    switch (name) {
      case "IF": {
        if (args.length < 2) throw new Error("IF requires at least 2 arguments");
        const condition = args[0];
        const isTrue = condition === true || (typeof condition === "number" && condition !== 0) || (typeof condition === "string" && condition !== "");
        return isTrue ? args[1] : (args[2] ?? null);
      }

      case "SUM": {
        return args.reduce<number>((acc, val) => acc + toNumber(val), 0);
      }

      case "AVG": {
        if (args.length === 0) return 0;
        const total = args.reduce<number>((acc, val) => acc + toNumber(val), 0);
        return total / args.length;
      }

      case "MIN": {
        const nums = args.map(toNumber);
        return Math.min(...nums);
      }

      case "MAX": {
        const nums = args.map(toNumber);
        return Math.max(...nums);
      }

      case "ROUND": {
        const val = toNumber(args[0]);
        const decimals = args.length > 1 ? toNumber(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.round(val * factor) / factor;
      }

      case "ABS": {
        return Math.abs(toNumber(args[0]));
      }

      case "CONCAT": {
        return args.map((a) => String(a ?? "")).join("");
      }

      case "LEN": {
        return String(args[0] ?? "").length;
      }

      case "UPPER": {
        return String(args[0] ?? "").toUpperCase();
      }

      case "LOWER": {
        return String(args[0] ?? "").toLowerCase();
      }

      // Cross-board aggregate: BOARD_SUM("board_id", "column_id")
      // or: BOARD_SUM("board_id", "column_id", "filter_col_id", "filter_value")
      case "BOARD_SUM":
      case "BOARD_AVG":
      case "BOARD_COUNT":
      case "BOARD_MIN":
      case "BOARD_MAX": {
        if (!this.ctx.crossBoardResolver || args.length < 2) return null;
        const boardId = String(args[0]);
        const columnId = String(args[1]);
        const filter = args.length >= 4
          ? { columnId: String(args[2]), value: String(args[3]) }
          : undefined;

        const values = this.ctx.crossBoardResolver(boardId, columnId, filter);
        if (values.length === 0) return 0;

        switch (name) {
          case "BOARD_SUM":
            return values.reduce((a, b) => a + b, 0);
          case "BOARD_AVG":
            return values.reduce((a, b) => a + b, 0) / values.length;
          case "BOARD_COUNT":
            return values.length;
          case "BOARD_MIN":
            return Math.min(...values);
          case "BOARD_MAX":
            return Math.max(...values);
        }
        return null;
      }

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }
}

// ============================================================
// Helper
// ============================================================

function toNumber(val: FormulaValue): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? 1 : 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

// ============================================================
// Public API
// ============================================================

/**
 * Evaluate a formula expression in the context of an item.
 * Returns the computed value, or an error string prefixed with "#ERR:".
 */
export function evaluateFormula(
  expression: string,
  ctx: FormulaContext
): FormulaValue {
  if (!expression || expression.trim() === "") return null;

  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens, ctx);
    return parser.parse();
  } catch (err: any) {
    return `#ERR: ${err.message}`;
  }
}

/**
 * Format a formula result for display.
 */
export function formatFormulaResult(
  value: FormulaValue,
  format?: "plain" | "currency" | "percent",
  currencySymbol?: string
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.startsWith("#ERR:")) return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;

  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);

  switch (format) {
    case "currency":
      return `${currencySymbol || "$"}${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent":
      return `${(num * 100).toFixed(1)}%`;
    default:
      return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}
