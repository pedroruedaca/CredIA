/**
 * Arithmetic for the `compute` tool: + − × ÷, parentheses, unary minus, numeric literals and named operands. Pure.
 * No functions, no property access, no eval: an expression either parses into this grammar or is rejected.
 */

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token = { kind: "num"; value: number } | { kind: "name"; name: string } | { kind: "op"; op: string };

function tokenize(src: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) return `número no válido en la posición ${i + 1}`;
      out.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z_]/i.test(ch)) {
      const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i))!;
      out.push({ kind: "name", name: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      out.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    return `carácter no permitido «${ch}»`;
  }
  return out;
}

export function evaluate(expression: string, operands: Record<string, number>): CalcResult {
  if (expression.length > 300) return { ok: false, error: "expresión demasiado larga" };
  const tokens = tokenize(expression);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (op: string) => peek()?.kind === "op" && (peek() as { op: string }).op === op;

  // expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* ; factor := '-' factor | num | name | '(' expr ')'
  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { op: string }).op;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = factor();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[pos++] as { op: string }).op;
      const r = factor();
      if (op === "/" && r === 0) throw new Error("división por cero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function factor(): number {
    const t = peek();
    if (!t) throw new Error("expresión incompleta");
    if (isOp("-")) {
      pos++;
      return -factor();
    }
    if (isOp("(")) {
      pos++;
      const v = expr();
      if (!isOp(")")) throw new Error("falta «)»");
      pos++;
      return v;
    }
    pos++;
    if (t.kind === "num") return t.value;
    if (t.kind === "name") {
      if (!(t.name in operands)) throw new Error(`operando desconocido «${t.name}»`);
      return operands[t.name];
    }
    throw new Error(`«${t.op}» inesperado`);
  }

  try {
    const value = expr();
    if (pos !== tokens.length) return { ok: false, error: "sobra texto al final de la expresión" };
    if (!Number.isFinite(value)) return { ok: false, error: "el resultado no es un número finito" };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
