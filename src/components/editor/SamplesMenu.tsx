'use client';

import { useEffect, useRef, useState } from 'react';
import { useVisualizerStore } from '@/store/visualizerStore';
import { SAMPLES } from '@/lib/samples';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  basics: 'Basics',
  recursion: 'Recursion',
  sorting: 'Sorting',
  'data-structures': 'Data Structures',
  algorithms: 'Algorithms',
};

export function SamplesMenu() {
  const language = useVisualizerStore((s) => s.language);
  const loadSample = useVisualizerStore((s) => s.loadSample);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const samples = SAMPLES[language] ?? [];
  const grouped = samples.reduce<Record<string, typeof samples>>((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-zinc-100',
          open && 'border-white/[0.15] bg-white/[0.05] text-zinc-100'
        )}
        title="Load sample program"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Samples
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={cn('transition-transform', open && 'rotate-180')}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/[0.08] bg-midnight-elev/95 shadow-2xl backdrop-blur-xl">
          <div className="max-h-[28rem] overflow-y-auto p-1">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-1 last:mb-0">
                <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
                  {CATEGORY_LABELS[category] ?? category}
                </div>
                <ul>
                  {items.map((sample) => (
                    <li key={sample.id}>
                      <button
                        onClick={() => {
                          loadSample(language, sample.code);
                          setOpen(false);
                        }}
                        className="group/item w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-zinc-200 group-hover/item:text-white">
                            {sample.title}
                          </span>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="flex-shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover/item:opacity-100"
                          >
                            <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {sample.description}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/[0.05] bg-black/20 px-3 py-1.5">
            <p className="text-[10px] text-zinc-600">
              Loading a sample replaces current code
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
