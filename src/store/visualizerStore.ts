import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TraceStep, Language, HeapValue, HeapObject } from '@/lib/executor/types';

export interface WatchEntry {
  id: string;
  expression: string; // variable name or simple path like "user.name"
}

interface VisualizerState {
  // Source code per language
  sources: Record<Language, string>;

  // Trace state
  trace: TraceStep[];
  index: number;
  isPlaying: boolean;
  speedMs: number;
  status: 'idle' | 'running' | 'ready' | 'error' | 'stale';
  errorMessage: string | null;
  language: Language;

  // Debug controls
  breakpoints: Record<Language, number[]>;
  watches: WatchEntry[];

  // UI state
  hoveredVariable: string | null;
  hoveredHeapId: string | null;
  pinnedHeapId: string | null;
  splitPct: number;
  showShortcuts: boolean;

  // Source actions
  setSource: (language: Language, code: string) => void;
  loadSample: (language: Language, code: string) => void;

  // Trace actions
  setTrace: (t: TraceStep[]) => void;
  setStatus: (s: VisualizerState['status']) => void;
  setError: (msg: string | null) => void;
  setLanguage: (l: Language) => void;
  markStale: () => void;

  // Hover/pin
  setHoveredVariable: (n: string | null) => void;
  setHoveredHeapId: (id: string | null) => void;
  togglePinnedHeap: (id: string) => void;

  // Step navigation
  stepForward: () => void;
  stepBackward: () => void;
  stepOver: () => void;
  stepInto: () => void;
  stepOut: () => void;
  jumpTo: (i: number) => void;
  jumpToEnd: () => void;
  jumpToStart: () => void;
  jumpToLine: (line: number) => void;
  runToNextBreakpoint: (direction?: 'forward' | 'backward') => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (ms: number) => void;

  // Breakpoints
  toggleBreakpoint: (line: number) => void;
  clearBreakpoints: () => void;

  // Watches
  addWatch: (expression: string) => void;
  removeWatch: (id: string) => void;

  // UI
  setSplitPct: (n: number) => void;
  toggleShortcuts: () => void;

  reset: () => void;
}

const DEFAULT_SOURCES: Record<Language, string> = {
  javascript: `// Try editing this — then press Run.
function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

const arr = [1, 2, 3];
arr.push(fib(5));

const user = { name: 'Ada', score: 0 };
user.score = arr.reduce((a, b) => a + b, 0);

console.log(user);
`,
  java: `// Bare statements get auto-wrapped in a class with main().
int x = 5;
int y = 7;
int[] arr = {1, 2, 3, 4};

ArrayList<Integer> list = new ArrayList<>();
list.add(x);
list.add(y);
list.add(x + y);

System.out.println("sum = " + list.get(2));
`,
};

/**
 * Helper: evaluate a simple watch expression like "x" or "user.name" against
 * the current step's scopes + heap. Returns a stringified preview.
 */
export function evalWatch(
  expression: string,
  step: TraceStep | null
): { value: string; found: boolean } {
  if (!step) return { value: '—', found: false };

  const path = expression.split('.').map((s) => s.trim()).filter(Boolean);
  if (path.length === 0) return { value: '—', found: false };

  // Find root in scopes
  let current: HeapValue | undefined;
  for (const scope of step.scopes) {
    if (path[0] in scope.bindings) {
      current = scope.bindings[path[0]];
      break;
    }
  }
  if (!current) return { value: 'undefined', found: false };

  // Walk path
  for (let i = 1; i < path.length; i++) {
    if (current.kind !== 'ref') {
      return { value: 'undefined', found: false };
    }
    const obj: HeapObject | undefined = step.heap[current.id];
    if (!obj) return { value: 'undefined', found: false };
    if (obj.kind !== 'object') return { value: 'undefined', found: false };
    const next: HeapValue | undefined = obj.entries[path[i]];
    if (!next) return { value: 'undefined', found: false };
    current = next;
  }

  return { value: previewValue(current, step.heap), found: true };
}

