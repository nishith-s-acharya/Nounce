/**
 * Control flow analyzer.
 *
 * Statically parses the source code to find every conditional (`if`, `else if`, `else`, ternary)
 * and loop (`for`, `while`, `do…while`, `for…of`, `for…in`). Builds a map keyed by line number
 * describing the control-flow shape. Then, given a trace, infers per-step what happened:
 *
 *   - At an `if` line: did the condition evaluate truthy or falsy? (Look at the next line:
 *     is it inside the consequent block or the alternate?)
 *   - At a `while`/`for` line: which iteration is this? Did the loop continue or exit?
 *
 * For Java we use a simpler regex-based detector — Java's `if`/`while`/`for`/`else` are regular
 * enough at the textual level that a tokenizer-free pass is reliable for the common cases.
 */

import type { TraceStep, Language } from './executor/types';

export type ControlNodeKind =
  | 'if'
  | 'else-if'
  | 'else'
  | 'while'
  | 'do-while'
  | 'for'
  | 'for-of'
  | 'for-in'
  | 'switch'
  | 'case'
  | 'ternary';

export interface ControlNode {
  /** 1-indexed line where the keyword appears */
  line: number;
  kind: ControlNodeKind;
  /** Source text of the condition / loop header, trimmed */
  condition: string;
  /** Lines fully contained in the consequent / loop body */
  bodyLines: Set<number>;
  /** Lines in the else / alternate branch (if any) */
  elseLines?: Set<number>;
  /** First line after the entire construct */
  postLine: number;
  /** For an `if` chain, the line of the matching `else` or `else if` (if any) */
  elseLine?: number;
}

export type LineMap = Record<number, ControlNode>;

/**
 * Per-step control flow event derived by combining the LineMap with the trace.
 */
export type ControlEvent =
  | {
      kind: 'condition';
      controlKind: 'if' | 'else-if' | 'while' | 'do-while' | 'for' | 'ternary';
      line: number;
      condition: string;
      taken: boolean;
      iteration?: number; // for loops
    }
  | {
      kind: 'iteration';
      controlKind: 'for' | 'while' | 'for-of' | 'for-in' | 'do-while';
      line: number;
      condition: string;
      iteration: number;
    }
  | {
      kind: 'else-entered';
      line: number;
    };

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

export function analyzeControlFlow(source: string, language: Language): LineMap {
  if (language === 'javascript') return analyzeJs(source);
  return analyzeJavaLike(source);
}

/**
 * For a given trace step, derive the control-flow event (if any) by looking
 * at this step's line + the next step's line + the LineMap.
 */
export function inferEvent(
  trace: TraceStep[],
  index: number,
  lineMap: LineMap
): ControlEvent | null {
  const step = trace[index];
  if (!step) return null;
  const node = lineMap[step.line];
  if (!node) return null;

  // Find the next trace step in the same call frame (callstack length must not deepen
  // unless via the consequent — we're trying to figure out whether we entered the body).
  const nextStep = findNextStepSameOrLowerFrame(trace, index);
  if (!nextStep) return null;

  if (node.kind === 'if' || node.kind === 'else-if') {
    const taken = node.bodyLines.has(nextStep.line);
    return {
      kind: 'condition',
      controlKind: node.kind,
      line: node.line,
      condition: node.condition,
      taken,
    };
  }

  if (node.kind === 'while' || node.kind === 'do-while') {
    const taken = node.bodyLines.has(nextStep.line);
    const iteration = countPriorVisits(trace, index, node.line);
    return {
      kind: 'condition',
      controlKind: node.kind,
      line: node.line,
      condition: node.condition,
      taken,
      iteration,
    };
  }

  if (node.kind === 'for') {
    const taken = node.bodyLines.has(nextStep.line);
    const iteration = countPriorVisits(trace, index, node.line);
    return {
      kind: 'condition',
      controlKind: 'for',
      line: node.line,
      condition: node.condition,
      taken,
      iteration,
    };
  }

  if (node.kind === 'for-of' || node.kind === 'for-in') {
    const iteration = countPriorVisits(trace, index, node.line);
    return {
      kind: 'iteration',
      controlKind: node.kind,
      line: node.line,
      condition: node.condition,
      iteration,
    };
  }

  return null;
}

function findNextStepSameOrLowerFrame(
  trace: TraceStep[],
  index: number
): TraceStep | null {
  const baseDepth = trace[index].callStack.length;
  for (let i = index + 1; i < Math.min(index + 8, trace.length); i++) {
    if (trace[i].callStack.length <= baseDepth) return trace[i];
  }
  return trace[index + 1] ?? null;
}

function countPriorVisits(
  trace: TraceStep[],
  upToIndex: number,
  line: number
): number {
  let n = 0;
  for (let i = 0; i <= upToIndex; i++) {
    if (trace[i].line === line) n++;
  }
  return n;
}

// ───────────────────────────────────────────────────────────────────────────
// JS (proper AST via acorn)
// ───────────────────────────────────────────────────────────────────────────

