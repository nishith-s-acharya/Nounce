'use client';

import type { Scope, HeapValue } from '@/lib/executor/types';
import { cn, formatPrimitive } from '@/lib/utils';
import { useVisualizerStore } from '@/store/visualizerStore';

interface Props {
  scopes: Scope[];
  changedVars: string[];
}

export function StackFrames({ scopes, changedVars }: Props) {
  const changedSet = new Set(changedVars);
  const hoveredVariable = useVisualizerStore((s) => s.hoveredVariable);
  const setHoveredVariable = useVisualizerStore((s) => s.setHoveredVariable);
  const setHoveredHeapId = useVisualizerStore((s) => s.setHoveredHeapId);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-neon-green shadow-[0_0_6px_#39FF14]" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Stack Frames
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">
          {scopes.length} scope{scopes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-2 space-y-2">
        {scopes.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs italic text-zinc-600">
            no active scopes
          </div>
        ) : (
          scopes.map((scope, i) => (
            <ScopeBlock
              key={i}
              scope={scope}
              changedSet={changedSet}
              hoveredVariable={hoveredVariable}
              onHover={(name, ref) => {
                setHoveredVariable(name);
                setHoveredHeapId(ref);
              }}
              onLeave={() => {
                setHoveredVariable(null);
                setHoveredHeapId(null);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ScopeBlock({
  scope,
  changedSet,
  hoveredVariable,
  onHover,
  onLeave,
}: {
  scope: Scope;
  changedSet: Set<string>;
  hoveredVariable: string | null;
  onHover: (name: string, refId: string | null) => void;
  onLeave: () => void;
}) {
  const entries = Object.entries(scope.bindings);

  return (
    <div className="rounded-lg border border-white/[0.04] bg-gradient-to-br from-white/[0.02] to-transparent overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-2.5 py-1.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
          {scope.type}
        </span>
        {entries.length > 0 && (
          <span className="font-mono text-[9px] text-zinc-700">
            {entries.length}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-2 text-xs italic text-zinc-700">empty</div>
      ) : (
        <ul className="divide-y divide-white/[0.03]">
          {entries.map(([name, value]) => (
            <VariableRow
              key={name}
              name={name}
              value={value}
              isChanged={changedSet.has(name)}
              isHovered={hoveredVariable === name}
              onMouseEnter={() =>
                onHover(name, value.kind === 'ref' ? value.id : null)
              }
              onMouseLeave={onLeave}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function VariableRow({
  name,
  value,
  isChanged,
  isHovered,
  onMouseEnter,
  onMouseLeave,
}: {
  name: string;
  value: HeapValue;
  isChanged: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <li
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group relative flex items-center justify-between gap-2 px-3 py-2 transition-all duration-150 cursor-default',
        isChanged && 'bg-neon-green/[0.06]',
        isHovered && 'bg-white/[0.04]'
      )}
    >
      {isChanged && (
        <>
          <div className="absolute -left-px top-1/2 h-3/5 w-[2px] -translate-y-1/2 rounded-full bg-neon-green shadow-[0_0_8px_#39FF14] animate-pulse-neon" />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-neon-green/5 to-transparent" />
        </>
      )}
      {isHovered && !isChanged && (
        <div className="absolute -left-px top-1/2 h-3/5 w-[2px] -translate-y-1/2 rounded-full bg-neon-cyan shadow-[0_0_6px_#00E5FF]" />
      )}
      <span
        className={cn(
          'font-mono text-xs truncate transition-colors',
          isHovered ? 'text-white' : isChanged ? 'text-zinc-100' : 'text-zinc-300'
        )}
      >
        {name}
      </span>
      <ValuePill value={value} isHovered={isHovered} />
    </li>
  );
}

function ValuePill({
  value,
  isHovered,
}: {
  value: HeapValue;
  isHovered: boolean;
}) {
  if (value.kind === 'primitive') {
    const v = value.value;
    let cls = 'text-zinc-500';
    if (typeof v === 'string') cls = 'text-neon-green';
    else if (typeof v === 'number') cls = 'text-neon-cyan';
    else if (typeof v === 'boolean') cls = 'text-neon-amber';

    return (
      <span
        className={cn(
          'flex-shrink-0 font-mono text-[11px] tabular-nums',
          cls
        )}
      >
        {formatPrimitive(v)}
      </span>
    );
  }

  return (
    <span
      data-heap-ref={value.id}
      className={cn(
        'flex-shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-all',
        isHovered
          ? 'border-neon-cyan/60 bg-neon-cyan/[0.12] text-neon-cyan shadow-[0_0_10px_rgba(0,229,255,0.3)]'
          : 'border-neon-pink/30 bg-neon-pink/[0.06] text-neon-pink'
      )}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 L22 12 L12 22 L10 20 L16.5 13.5 L2 13.5 L2 10.5 L16.5 10.5 L10 4 Z" />
      </svg>
      ref
    </span>
  );
}
