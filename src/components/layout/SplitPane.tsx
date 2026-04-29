'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useVisualizerStore } from '@/store/visualizerStore';
import { useExecution } from '@/hooks/useExecution';
import { analyzeControlFlow, inferEvent } from '@/lib/controlFlow';
import { PlaybackControls } from '@/components/visualizer/PlaybackControls';
import { VisualizerPane } from '@/components/visualizer/VisualizerPane';
import { ShortcutsOverlay } from '@/components/visualizer/ShortcutsOverlay';
import { LanguageToggle } from '@/components/editor/LanguageToggle';
import { SamplesMenu } from '@/components/editor/SamplesMenu';

const CodeEditor = dynamic(
  () => import('@/components/editor/CodeEditor').then((m) => m.CodeEditor),
  { ssr: false, loading: () => <EditorSkeleton /> }
);

export default function SplitPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // All state from store (persisted)
  const sources = useVisualizerStore((s) => s.sources);
  const setSource = useVisualizerStore((s) => s.setSource);
  const trace = useVisualizerStore((s) => s.trace);
  const index = useVisualizerStore((s) => s.index);
  const status = useVisualizerStore((s) => s.status);
  const errorMsg = useVisualizerStore((s) => s.errorMessage);
  const language = useVisualizerStore((s) => s.language);
  const splitPct = useVisualizerStore((s) => s.splitPct);
  const setSplitPct = useVisualizerStore((s) => s.setSplitPct);
  const breakpoints = useVisualizerStore((s) => s.breakpoints[language]);
  const toggleBreakpoint = useVisualizerStore((s) => s.toggleBreakpoint);

  const stepForward = useVisualizerStore((s) => s.stepForward);
  const stepBackward = useVisualizerStore((s) => s.stepBackward);
  const stepOver = useVisualizerStore((s) => s.stepOver);
  const stepOut = useVisualizerStore((s) => s.stepOut);
  const togglePlay = useVisualizerStore((s) => s.togglePlay);
  const jumpToLine = useVisualizerStore((s) => s.jumpToLine);
  const jumpToStart = useVisualizerStore((s) => s.jumpToStart);
  const jumpToEnd = useVisualizerStore((s) => s.jumpToEnd);
  const runToNextBreakpoint = useVisualizerStore((s) => s.runToNextBreakpoint);
  const markStale = useVisualizerStore((s) => s.markStale);
  const toggleShortcuts = useVisualizerStore((s) => s.toggleShortcuts);
  const { run } = useExecution();

  // Avoid hydration mismatch — render after first client mount
  useEffect(() => setHydrated(true), []);

  const code = sources[language];
  const setCode = (v: string) => setSource(language, v);
  const step = trace[index] ?? null;

  // Compute control flow info
  const lineMap = useMemo(
    () => analyzeControlFlow(code, language),
    [code, language]
  );
  const controlEvent = useMemo(() => {
    if (trace.length === 0) return null;
    return inferEvent(trace, index, lineMap);
  }, [trace, index, lineMap]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inEditor = target.closest('.monaco-editor');
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void run(code);
        return;
      }

      if (inInput && !inEditor) return;
      if (inEditor && !['F8'].includes(e.key)) return;

      switch (e.key) {
        case ' ':
          if (!inEditor) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case 'ArrowRight':
        case 'l':
          if (!inEditor) {
            e.preventDefault();
            if (e.shiftKey) stepOver();
            else stepForward();
          }
          break;
        case 'ArrowLeft':
        case 'h':
          if (!inEditor) {
            e.preventDefault();
            if (e.shiftKey) stepOut();
            else stepBackward();
          }
          break;
        case 'Home':
          if (!inEditor) {
            e.preventDefault();
            jumpToStart();
          }
          break;
        case 'End':
          if (!inEditor) {
            e.preventDefault();
            jumpToEnd();
          }
          break;
        case 'F8':
          e.preventDefault();
          runToNextBreakpoint(e.shiftKey ? 'backward' : 'forward');
          break;
        case '?':
          if (!inEditor && !inInput) {
            e.preventDefault();
            toggleShortcuts();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [code, run, stepForward, stepBackward, stepOver, stepOut, togglePlay,
       jumpToStart, jumpToEnd, runToNextBreakpoint, toggleShortcuts]);

  // Drag-to-resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(pct);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setSplitPct]);

  const isRunning = status === 'running';
  const langLabel = useMemo(
    () => (language === 'java' ? 'Java' : 'JavaScript'),
    [language]
  );

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-midnight">
        <div className="text-xs text-zinc-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-midnight text-zinc-100 granule">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="h-2 w-2 rounded-full bg-neon-green shadow-neon-green" />
            <h1 className="text-sm font-medium tracking-wide text-zinc-200">
              Code Visualizer
            </h1>
          </div>
          <span className="text-zinc-700">·</span>
          <span className="text-[11px] text-zinc-500 truncate">
            Step through {langLabel} execution
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <SamplesMenu />
          <LanguageToggle />
          <button
            onClick={toggleShortcuts}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
          >
            <span className="font-mono text-sm">?</span>
          </button>
          <button
            onClick={() => void run(code)}
            disabled={isRunning}
            className="flex items-center gap-1.5 rounded-md border border-neon-green/30 bg-neon-green/10 px-4 py-1.5 text-sm font-medium text-neon-green transition hover:bg-neon-green/20 hover:shadow-neon-green disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Tracing
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
                Run
                <kbd className="ml-1 hidden rounded border border-neon-green/20 bg-neon-green/5 px-1 font-mono text-[9px] text-neon-green/70 sm:inline">
                  ⌘↵
                </kbd>
              </>
            )}
          </button>
        </div>
      </header>

      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        <section
          style={{ width: `${splitPct}%` }}
          className="flex flex-col border-r border-white/5"
        >
          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
            step={step}
            trace={trace}
            breakpoints={breakpoints}
            controlEvent={controlEvent}
            onLineClick={jumpToLine}
            onToggleBreakpoint={toggleBreakpoint}
            onDirty={markStale}
          />
          {errorMsg && status !== 'stale' && (
            <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2 max-h-32 overflow-y-auto">
              <p className="font-mono text-xs text-red-300 whitespace-pre-wrap">
                ⚠ {errorMsg}
              </p>
            </div>
          )}
        </section>

        <div
          onMouseDown={() => {
            draggingRef.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="group relative w-px cursor-col-resize bg-white/5"
          aria-label="Resize panes"
          role="separator"
        >
          <div className="absolute inset-y-0 -left-1 -right-1 transition-colors group-hover:bg-neon-green/10" />
        </div>

        <section
          style={{ width: `${100 - splitPct}%` }}
          className="flex flex-col granule-soft"
        >
          <VisualizerPane />
          <PlaybackControls />
        </section>
      </div>

      <ShortcutsOverlay />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-midnight">
      <div className="text-xs text-zinc-500">Loading editor…</div>
    </div>
  );
}