interface AcornNode {
  type: string;
  start: number;
  end: number;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [k: string]: unknown;
}

function analyzeJs(source: string): LineMap {
  let ast: AcornNode;
  try {
    // Lazy-import acorn so it's only loaded client-side
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const acorn = require('acorn');
    ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    }) as AcornNode;
  } catch {
    return {};
  }

  const map: LineMap = {};
  const lines = source.split('\n');

  function lineOf(n: AcornNode): number {
    return n.loc?.start.line ?? 1;
  }

  function endLine(n: AcornNode): number {
    return n.loc?.end.line ?? lineOf(n);
  }

  function rangeLines(from: number, to: number): Set<number> {
    const s = new Set<number>();
    for (let l = from; l <= to; l++) s.add(l);
    return s;
  }

  function condText(n: AcornNode): string {
    const text = source.slice(n.start, n.end);
    return text.replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function bodyRange(n: AcornNode): Set<number> {
    // For block statements, use the first inner statement's line (skipping the `{`).
    if (n.type === 'BlockStatement') {
      const stmts = n.body as AcornNode[] | undefined;
      if (Array.isArray(stmts) && stmts.length > 0) {
        return rangeLines(lineOf(stmts[0]), endLine(stmts[stmts.length - 1]));
      }
      // Empty block — no body lines
      return new Set();
    }
    // Single-statement body (no braces)
    return rangeLines(lineOf(n), endLine(n));
  }

  function visit(n: AcornNode, parent: AcornNode | null = null): void {
    if (!n || typeof n !== 'object') return;

    switch (n.type) {
      case 'IfStatement': {
        const test = n.test as AcornNode;
        const consequent = n.consequent as AcornNode;
        const alternate = n.alternate as AcornNode | undefined;
        const isElseIf =
          parent?.type === 'IfStatement' &&
          (parent.alternate as AcornNode | undefined) === n;
        map[lineOf(n)] = {
          line: lineOf(n),
          kind: isElseIf ? 'else-if' : 'if',
          condition: condText(test),
          bodyLines: bodyRange(consequent),
          elseLines: alternate ? bodyRange(alternate) : undefined,
          postLine: endLine(n) + 1,
          elseLine: alternate ? lineOf(alternate) : undefined,
        };
        break;
      }
      case 'WhileStatement': {
        const test = n.test as AcornNode;
        const body = n.body as AcornNode;
        map[lineOf(n)] = {
          line: lineOf(n),
          kind: 'while',
          condition: condText(test),
          bodyLines: bodyRange(body),
          postLine: endLine(n) + 1,
        };
        break;
      }
      case 'DoWhileStatement': {
        const test = n.test as AcornNode;
        const body = n.body as AcornNode;
        map[endLine(n)] = {
          line: endLine(n),
          kind: 'do-while',
          condition: condText(test),
          bodyLines: bodyRange(body),
          postLine: endLine(n) + 1,
        };
        break;
      }
      case 'ForStatement': {
        const test = n.test as AcornNode | null;
        const init = n.init as AcornNode | null;
        const update = n.update as AcornNode | null;
        const body = n.body as AcornNode;
        const parts: string[] = [];
        parts.push(init ? condText(init) : '');
        parts.push(test ? condText(test) : '');
        parts.push(update ? condText(update) : '');
        map[lineOf(n)] = {
          line: lineOf(n),
          kind: 'for',
          condition: parts.join('; '),
          bodyLines: bodyRange(body),
          postLine: endLine(n) + 1,
        };
        break;
      }
      case 'ForOfStatement':
      case 'ForInStatement': {
        const left = n.left as AcornNode;
        const right = n.right as AcornNode;
        const body = n.body as AcornNode;
        const sep = n.type === 'ForOfStatement' ? ' of ' : ' in ';
        map[lineOf(n)] = {
          line: lineOf(n),
          kind: n.type === 'ForOfStatement' ? 'for-of' : 'for-in',
          condition: condText(left) + sep + condText(right),
          bodyLines: bodyRange(body),
          postLine: endLine(n) + 1,
        };
        break;
      }
    }

    // Recurse over children
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
      const v = (n as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && (item as AcornNode).type) {
            visit(item as AcornNode, n);
          }
        }
      } else if (v && typeof v === 'object' && (v as AcornNode).type) {
        visit(v as AcornNode, n);
      }
    }
  }

  visit(ast);
  // Suppress unused-var warning if `lines` isn't referenced elsewhere
  void lines;
  return map;
}

// ───────────────────────────────────────────────────────────────────────────
// Java-like (regex-based scan with brace matching)
// ───────────────────────────────────────────────────────────────────────────

