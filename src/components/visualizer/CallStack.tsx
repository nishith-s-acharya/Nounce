'use client';

import type { CallFrame } from '@/lib/executor/types';
import { cn } from '@/lib/utils';
import { useVisualizerStore } from '@/store/visualizerStore';

interface Props {
  frames: CallFrame[];
}

export function CallStack({ frames }: Props) {
  const jumpToLine = useVisualizerStore((s) => s.jumpToLine);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-neon-cyan shadow-[0_0_6px_#00E5FF]" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Call Stack
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">
          depth {frames.length}
        </span>
      </div>

      <div className="p-2">
        {frames.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs italic text-zinc-600">
            empty
          </div>
        ) : (
          <ul className="space-y-1">
            {frames.map((frame, i) => {
              const isCurrent = i === 0;
              return (
                <li
                  key={`${i}-${frame.functionName}-${frame.line}`}
                  style={{
                    marginLeft: `${Math.min(i * 8, 32)}px`,
                  }}
                >
                  <button
                    onClick={() => jumpToLine(frame.line)}
                    className={cn(
                      'group relative flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all duration-150 cursor-pointer',
                      isCurrent
                        ? 'border-neon-cyan/40 bg-gradient-to-r from-neon-cyan/[0.08] to-neon-cyan/[0.02] text-neon-cyan shadow-[0_0_16px_rgba(0,229,255,0.15)]'
                        : 'border-white/[0.04] bg-white/[0.015] text-zinc-400 hover:border-white/[0.10] hover:bg-white/[0.04] hover:text-zinc-200'
                    )}
                  >
                    {isCurrent && (
                      <div className="absolute -left-px top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-neon-cyan shadow-[0_0_6px_#00E5FF]" />
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold',
                          isCurrent
                            ? 'bg-neon-cyan/20 text-neon-cyan'
                            : 'bg-white/5 text-zinc-500'
                        )}
                      >
                        {frames.length - i}
                      </span>
                      <span className="truncate font-mono">
                        {frame.functionName}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'flex-shrink-0 font-mono text-[10px] tabular-nums',
                        isCurrent ? 'text-neon-cyan/70' : 'text-zinc-600'
                      )}
                    >
                      L{frame.line}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
