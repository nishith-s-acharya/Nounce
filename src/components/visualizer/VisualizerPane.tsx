'use client';

import { useRef, useMemo } from 'react';
import { useVisualizerStore } from '@/store/visualizerStore';
import { CallStack } from './CallStack';
import { StackFrames } from './StackFrames';
import { HeapView } from './HeapView';
import { PointerArrows } from './PointerArrows';
import { WatchPanel } from './WatchPanel';
import { ControlFlowPanel } from './ControlFlowPanel';

export function VisualizerPane() {
  const trace = useVisualizerStore((s) => s.trace);
  const index = useVisualizerStore((s) => s.index);
  const status = useVisualizerStore((s) => s.status);
  const errorMessage = useVisualizerStore((s) => s.errorMessage);
  const hoveredHeapId = useVisualizerStore((s) => s.hoveredHeapId);
  const pinnedHeapId = useVisualizerStore((s) => s.pinnedHeapId);
  const language = useVisualizerStore((s) => s.language);
  const breakpoints = useVisualizerStore((s) => s.breakpoints[language]);
  const clearBreakpoints = useVisualizerStore((s) => s.clearBreakpoints);

  const memoryContainerRef = useRef<HTMLDivElement>(null);
  const step = trace[index];
  const prevStep = trace[index - 1];

  const highlightIds = useMemo(() => {
    const ids = new Set<string>();
    if (!step) return ids;
    const changed = new Set(step.changedVars);
    for (const scope of step.scopes) {
      for (const [name, value] of Object.entries(scope.bindings)) {
        if (changed.has(name) && value.kind === 'ref') {
          ids.add(value.id);
        }
      }
    }
    if (hoveredHeapId) ids.add(hoveredHeapId);
    if (pinnedHeapId) ids.add(pinnedHeapId);
    return ids;
  }, [step, hoveredHeapId, pinnedHeapId]);

  if (status === 'idle' && trace.length === 0) return <EmptyState />;
  if (status === 'running') return <LoadingState />;
  if (status === 'error' && trace.length === 0)
    return <ErrorState message={errorMessage} />;

  if (!step) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-zinc-500">No trace data</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-3 p-4">
        {status === 'stale' && <StaleBanner />}

        <StepHeader
          stepIndex={step.stepIndex}
          totalSteps={trace.length}
          line={step.line}
        />

        {breakpoints.length > 0 && (
          <BreakpointsRow
            lines={breakpoints}
            onClear={clearBreakpoints}
          />
        )}

        <CallStack frames={step.callStack} />

        <ControlFlowPanel />

        <div ref={memoryContainerRef} className="relative">
          <div className="grid grid-cols-[1fr_1.4fr] gap-x-12 gap-y-3">
            <StackFrames scopes={step.scopes} changedVars={step.changedVars} />
            <HeapView
              heap={step.heap}
              prevHeap={prevStep?.heap}
              highlightIds={highlightIds}
            />
          </div>
          <PointerArrows
            containerRef={memoryContainerRef}
            stepKey={index}
            highlightIds={highlightIds}
          />
        </div>

        <WatchPanel />

        {step.stdout && <ConsoleOutput text={step.stdout} />}

        {errorMessage && status !== 'stale' && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="font-mono text-xs text-red-300">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function BreakpointsRow({
  lines,
  onClear,
}: {
  lines: number[];
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-neon-pink/15 bg-gradient-to-br from-neon-pink/[0.04] to-transparent px-3 py-2">
      <div className="flex h-1.5 w-1.5 items-center justify-center rounded-full bg-neon-pink shadow-[0_0_4px_#FF2D95]" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neon-pink/80">
        Breakpoints
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {lines.map((line) => (
          <span
            key={line}
            className="rounded border border-neon-pink/25 bg-neon-pink/5 px-1.5 py-0.5 font-mono text-[10px] text-neon-pink"
          >
            L{line}
          </span>
        ))}
      </div>
      <button
        onClick={onClear}
        className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300"
      >
        clear
      </button>
    </div>
  );
}

function StaleBanner() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-amber-400">
        <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinejoin="round" />
      </svg>
      <p className="text-[11px] text-amber-200/80">
        <span className="font-semibold">Code edited.</span>{' '}
        <span className="text-amber-200/60">
          Trace shows previous version — press Run to retrace.
        </span>
      </p>
    </div>
  );
}

function StepHeader({
  stepIndex,
  totalSteps,
  line,
}: {
  stepIndex: number;
  totalSteps: number;
  line: number;
}) {
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Step</span>
            <span className="font-mono text-base font-medium text-neon-green tabular-nums">{stepIndex + 1}</span>
            <span className="font-mono text-xs text-zinc-600">/ {totalSteps}</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Line</span>
            <span className="font-mono text-base font-medium text-neon-cyan tabular-nums">{line}</span>
          </div>
        </div>
      </div>
      <div className="h-[2px] w-full bg-white/[0.04]">
        <div
          className="h-full bg-gradient-to-r from-neon-green/60 via-neon-cyan/60 to-neon-pink/60 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ConsoleOutput({ text }: { text: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-midnight-deep/60 to-midnight-deep/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-3 py-1.5">
        <div className="flex gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-red-500/40" />
          <div className="h-1.5 w-1.5 rounded-full bg-yellow-500/40" />
          <div className="h-1.5 w-1.5 rounded-full bg-green-500/40" />
        </div>
        <h3 className="ml-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Console</h3>
      </div>
      <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-neon-green">{text}</pre>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-300">Ready to trace</p>
        <p className="mt-1.5 text-xs text-zinc-600">
          Press <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">Run</kbd> or load a sample
        </p>
        <div className="mt-5 rounded-lg border border-white/[0.04] bg-white/[0.015] p-3 text-left">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Quick tips</p>
          <ul className="space-y-1 text-[11px] text-zinc-500">
            <li>• Click in the gutter to set a <span className="text-neon-pink">breakpoint</span></li>
            <li>• Hover variables to highlight their <span className="text-neon-cyan">heap target</span></li>
            <li>• Click a heap card to <span className="text-zinc-300">pin</span> it</li>
            <li>• Add a watch to track a value across all steps</li>
            <li>• Press <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono text-[9px] text-zinc-300">?</kbd> for shortcuts</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <div className="relative mx-auto mb-4 h-10 w-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-neon-green border-r-neon-green/40" />
          <div className="absolute inset-2 rounded-full bg-neon-green/10 blur-md" />
        </div>
        <p className="text-xs font-medium text-zinc-400">Tracing execution</p>
        <p className="mt-1 text-[10px] text-zinc-600">stepping through your code…</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/[0.06] to-transparent p-5 backdrop-blur-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12" y2="16" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-400">Execution failed</p>
        </div>
        <p className="font-mono text-xs leading-relaxed text-red-300">{message}</p>
      </div>
    </div>
  );
}
