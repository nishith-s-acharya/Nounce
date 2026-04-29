/**
 * Sandboxed worker process.
 *
 * Receives { code, opts } from the parent via IPC, runs the user code under an
 * inspector Session, and emits a fine-grained execution trace.
 *
 * IMPORTANT: All inspector calls inside the `Debugger.paused` handler MUST use
 * the callback-based API (not async/await). Awaiting a promise yields the V8
 * microtask queue, which causes the runtime to leave the "paused" state — and
 * subsequent stepInto/getProperties calls then fail with
 * `Inspector error -32000: Can only perform operation while paused.`
 *
 * Run as a forked child process — never inline in the API process.
 */

import * as vm from 'vm';
import * as inspector from 'inspector';
import type {
  TraceStep,
  HeapObject,
  HeapValue,
  ExecuteResponse,
  ExecutorOptions,
  Scope,
  ScopeType,
} from '../types';

interface IncomingMessage {
  code: string;
  opts: ExecutorOptions;
}

const SCRIPT_FILENAME = 'user-script.js';

type CdpCallback<T = unknown> = (err: Error | null, result?: T) => void;

function run(msg: IncomingMessage): void {
  const { code, opts } = msg;

  const trace: TraceStep[] = [];
  const stdout: string[] = [];
  const heap: Record<string, HeapObject> = {};
  let prevBindingsSerialized = '';
  let stepIndex = 0;
  let halted = false;
  let userScriptId: string | null = null;
  let finished = false;

  const session = new inspector.Session();
  session.connect();

  // -------------------------------------------------------------------------
  // CDP helpers
  // -------------------------------------------------------------------------
  function post<T = unknown>(
    method: string,
    params: object = {},
    cb?: CdpCallback<T>
  ): void {
    // session.post types are strict in @types/node; cast through unknown
    (session.post as unknown as (m: string, p: object, c: CdpCallback<T>) => void)(
      method,
      params,
      cb ?? (() => {})
    );
  }

  function postAsync<T = unknown>(method: string, params: object = {}): Promise<T> {
    return new Promise((resolve, reject) =>
      post<T>(method, params, (err, res) =>
        err ? reject(err) : resolve(res as T)
      )
    );
  }

  // -------------------------------------------------------------------------
  // Sandbox
  // -------------------------------------------------------------------------
  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) =>
        stdout.push(args.map(safeStringify).join(' ')),
      warn: (...args: unknown[]) =>
        stdout.push('[warn] ' + args.map(safeStringify).join(' ')),
      error: (...args: unknown[]) =>
        stdout.push('[error] ' + args.map(safeStringify).join(' ')),
    },
  };
  vm.createContext(sandbox, { name: 'user-sandbox' });

  // -------------------------------------------------------------------------
  // Heap value extraction (callback-based, no awaits!)
  // -------------------------------------------------------------------------
  type HeapDone = (v: HeapValue) => void;

  function buildHeapValue(remote: RemoteObject, done: HeapDone): void {
    if (remote.type !== 'object' && remote.type !== 'function') {
      let value = remote.value;
      if (typeof value === 'string' && value.length > opts.maxStringLength) {
        value = value.slice(0, opts.maxStringLength) + '…';
      }
      done({
        kind: 'primitive',
        value: value as Primitive,
        type: remote.type,
      });
      return;
    }

    if (remote.subtype === 'null') {
      done({ kind: 'primitive', value: null, type: 'null' });
      return;
    }

    const id = remote.objectId;
    if (!id) {
      done({ kind: 'primitive', value: '<no-id>' });
      return;
    }

    if (heap[id]) {
      done({ kind: 'ref', id });
      return;
    }

    if (Object.keys(heap).length >= opts.maxHeapObjects) {
      done({ kind: 'primitive', value: '<heap-limit>' });
      return;
    }

    // Reserve a slot to handle cycles
    heap[id] = { kind: 'object', id, entries: {} };

    if (remote.type === 'function') {
      heap[id] = {
        kind: 'function',
        id,
        name: cleanFunctionName(remote.description ?? 'fn'),
      };
      done({ kind: 'ref', id });
      return;
    }

    post<{ result: PropertyDescriptor[] }>(
      'Runtime.getProperties',
      {
        objectId: id,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: false,
      },
      (err, res) => {
        if (err || !res) {
          done({ kind: 'ref', id });
          return;
        }

        if (remote.subtype === 'array') {
          const entries: HeapValue[] = [];
          const indexed = res.result.filter(
            (p) => /^\d+$/.test(p.name) && p.value
          );

          if (indexed.length === 0) {
            heap[id] = { kind: 'array', id, entries };
            done({ kind: 'ref', id });
            return;
          }

          let pending = indexed.length;
          for (const p of indexed) {
            const idx = Number(p.name);
            buildHeapValue(p.value!, (v) => {
              entries[idx] = v;
              if (--pending === 0) {
                heap[id] = { kind: 'array', id, entries };
                done({ kind: 'ref', id });
              }
            });
          }
        } else {
          const props = res.result.filter(
            (p) =>
              p.value &&
              p.name !== '__proto__' &&
              p.enumerable !== false
          );
          const entries: Record<string, HeapValue> = {};

          if (props.length === 0) {
            heap[id] = { kind: 'object', id, entries };
            done({ kind: 'ref', id });
            return;
          }

          let pending = props.length;
          for (const p of props) {
            const k = p.name;
            buildHeapValue(p.value!, (v) => {
              entries[k] = v;
              if (--pending === 0) {
                heap[id] = { kind: 'object', id, entries };
                done({ kind: 'ref', id });
              }
            });
          }
        }
      }
    );
  }

  // -------------------------------------------------------------------------
  // Pause handler — fully synchronous (callback chain)
  // -------------------------------------------------------------------------
  session.on('Debugger.scriptParsed', (event) => {
    const params = event.params as { url?: string; scriptId: string };
    if (params.url === SCRIPT_FILENAME) {
      userScriptId = params.scriptId;
    }
  });

  session.on('Debugger.paused', (event) => {
    const params = event.params as PausedParams;
    const top = params.callFrames[0];

    // Filter: only trace pauses inside the user script
    const inUserScript =
      userScriptId !== null && top.location.scriptId === userScriptId;

    if (!inUserScript) {
      // We've stepped into Node internals (console.log, etc.) — step out.
      post('Debugger.stepOut', {}, (err) => {
        if (err) post('Debugger.resume', {}, () => {});
      });
      return;
    }

    if (stepIndex >= opts.maxSteps) {
      halted = true;
      post('Debugger.resume', {}, () => {});
      return;
    }

    // Walk the scope chain via callbacks
    const scopesToProcess = top.scopeChain.filter(
      (s) => s.type !== 'global' && s.object.objectId
    );

    const scopes: Scope[] = [];
    let scopeIdx = 0;

    const processNextScope = (): void => {
      if (scopeIdx >= scopesToProcess.length) {
        finishStep();
        return;
      }

      const scope = scopesToProcess[scopeIdx++];
      post<{ result: PropertyDescriptor[] }>(
        'Runtime.getProperties',
        { objectId: scope.object.objectId!, ownProperties: true },
        (err, res) => {
          if (err || !res) {
            processNextScope();
            return;
          }

          const propList = res.result.filter(
            (p) =>
              p.value &&
              p.name !== 'this' &&
              p.name !== 'arguments'
          );

          if (propList.length === 0) {
            processNextScope();
            return;
          }

          const bindings: Record<string, HeapValue> = {};
          let pIdx = 0;

          const processNextProp = (): void => {
            if (pIdx >= propList.length) {
              if (Object.keys(bindings).length > 0) {
                scopes.push({
                  type: scope.type as ScopeType,
                  bindings,
                });
              }
              processNextScope();
              return;
            }

            const p = propList[pIdx++];
            buildHeapValue(p.value!, (v) => {
              bindings[p.name] = v;
              processNextProp();
            });
          };

          processNextProp();
        }
      );
    };

    const finishStep = (): void => {
      // Compute changed-vars diff against the previous step
      const currentBindings: Record<string, string> = {};
      for (const sc of scopes) {
        for (const [k, v] of Object.entries(sc.bindings)) {
          currentBindings[`${sc.type}:${k}`] = JSON.stringify(v);
        }
      }
      const newSerialized = JSON.stringify(currentBindings);
      const changedVars: string[] = [];
      if (prevBindingsSerialized) {
        try {
          const prev = JSON.parse(prevBindingsSerialized) as Record<string, string>;
          for (const k of Object.keys(currentBindings)) {
            if (prev[k] !== currentBindings[k]) {
              changedVars.push(k.split(':').slice(1).join(':'));
            }
          }
        } catch {}
      }
      prevBindingsSerialized = newSerialized;

      // Filter call stack to user-script frames only
      const callStack = params.callFrames
        .filter((f) => f.location.scriptId === userScriptId)
        .map((f) => ({
          functionName: f.functionName || '(top)',
          line: f.location.lineNumber + 1,
        }));

      trace.push({
        stepIndex: stepIndex++,
        line: top.location.lineNumber + 1,
        callStack,
        scopes: scopes.slice(),
        heap: cloneHeap(heap),
        changedVars,
        stdout: stdout.length ? stdout.join('\n') : undefined,
      });

      // Step to the next statement. stepInto walks into function calls,
      // including Node internals — the inUserScript filter at the top of this
      // handler will bounce us back out via stepOut.
      post('Debugger.stepInto', {}, (err) => {
        if (err) post('Debugger.resume', {}, () => {});
      });
    };

    processNextScope();
  });

  // -------------------------------------------------------------------------
  // Bootstrap: enable debugger, set entry breakpoint, run user code
  // -------------------------------------------------------------------------
  postAsync('Debugger.enable')
    .then(() =>
      postAsync('Debugger.setBreakpointByUrl', {
        lineNumber: 0,
        urlRegex: SCRIPT_FILENAME.replace(/\./g, '\\.'),
      })
    )
    .then(() => {
      const script = new vm.Script(code, { filename: SCRIPT_FILENAME });
      try {
        script.runInContext(sandbox, {
          displayErrors: true,
          breakOnSigint: false,
        });
      } catch (err) {
        const e = err as Error;
        const lineMatch = /:(\d+)(?::\d+)?\)?$/m.exec(e.stack ?? '');
        finalize({
          trace,
          error: {
            message: e.message,
            line: lineMatch ? Number(lineMatch[1]) : undefined,
          },
        });
        return;
      }

      // Allow any in-flight CDP callbacks to drain before we send.
      // 100ms is more than enough — paused-handlers run synchronously
      // and only async work is the final stepInto after the last user line.
      setTimeout(() => {
        finalize({
          trace,
          ...(halted
            ? { error: { message: `Halted: exceeded ${opts.maxSteps} trace steps` } }
            : {}),
        });
      }, 50);
    })
    .catch((err) => {
      finalize({
        trace,
        error: { message: (err as Error).message ?? 'Worker bootstrap failed' },
      });
    });

  function finalize(response: ExecuteResponse): void {
    if (finished) return;
    finished = true;
    try {
      session.disconnect();
    } catch {}
    if (process.send) {
      process.send(response, undefined, {}, () => process.exit(0));
    } else {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 200).unref();
  }
}

