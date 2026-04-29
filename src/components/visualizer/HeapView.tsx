'use client';

import type { HeapObject, HeapValue } from '@/lib/executor/types';
import { cn, formatPrimitive } from '@/lib/utils';
import { useVisualizerStore } from '@/store/visualizerStore';

interface Props {
  heap: Record<string, HeapObject>;
  highlightIds?: Set<string>;
  prevHeap?: Record<string, HeapObject>;
}

export function HeapView({ heap, highlightIds, prevHeap }: Props) {
  const objects = Object.values(heap);
  const setHoveredHeapId = useVisualizerStore((s) => s.setHoveredHeapId);
  const togglePinnedHeap = useVisualizerStore((s) => s.togglePinnedHeap);
  const pinnedHeapId = useVisualizerStore((s) => s.pinnedHeapId);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-neon-pink shadow-[0_0_6px_#FF2D95]" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            Heap
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">
          {objects.length} object{objects.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-2 space-y-2">
        {objects.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs italic text-zinc-600">
            empty
          </div>
        ) : (
          objects.map((obj) => (
            <HeapObjectCard
              key={obj.id}
              obj={obj}
              isHighlighted={highlightIds?.has(obj.id) ?? false}
              isPinned={pinnedHeapId === obj.id}
              isNew={prevHeap !== undefined && !prevHeap[obj.id]}
              onMouseEnter={() => setHoveredHeapId(obj.id)}
              onMouseLeave={() => setHoveredHeapId(null)}
              onClick={() => togglePinnedHeap(obj.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HeapObjectCard({
  obj,
  isHighlighted,
  isPinned,
  isNew,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  obj: HeapObject;
  isHighlighted: boolean;
  isPinned: boolean;
  isNew: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const typeColor =
    obj.kind === 'array'
      ? 'cyan'
      : obj.kind === 'function'
        ? 'amber'
        : 'pink';

  const isActive = isHighlighted || isPinned;

  return (
    <div
      data-heap-id={obj.id}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className={cn(
        'relative rounded-lg border transition-all duration-300 cursor-pointer select-none',
        isActive
          ? typeColor === 'cyan'
            ? 'border-neon-cyan/50 bg-gradient-to-br from-neon-cyan/[0.10] to-transparent shadow-[0_0_24px_rgba(0,229,255,0.18)]'
            : typeColor === 'amber'
              ? 'border-neon-amber/50 bg-gradient-to-br from-neon-amber/[0.10] to-transparent shadow-[0_0_24px_rgba(255,180,0,0.18)]'
              : 'border-neon-pink/50 bg-gradient-to-br from-neon-pink/[0.10] to-transparent shadow-[0_0_24px_rgba(255,45,149,0.18)]'
          : 'border-white/[0.05] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]',
        isNew && 'animate-pulse-once'
      )}
    >
      {isPinned && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-neon-cyan text-midnight-deep shadow-[0_0_8px_rgba(0,229,255,0.5)]">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
        </div>
      )}

      <div
        className={cn(
          'flex items-center justify-between border-b px-2.5 py-1.5',
          isActive
            ? typeColor === 'cyan'
              ? 'border-neon-cyan/15'
              : typeColor === 'amber'
                ? 'border-neon-amber/15'
                : 'border-neon-pink/15'
            : 'border-white/[0.04]'
        )}
      >
        <div className="flex items-center gap-2">
          <TypeBadge kind={obj.kind} />
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            {obj.kind}
            {obj.kind === 'array' && (
              <span className="ml-1 text-zinc-600">({obj.entries.length})</span>
            )}
            {obj.kind === 'object' && (
              <span className="ml-1 text-zinc-600">
                ({Object.keys(obj.entries).length})
              </span>
            )}
          </span>
        </div>
        <span className="font-mono text-[9px] text-zinc-700">
          @{obj.id.slice(-4)}
        </span>
      </div>

      <div className="p-2">
        {obj.kind === 'array' && <ArrayBody entries={obj.entries} />}
        {obj.kind === 'object' && <ObjectBody entries={obj.entries} />}
        {obj.kind === 'function' && (
          <div className="px-1 py-0.5 font-mono text-[11px] text-neon-amber">
            <span className="text-zinc-500">ƒ </span>
            {obj.name}
          </div>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ kind }: { kind: 'array' | 'object' | 'function' }) {
  if (kind === 'array') {
    return (
      <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-neon-cyan/15">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="text-neon-cyan">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }
  if (kind === 'object') {
    return (
      <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-neon-pink/15">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="text-neon-pink">
          <path d="M8 3 L4 3 L4 21 L8 21 M16 3 L20 3 L20 21 L16 21" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-neon-amber/15">
      <span className="font-serif text-[10px] italic text-neon-amber leading-none">ƒ</span>
    </div>
  );
}

function ArrayBody({ entries }: { entries: HeapValue[] }) {
  if (entries.length === 0) {
    return <span className="px-1 text-xs italic text-zinc-700">[]</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((v, i) => (
        <ArrayCell key={i} index={i} value={v} />
      ))}
    </div>
  );
}

function ArrayCell({ index, value }: { index: number; value: HeapValue }) {
  return (
    <div
      data-heap-ref={value.kind === 'ref' ? value.id : undefined}
      className="group/cell flex flex-col items-center overflow-hidden rounded-md border border-white/[0.06] bg-midnight-deep transition-all hover:border-white/15"
    >
      <div className="bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] text-zinc-600">
        {index}
      </div>
      <div className="px-2 py-1 min-w-[2rem] text-center">
        <InlineValue value={value} />
      </div>
    </div>
  );
}

function ObjectBody({ entries }: { entries: Record<string, HeapValue> }) {
  const keys = Object.keys(entries);
  if (keys.length === 0) {
    return <span className="px-1 text-xs italic text-zinc-700">{'{}'}</span>;
  }
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => (
        <li
          key={k}
          data-heap-ref={entries[k].kind === 'ref' ? entries[k].id : undefined}
          className="group/row flex items-center justify-between gap-2 rounded px-1.5 py-0.5 transition-colors hover:bg-white/[0.02]"
        >
          <span className="font-mono text-[11px] text-zinc-400">
            <span className="text-zinc-600">.</span>
            {k}
          </span>
          <InlineValue value={entries[k]} />
        </li>
      ))}
    </ul>
  );
}

function InlineValue({ value }: { value: HeapValue }) {
  if (value.kind === 'primitive') {
    const v = value.value;
    let cls = 'text-zinc-500';
    if (typeof v === 'string') cls = 'text-neon-green';
    else if (typeof v === 'number') cls = 'text-neon-cyan';
    else if (typeof v === 'boolean') cls = 'text-neon-amber';
    return (
      <span className={cn('font-mono text-[11px] tabular-nums', cls)}>
        {formatPrimitive(v)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-neon-pink">
      <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 L22 12 L12 22 L10 20 L16.5 13.5 L2 13.5 L2 10.5 L16.5 10.5 L10 4 Z" />
      </svg>
      <span className="opacity-70">@{value.id.slice(-4)}</span>
    </span>
  );
}
