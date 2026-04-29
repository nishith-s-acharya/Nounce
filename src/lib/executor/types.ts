export type Language = 'javascript' | 'java';

export type Primitive = string | number | boolean | null | undefined;

export type HeapValue =
  | { kind: 'primitive'; value: Primitive; type?: string }
  | { kind: 'ref'; id: string };

export type HeapObject =
  | { kind: 'array'; id: string; entries: HeapValue[] }
  | { kind: 'object'; id: string; entries: Record<string, HeapValue> }
  | { kind: 'function'; id: string; name: string };

export interface CallFrame {
  functionName: string;
  line: number;
}

export type ScopeType = 'local' | 'closure' | 'global' | 'block' | 'script' | 'catch' | 'with' | 'eval' | 'module';

export interface Scope {
  type: ScopeType;
  bindings: Record<string, HeapValue>;
}

export interface TraceStep {
  stepIndex: number;
  line: number;
  callStack: CallFrame[];
  scopes: Scope[];
  heap: Record<string, HeapObject>;
  changedVars: string[];
  stdout?: string;
}

export interface ExecuteRequest {
  code: string;
  language: Language;
}

export interface ExecuteResponse {
  trace: TraceStep[];
  durationMs?: number;
  error?: { message: string; line?: number };
}

export interface ExecutorOptions {
  timeoutMs: number;
  maxSteps: number;
  maxHeapObjects: number;
  maxStringLength: number;
}