// ---------------------------------------------------------------------------
// Helper types & functions
// ---------------------------------------------------------------------------
type Primitive = string | number | boolean | null | undefined;

interface RemoteObject {
  type: string;
  subtype?: string;
  value?: unknown;
  objectId?: string;
  description?: string;
}

interface PropertyDescriptor {
  name: string;
  value?: RemoteObject;
  enumerable?: boolean;
}

interface PausedParams {
  reason: string;
  callFrames: Array<{
    functionName: string;
    location: { lineNumber: number; columnNumber: number; scriptId: string };
    url?: string;
    scopeChain: Array<{
      type: string;
      object: { objectId?: string };
    }>;
  }>;
}

function cloneHeap(heap: Record<string, HeapObject>): Record<string, HeapObject> {
  const out: Record<string, HeapObject> = {};
  for (const [k, v] of Object.entries(heap)) {
    if (v.kind === 'array') out[k] = { ...v, entries: [...v.entries] };
    else if (v.kind === 'object') out[k] = { ...v, entries: { ...v.entries } };
    else out[k] = { ...v };
  }
  return out;
}

function safeStringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function cleanFunctionName(desc: string): string {
  const m = /^function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/.exec(desc);
  if (!m) return desc.length > 40 ? desc.slice(0, 40) + '…' : desc;
  const name = m[1] || '(anonymous)';
  return `${name}(${m[2]})`;
}

// ---------------------------------------------------------------------------
// IPC entrypoint
// ---------------------------------------------------------------------------
process.on('message', (msg: unknown) => {
  if (!msg || typeof msg !== 'object') return;
  const m = msg as IncomingMessage;
  if (typeof m.code !== 'string') return;
  try {
    run(m);
  } catch (err) {
    const response: ExecuteResponse = {
      trace: [],
      error: { message: (err as Error).message ?? 'Worker crashed' },
    };
    if (process.send) process.send(response);
    process.exit(0);
  }
});

process.on('uncaughtException', (err) => {
  const response: ExecuteResponse = {
    trace: [],
    error: { message: 'uncaught: ' + err.message },
  };
  if (process.send) process.send(response);
  process.exit(0);
});
