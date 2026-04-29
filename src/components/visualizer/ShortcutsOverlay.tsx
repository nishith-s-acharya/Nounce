'use client';

import { useEffect } from 'react';
import { useVisualizerStore } from '@/store/visualizerStore';

const SHORTCUTS = [
  { keys: ['⌘', 'Enter'], desc: 'Run / re-trace code', section: 'Execution' },
  { keys: ['Space'], desc: 'Play / pause', section: 'Playback' },
  { keys: ['→', 'or', 'L'], desc: 'Step forward', section: 'Playback' },
  { keys: ['←', 'or', 'H'], desc: 'Step backward', section: 'Playback' },
  { keys: ['Shift', '→'], desc: 'Step over', section: 'Playback' },
  { keys: ['Shift', '←'], desc: 'Step out', section: 'Playback' },
  { keys: ['F8'], desc: 'Run to next breakpoint', section: 'Playback' },
  { keys: ['Home'], desc: 'Jump to start', section: 'Playback' },
  { keys: ['End'], desc: 'Jump to end', section: 'Playback' },
  { keys: ['Click', 'gutter'], desc: 'Toggle breakpoint', section: 'Editor' },
  { keys: ['?'], desc: 'Toggle this help', section: 'General' },
  { keys: ['Esc'], desc: 'Close dialogs', section: 'General' },
];

export function ShortcutsOverlay() {
  const open = useVisualizerStore((s) => s.showShortcuts);
  const toggle = useVisualizerStore((s) => s.toggleShortcuts);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, toggle]);

  if (!open) return null;

  const sections = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
    (acc[s.section] = acc[s.section] || []).push(s);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={toggle}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-midnight-elev/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neon-green/10">
              <span className="font-mono text-xs font-bold text-neon-green">?</span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={toggle}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="mb-3 last:mb-0">
              <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
                {section}
              </div>
              <ul className="space-y-0.5">
                {items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/[0.02]"
                  >
                    <span className="text-xs text-zinc-300">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, j) =>
                        k === 'or' ? (
                          <span key={j} className="text-[9px] text-zinc-600 mx-0.5">or</span>
                        ) : (
                          <kbd
                            key={j}
                            className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-200"
                          >
                            {k}
                          </kbd>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.05] bg-black/20 px-5 py-2">
          <p className="text-[10px] text-zinc-600">
            Press{' '}
            <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1 font-mono">?</kbd>{' '}
            anytime to toggle
          </p>
        </div>
      </div>
    </div>
  );
}
