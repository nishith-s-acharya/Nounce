'use client';

import { useMemo } from 'react';
import { useVisualizerStore } from '@/store/visualizerStore';
import { analyzeControlFlow, inferEvent, type ControlEvent } from '@/lib/controlFlow';
import { cn } from '@/lib/utils';

export function ControlFlowPanel() {
  const trace = useVisualizerStore((s) => s.trace);
  const index = useVisualizerStore((s) => s.index);
  const sources = useVisualizerStore((s) => s.sources);
  const language = useVisualizerStore((s) => s.language);

  const lineMap = useMemo(
    () => analyzeControlFlow(sources[language], language),
    [sources, language]
  );

  // Build full event list for current pass — most recent + history
  const recentEvents = useMemo(() => {
    if (trace.length === 0) return [];
    const out: Array<{ stepIndex: number; event: ControlEvent }> = [];
    // Look back ~30 steps for context
    const start = Math.max(0, index - 50);
    for (let i = start; i <= index; i++) {
      const ev = inferEvent(trace, i, lineMap);
      if (ev) out.push({ stepIndex: i, event: ev });
    }
    return out;
  }, [trace, index, lineMap]);

  // Current event is the one at the current step (if any) or the most recent
  const currentAtStep = useMemo(() => {
    if (trace.length === 0) return null;
    return inferEvent(trace, index, lineMap);
  }, [trace, index, lineMap]);

  // Count loop iterations seen so far (mapping line → count)
  const loopCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let i = 0; i <= index && i < trace.length; i++) {
      const ev = inferEvent(trace, i, lineMap);
      if (ev?.kind === 'condition' && (ev.controlKind === 'while' || ev.controlKind === 'for' || ev.controlKind === 'do-while')) {
        counts[ev.line] = (counts[ev.line] || 0) + 1;
      }
      if (ev?.kind === 'iteration') {
        counts[ev.line] = (counts[ev.line] || 0) + 1;
      }
    }
    return counts;
  }, [trace, index, lineMap]);

  if (trace.length === 0) return null;

  const loopLines = Object.entries(loopCounts);

  // If the static analysis found no control flow at all, show a hint
  if (Object.keys(lineMap).length === 0 && !currentAtStep) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-neon-cyan shadow-[0_0_6px_#00E5FF]" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Control Flow
          </h3>
        </div>
        {loopLines.length > 0 && (
          <span className="font-mono text-[10px] text-zinc-600">
            {loopLines.length} loop{loopLines.length !== 1 ? 's' : ''} active
          </span>
        )}
      </div>

      <div className="p-2 space-y-2">
        {/* Currently-active branch — the most prominent display */}
        {currentAtStep && <CurrentEventCard event={currentAtStep} />}

        {/* Loop iteration counters */}
        {loopLines.length > 0 && (
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-2">
            <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Loop Iterations
            </div>
            <ul className="space-y-1">
              {loopLines.map(([lineStr, count]) => {
                const line = Number(lineStr);
                const node = lineMap[line];
                if (!node) return null;
                return (
                  <li
                    key={line}
                    className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-white/[0.02]"
                  >
                    <span className="flex h-4 min-w-4 items-center justify-center rounded bg-neon-cyan/15 px-1 font-mono text-[9px] font-bold text-neon-cyan tabular-nums">
                      {count}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      L{line}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-300 truncate flex-1">
                      {node.kind === 'for' || node.kind === 'while' || node.kind === 'do-while'
                        ? node.condition
                        : `${node.kind}: ${node.condition}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Recent decision history */}
        {recentEvents.length > 0 && (
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.015] p-2">
            <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Recent Decisions
            </div>
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {recentEvents.slice().reverse().slice(0, 12).map((e, i) => (
                <DecisionRow
                  key={`${e.stepIndex}-${i}`}
                  event={e.event}
                  isCurrent={e.stepIndex === index}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function CurrentEventCard({ event }: { event: ControlEvent }) {
  if (event.kind === 'condition') {
    const { taken, condition, controlKind, iteration } = event;
    const isLoop = controlKind === 'while' || controlKind === 'for' || controlKind === 'do-while';

    return (
      <div
        className={cn(
          'rounded-lg border p-2.5 transition-all',
          taken
            ? 'border-neon-green/40 bg-gradient-to-br from-neon-green/[0.08] to-transparent shadow-[0_0_18px_rgba(57,255,20,0.15)]'
            : 'border-zinc-700/40 bg-gradient-to-br from-zinc-700/[0.06] to-transparent'
        )}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider',
                taken
                  ? 'bg-neon-green/15 text-neon-green'
                  : 'bg-zinc-700/30 text-zinc-400'
              )}
            >
              {taken ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              )}
              {taken ? 'true' : 'false'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {controlKind === 'else-if' ? 'else if' : controlKind}
            </span>
            {isLoop && iteration !== undefined && (
              <span className="rounded bg-neon-cyan/10 px-1.5 py-0.5 font-mono text-[9px] text-neon-cyan">
                iter {iteration}
              </span>
            )}
          </div>
        </div>
        <div className="font-mono text-xs text-zinc-200 break-all">
          <span className="text-zinc-600">{controlKind === 'while' || controlKind === 'do-while' ? 'while ' : controlKind === 'for' ? 'for ' : 'if '}</span>
          <span className={taken ? 'text-neon-green' : 'text-zinc-400'}>
            ({condition})
          </span>
        </div>
        <div className="mt-1.5 text-[10px] text-zinc-600">
          {taken
            ? isLoop
              ? '→ entering loop body'
              : '→ entering then-branch'
            : isLoop
              ? '→ exiting loop'
              : '→ skipping to else / next statement'}
        </div>
      </div>
    );
  }

  if (event.kind === 'iteration') {
    return (
      <div className="rounded-lg border border-neon-cyan/30 bg-gradient-to-br from-neon-cyan/[0.06] to-transparent p-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="rounded bg-neon-cyan/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-neon-cyan">
            iter {event.iteration}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {event.controlKind}
          </span>
        </div>
        <div className="font-mono text-xs text-neon-cyan break-all">
          {event.condition}
        </div>
      </div>
    );
  }

  return null;
}

function DecisionRow({
  event,
  isCurrent,
}: {
  event: ControlEvent;
  isCurrent: boolean;
}) {
  if (event.kind === 'condition') {
    return (
      <li
        className={cn(
          'flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[10px]',
          isCurrent && 'bg-white/[0.04]'
        )}
      >
        <span
          className={cn(
            'flex h-3 w-3 flex-shrink-0 items-center justify-center rounded',
            event.taken
              ? 'bg-neon-green/15 text-neon-green'
              : 'bg-zinc-700/40 text-zinc-500'
          )}
        >
          {event.taken ? (
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className="text-zinc-600 tabular-nums">L{event.line}</span>
        <span className={cn('truncate flex-1', event.taken ? 'text-zinc-200' : 'text-zinc-500')}>
          {event.condition}
        </span>
        {event.iteration !== undefined && (
          <span className="text-[9px] text-zinc-600">#{event.iteration}</span>
        )}
      </li>
    );
  }

  if (event.kind === 'iteration') {
    return (
      <li
        className={cn(
          'flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[10px]',
          isCurrent && 'bg-white/[0.04]'
        )}
      >
        <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded bg-neon-cyan/15 text-[8px] font-bold text-neon-cyan">
          ↻
        </span>
        <span className="text-zinc-600 tabular-nums">L{event.line}</span>
        <span className="truncate flex-1 text-zinc-300">{event.condition}</span>
        <span className="text-[9px] text-zinc-600">#{event.iteration}</span>
      </li>
    );
  }

  return null;
}
