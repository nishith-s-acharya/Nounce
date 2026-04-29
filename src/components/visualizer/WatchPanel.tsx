'use client';

import { useMemo, useState } from 'react';
import { useVisualizerStore, evalWatch } from '@/store/visualizerStore';
import { cn } from '@/lib/utils';

export function WatchPanel() {
  const trace = useVisualizerStore((s) => s.trace);
  const index = useVisualizerStore((s) => s.index);
  const watches = useVisualizerStore((s) => s.watches);
  const addWatch = useVisualizerStore((s) => s.addWatch);
  const removeWatch = useVisualizerStore((s) => s.removeWatch);
  const jumpTo = useVisualizerStore((s) => s.jumpTo);

  const [input, setInput] = useState('');

  const step = trace[index] ?? null;

  if (watches.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-neon-amber shadow-[0_0_6px_#FFB400]" />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              Watch
            </h3>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              addWatch(input.trim());
              setInput('');
            }
          }}
          className="p-2"
        >
          <div className="flex gap-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add expression… (e.g. arr, user.name)"
              className="flex-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-neon-amber/30 focus:outline-none focus:ring-1 focus:ring-neon-amber/20"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-md border border-neon-amber/25 bg-neon-amber/10 px-2 text-[11px] text-neon-amber hover:bg-neon-amber/20 disabled:opacity-30"
            >
              +
            </button>
          </div>
          <p className="mt-1.5 px-0.5 text-[10px] text-zinc-600">
            Pin a variable to track it across all steps
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-neon-amber shadow-[0_0_6px_#FFB400]" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Watch
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">
          {watches.length} expr
        </span>
      </div>

      <ul className="divide-y divide-white/[0.04]">
        {watches.map((w) => (
          <WatchRow
            key={w.id}
            expression={w.expression}
            onRemove={() => removeWatch(w.id)}
          />
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            addWatch(input.trim());
            setInput('');
          }
        }}
        className="border-t border-white/5 p-2"
      >
        <div className="flex gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add expression…"
            className="flex-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-neon-amber/30 focus:outline-none focus:ring-1 focus:ring-neon-amber/20"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-md border border-neon-amber/25 bg-neon-amber/10 px-2 text-[11px] text-neon-amber hover:bg-neon-amber/20 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </form>
    </div>
  );
}

function WatchRow({
  expression,
  onRemove,
}: {
  expression: string;
  onRemove: () => void;
}) {
  const trace = useVisualizerStore((s) => s.trace);
  const index = useVisualizerStore((s) => s.index);
  const jumpTo = useVisualizerStore((s) => s.jumpTo);

  const step = trace[index] ?? null;
  const current = useMemo(() => evalWatch(expression, step), [expression, step, index]);

  // Build a timeline of values across the whole trace
  const timeline = useMemo(() => {
    return trace.map((s) => evalWatch(expression, s));
  }, [trace, expression]);

  // Find indices where the value changed — useful for sparkline tick marks
  const changes = useMemo(() => {
    const out: number[] = [];
    let prev = '';
    timeline.forEach((t, i) => {
      if (t.found && t.value !== prev) {
        out.push(i);
        prev = t.value;
      }
    });
    return out;
  }, [timeline]);

  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-zinc-300 truncate">
          {expression}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              'font-mono text-[11px] tabular-nums truncate max-w-[14rem]',
              current.found ? 'text-neon-amber' : 'text-zinc-600'
            )}
          >
            {current.value}
          </span>
          <button
            onClick={onRemove}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"
            aria-label="Remove watch"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {timeline.length > 1 && (
        <button
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const targetIndex = Math.round((x / rect.width) * (timeline.length - 1));
            jumpTo(targetIndex);
          }}
          className="group/timeline mt-1.5 relative block h-3 w-full cursor-pointer"
          title="Click to jump to that step"
        >
          {/* Background track */}
          <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-white/[0.05]" />
          {/* Change ticks */}
          {changes.map((i) => (
            <div
              key={i}
              className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-neon-amber/40"
              style={{ left: `${(i / Math.max(1, timeline.length - 1)) * 100}%` }}
            />
          ))}
          {/* Current position */}
          <div
            className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-neon-amber shadow-[0_0_4px_#FFB400] pointer-events-none"
            style={{
              left: `${(index / Math.max(1, timeline.length - 1)) * 100}%`,
            }}
          />
        </button>
      )}
    </li>
  );
}