function analyzeJavaLike(source: string): LineMap {
  const stripped = stripCommentsAndStrings(source);
  const lines = stripped.split('\n');
  const map: LineMap = {};

  // Find each control keyword on its line and figure out the body block
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Try in order of specificity
    const ifMatch = /\b(else\s+if|if)\s*\(/.exec(line);
    if (ifMatch) {
      const keyword = ifMatch[1];
      const cond = extractParenContent(stripped, indexOfMatch(stripped, line, ifMatch));
      if (cond) {
        const body = findBlockAfter(stripped, lines, i, ifMatch.index + ifMatch[0].length - 1);
        if (body) {
          map[lineNum] = {
            line: lineNum,
            kind: keyword === 'if' ? 'if' : 'else-if',
            condition: cond.text.replace(/\s+/g, ' ').trim().slice(0, 80),
            bodyLines: body.bodyLines,
            postLine: body.postLine,
          };
        }
      }
      continue;
    }

    const whileMatch = /\bwhile\s*\(/.exec(line);
    if (whileMatch) {
      const cond = extractParenContent(stripped, indexOfMatch(stripped, line, whileMatch));
      if (cond) {
        const body = findBlockAfter(stripped, lines, i, whileMatch.index + whileMatch[0].length - 1);
        if (body) {
          map[lineNum] = {
            line: lineNum,
            kind: 'while',
            condition: cond.text.replace(/\s+/g, ' ').trim().slice(0, 80),
            bodyLines: body.bodyLines,
            postLine: body.postLine,
          };
        }
      }
      continue;
    }

    const forEachMatch = /\bfor\s*\(\s*[\w<>\[\],\s]+\s+(\w+)\s*:\s*([^)]+)\)/.exec(line);
    if (forEachMatch) {
      const body = findBlockAfter(stripped, lines, i, forEachMatch.index + forEachMatch[0].length - 1);
      if (body) {
        map[lineNum] = {
          line: lineNum,
          kind: 'for-of',
          condition: `${forEachMatch[1]} in ${forEachMatch[2].trim()}`,
          bodyLines: body.bodyLines,
          postLine: body.postLine,
        };
      }
      continue;
    }

    const forMatch = /\bfor\s*\(/.exec(line);
    if (forMatch) {
      const cond = extractParenContent(stripped, indexOfMatch(stripped, line, forMatch));
      if (cond) {
        const body = findBlockAfter(stripped, lines, i, forMatch.index + forMatch[0].length - 1);
        if (body) {
          map[lineNum] = {
            line: lineNum,
            kind: 'for',
            condition: cond.text.replace(/\s+/g, ' ').trim().slice(0, 80),
            bodyLines: body.bodyLines,
            postLine: body.postLine,
          };
        }
      }
    }
  }

  return map;
}

function indexOfMatch(full: string, line: string, m: RegExpExecArray): number {
  return full.indexOf(line) + m.index;
}

function extractParenContent(
  source: string,
  startIdx: number
): { text: string; endIdx: number } | null {
  // Find the opening `(`
  let i = startIdx;
  while (i < source.length && source[i] !== '(') i++;
  if (source[i] !== '(') return null;
  let depth = 0;
  const start = i;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        return { text: source.slice(start + 1, i), endIdx: i };
      }
    }
  }
  return null;
}

function findBlockAfter(
  source: string,
  lines: string[],
  startLineIdx: number,
  startCharInLine: number
): { bodyLines: Set<number>; postLine: number } | null {
  // Skip past the closing paren `)` to find `{` or single-statement
  // Find the absolute char index in source
  const sourceLines = source.split('\n');
  let absIdx = 0;
  for (let i = 0; i < startLineIdx; i++) absIdx += sourceLines[i].length + 1;
  absIdx += startCharInLine;

  // Walk forward, find paren close
  let depth = 0;
  let i = absIdx;
  while (i < source.length) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
    i++;
  }

  // Skip whitespace to find { or first non-ws statement
  while (i < source.length && /\s/.test(source[i])) i++;

  if (source[i] === '{') {
    // Brace block
    let braceDepth = 1;
    const blockStart = i;
    i++;
    while (i < source.length && braceDepth > 0) {
      if (source[i] === '{') braceDepth++;
      else if (source[i] === '}') braceDepth--;
      i++;
    }
    const blockEnd = i;
    return {
      bodyLines: lineRangeFromCharRange(source, blockStart, blockEnd),
      postLine: lineFromCharIdx(source, blockEnd) + 1,
    };
  } else {
    // Single statement until `;`
    let j = i;
    while (j < source.length && source[j] !== ';' && source[j] !== '\n') j++;
    return {
      bodyLines: lineRangeFromCharRange(source, i, j),
      postLine: lineFromCharIdx(source, j) + 1,
    };
  }
}

function lineFromCharIdx(source: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

function lineRangeFromCharRange(
  source: string,
  start: number,
  end: number
): Set<number> {
  const out = new Set<number>();
  for (let l = lineFromCharIdx(source, start); l <= lineFromCharIdx(source, end); l++) {
    out.add(l);
  }
  return out;
}

function stripCommentsAndStrings(source: string): string {
  // Replace string/comment contents with spaces of the same length so line/column
  // mapping stays exact. Helps avoid false matches inside strings.
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      // Line comment
      while (i < source.length && source[i] !== '\n') {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
    } else if (c === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < source.length) {
        out += '  ';
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          out += '  ';
          i += 2;
          continue;
        }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < source.length) {
        out += source[i];
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