function previewValue(v: HeapValue, heap: Record<string, HeapObject>): string {
  if (v.kind === 'primitive') {
    if (typeof v.value === 'string') return JSON.stringify(v.value);
    return String(v.value);
  }
  const obj = heap[v.id];
  if (!obj) return '→ ?';
  if (obj.kind === 'array') {
    if (obj.entries.length === 0) return '[]';
    const sample = obj.entries
      .slice(0, 5)
      .map((e) => previewValue(e, heap))
      .join(', ');
    return `[${sample}${obj.entries.length > 5 ? ', …' : ''}]`;
  }
  if (obj.kind === 'object') {
    const keys = Object.keys(obj.entries);
    if (keys.length === 0) return '{}';
    const sample = keys
      .slice(0, 3)
      .map((k) => `${k}: ${previewValue(obj.entries[k], heap)}`)
      .join(', ');
    return `{${sample}${keys.length > 3 ? ', …' : ''}}`;
  }
  return `ƒ ${obj.name}`;
}

/**
 * Compare call-stack depths to determine step-over/step-out semantics.
 */
function findStepOver(
  trace: TraceStep[],
  fromIndex: number,
  direction: 1 | -1
): number {
  if (fromIndex < 0 || fromIndex >= trace.length) return fromIndex;
  const baselineDepth = trace[fromIndex].callStack.length;

  for (let i = fromIndex + direction; i >= 0 && i < trace.length; i += direction) {
    if (trace[i].callStack.length <= baselineDepth) return i;
  }
  // Fall back to single step
  const fallback = fromIndex + direction;
  return Math.max(0, Math.min(trace.length - 1, fallback));
}

function findStepOut(
  trace: TraceStep[],
  fromIndex: number,
  direction: 1 | -1
): number {
  if (fromIndex < 0 || fromIndex >= trace.length) return fromIndex;
  const baselineDepth = trace[fromIndex].callStack.length;
  if (baselineDepth <= 1) {
    // Already at top level — degrade to "go to end"
    return direction === 1 ? trace.length - 1 : 0;
  }

  for (let i = fromIndex + direction; i >= 0 && i < trace.length; i += direction) {
    if (trace[i].callStack.length < baselineDepth) return i;
  }
  return direction === 1 ? trace.length - 1 : 0;
}

export const useVisualizerStore = create<VisualizerState>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      trace: [],
      index: 0,
      isPlaying: false,
      speedMs: 600,
      status: 'idle',
      errorMessage: null,
      language: 'javascript',
      breakpoints: { javascript: [], java: [] },
      watches: [],
      hoveredVariable: null,
      hoveredHeapId: null,
      pinnedHeapId: null,
      splitPct: 48,
      showShortcuts: false,

      setSource: (language, code) =>
        set((s) => ({
          sources: { ...s.sources, [language]: code },
        })),
      loadSample: (language, code) =>
        set((s) => ({
          sources: { ...s.sources, [language]: code },
          trace: [],
          index: 0,
          status: 'idle',
          errorMessage: null,
        })),

      setTrace: (trace) =>
        set({
          trace,
          index: 0,
          isPlaying: false,
          status: trace.length > 0 ? 'ready' : 'idle',
          hoveredVariable: null,
          hoveredHeapId: null,
          pinnedHeapId: null,
        }),
      setStatus: (status) => set({ status }),
      setError: (errorMessage) =>
        set({ errorMessage, status: errorMessage ? 'error' : 'idle' }),
      setLanguage: (language) =>
        set({
          language,
          trace: [],
          index: 0,
          status: 'idle',
          errorMessage: null,
          hoveredVariable: null,
          hoveredHeapId: null,
          pinnedHeapId: null,
        }),
      markStale: () => {
        const { status, trace } = get();
        if (trace.length > 0 && status !== 'stale') set({ status: 'stale' });
      },

      setHoveredVariable: (n) => set({ hoveredVariable: n }),
      setHoveredHeapId: (id) => set({ hoveredHeapId: id }),
      togglePinnedHeap: (id) =>
        set((s) => ({ pinnedHeapId: s.pinnedHeapId === id ? null : id })),

      stepForward: () => {
        const { index, trace } = get();
        if (index < trace.length - 1) set({ index: index + 1 });
        else set({ isPlaying: false });
      },
      stepBackward: () => {
        const { index } = get();
        if (index > 0) set({ index: index - 1 });
      },
      stepOver: () => {
        const { trace, index } = get();
        if (trace.length === 0) return;
        set({ index: findStepOver(trace, index, 1), isPlaying: false });
      },
      stepInto: () => {
        // For our trace, "into" is just "next" since we already capture every step
        get().stepForward();
      },
      stepOut: () => {
        const { trace, index } = get();
        if (trace.length === 0) return;
        set({ index: findStepOut(trace, index, 1), isPlaying: false });
      },
      jumpTo: (i) => {
        const { trace } = get();
        if (trace.length === 0) return;
        set({ index: Math.max(0, Math.min(i, trace.length - 1)) });
      },
      jumpToEnd: () => {
        const { trace } = get();
        if (trace.length > 0) set({ index: trace.length - 1, isPlaying: false });
      },
      jumpToStart: () => set({ index: 0, isPlaying: false }),

      jumpToLine: (line) => {
        const { trace, index } = get();
        if (trace.length === 0) return;
        let target = -1;
        for (let i = index + 1; i < trace.length; i++) {
          if (trace[i].line === line) { target = i; break; }
        }
        if (target === -1) {
          for (let i = 0; i < trace.length; i++) {
            if (trace[i].line === line) { target = i; break; }
          }
        }
        if (target !== -1) set({ index: target, isPlaying: false });
      },

      runToNextBreakpoint: (direction = 'forward') => {
        const { trace, index, breakpoints, language } = get();
        if (trace.length === 0) return;
        const bps = new Set(breakpoints[language]);
        if (bps.size === 0) {
          // No breakpoints — just go to end / start
          if (direction === 'forward')
            set({ index: trace.length - 1, isPlaying: false });
          else set({ index: 0, isPlaying: false });
          return;
        }
        const step = direction === 'forward' ? 1 : -1;
        for (let i = index + step; i >= 0 && i < trace.length; i += step) {
          if (bps.has(trace[i].line)) {
            set({ index: i, isPlaying: false });
            return;
          }
        }
        // Nothing hit — go to bound
        if (direction === 'forward')
          set({ index: trace.length - 1, isPlaying: false });
        else set({ index: 0, isPlaying: false });
      },

      play: () => {
        const { trace, index } = get();
        if (trace.length === 0) return;
        if (index >= trace.length - 1) set({ index: 0 });
        set({ isPlaying: true });
      },
      pause: () => set({ isPlaying: false }),
      togglePlay: () => {
        if (get().isPlaying) get().pause();
        else get().play();
      },
      setSpeed: (speedMs) => set({ speedMs }),

      toggleBreakpoint: (line) =>
        set((s) => {
          const current = new Set(s.breakpoints[s.language]);
          if (current.has(line)) current.delete(line);
          else current.add(line);
          return {
            breakpoints: {
              ...s.breakpoints,
              [s.language]: [...current].sort((a, b) => a - b),
            },
          };
        }),
      clearBreakpoints: () =>
        set((s) => ({
          breakpoints: { ...s.breakpoints, [s.language]: [] },
        })),

      addWatch: (expression) =>
        set((s) => {
          const trimmed = expression.trim();
          if (!trimmed) return s;
          if (s.watches.some((w) => w.expression === trimmed)) return s;
          return {
            watches: [
              ...s.watches,
              {
                id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                expression: trimmed,
              },
            ],
          };
        }),
      removeWatch: (id) =>
        set((s) => ({ watches: s.watches.filter((w) => w.id !== id) })),

      setSplitPct: (n) => set({ splitPct: Math.min(75, Math.max(25, n)) }),
      toggleShortcuts: () =>
        set((s) => ({ showShortcuts: !s.showShortcuts })),

      reset: () =>
        set({
          trace: [],
          index: 0,
          isPlaying: false,
          status: 'idle',
          errorMessage: null,
          hoveredVariable: null,
          hoveredHeapId: null,
          pinnedHeapId: null,
        }),
    }),
    {
      name: 'code-visualizer-state',
      storage: createJSONStorage(() => localStorage),
      // Don't persist transient runtime state — only user preferences
      partialize: (state) => ({
        sources: state.sources,
        language: state.language,
        speedMs: state.speedMs,
        breakpoints: state.breakpoints,
        watches: state.watches,
        splitPct: state.splitPct,
      }),
    }
  )
);
