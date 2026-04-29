'use client';

import { useVisualizerStore } from '@/store/visualizerStore';
import { useTracePlayback } from '@/hooks/useTracePlayback';
import { cn } from '@/lib/utils';

export function PlaybackControls() {
  useTracePlayback();

  const trace = useVisualizerStore((s) => s.trace);
  const index = useVisualizerStore((s) => s.index);
  const isPlaying = useVisualizerStore((s) => s.isPlaying);
  const speedMs = useVisualizerStore((s) => s.speedMs);
  const language = useVisualizerStore((s) => s.language);
  const breakpoints = useVisualizerStore((s) => s.breakpoints[language]);

  const stepForward = useVisualizerStore((s) => s.stepForward);
  const stepBackward = useVisualizerStore((s) => s.stepBackward);
  const stepOver = useVisualizerStore((s) => s.stepOver);
  const stepOut = useVisualizerStore((s) => s.stepOut);
  const togglePlay = useVisualizerStore((s) => s.togglePlay);
  const jumpTo = useVisualizerStore((s) => s.jumpTo);
  const jumpToStart = useVisualizerStore((s) => s.jumpToStart);
  const jumpToEnd = useVisualizerStore((s) => s.jumpToEnd);
  const runToNextBreakpoint = useVisualizerStore((s) => s.runToNextBreakpoint);
  const setSpeed = useVisualizerStore((s) => s.setSpeed);

  const disabled = trace.length === 0;
  const max = Math.max(0, trace.length - 1);
  const progress = trace.length > 0 ? (index / max) * 100 : 0;
  const hasBreakpoints = breakpoints.length > 0;

  // Build breakpoint markers for the scrubber
  const breakpointMarks = trace
    .map((s, i) => ({ i, line: s.line }))
    .filter((s) => breakpoints.includes(s.line));

  return (
    <div className="border-t border-white/5 bg-gradient-to-b from-midnight-deep/40 to-midnight-deep/90 backdrop-blur-md">
      {/* Scrubber with breakpoint markers */}
      <div className="px-4 pt-3 pb-1">
        <div className="relative h-6">
          <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.05]" />
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-neon-green/70 via-neon-cyan/70 to-neon-pink/70 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />

          {/* Breakpoint marks */}
          {breakpointMarks.map((m) => (
            <div
              key={m.i}
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-neon-pink shadow-[0_0_4px_#FF2D95] pointer-events-none"
              style={{ left: `${(m.i / max) * 100}%` }}
              title={`Breakpoint at line ${m.line}`}
            />
          ))}

          {trace.length > 0 && trace.length <= 50 && (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
              {trace.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1.5 w-px transition-colors',
                    i <= index ? 'bg-white/30' : 'bg-white/10'
                  )}
                />
              ))}
            </div>
          )}

          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={index}
            disabled={disabled}
            onChange={(e) => jumpTo(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          {trace.length > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none transition-all"
              style={{ left: `${progress}%` }}
            >
              <div className="h-3 w-3 rounded-full bg-neon-green shadow-[0_0_10px_rgba(57,255,20,0.7)] ring-2 ring-midnight-deep" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <ControlButton
            onClick={jumpToStart}
            disabled={disabled || index === 0}
            title="Jump to start (Home)"
          >
            <Icon path="M19 20L9 12l10-8v16zM5 19V5h2v14H5z" />
          </ControlButton>

          <ControlButton
            onClick={() => runToNextBreakpoint('backward')}
            disabled={disabled}
            title={hasBreakpoints ? 'Previous breakpoint (Shift+F8)' : 'No breakpoints — jump to start'}
            accent={hasBreakpoints ? 'pink' : undefined}
          >
            <BreakpointBackIcon />
          </ControlButton>

          <ControlButton
            onClick={stepOut}
            disabled={disabled}
            title="Step out (Shift+←)"
          >
            <StepOutIcon />
          </ControlButton>

          <ControlButton
            onClick={stepBackward}
            disabled={disabled || index === 0}
            title="Step backward (←)"
          >
            <Icon path="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
          </ControlButton>

          <ControlButton
            onClick={togglePlay}
            disabled={disabled}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            primary
          >
            {isPlaying ? (
              <Icon path="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            ) : (
              <Icon path="M8 5v14l11-7L8 5z" />
            )}
          </ControlButton>

          <ControlButton
            onClick={stepForward}
            disabled={disabled || index >= max}
            title="Step forward (→)"
          >
            <Icon path="M13 6v12l8.5-6L13 6zm-.5 6L4 6v12l8.5-6z" />
          </ControlButton>

          <ControlButton
            onClick={stepOver}
            disabled={disabled}
            title="Step over (Shift+→)"
          >
            <StepOverIcon />
          </ControlButton>

          <ControlButton
            onClick={() => runToNextBreakpoint('forward')}
            disabled={disabled}
            title={hasBreakpoints ? 'Next breakpoint (F8)' : 'No breakpoints — jump to end'}
            accent={hasBreakpoints ? 'pink' : undefined}
          >
            <BreakpointForwardIcon />
          </ControlButton>

          <ControlButton
            onClick={jumpToEnd}
            disabled={disabled || index >= max}
            title="Jump to end (End)"
          >
            <Icon path="M5 4l10 8-10 8V4zm12 1v14h2V5h-2z" />
          </ControlButton>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-500">
            Speed
          </span>
          <div className="flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-white/[0.02] p-0.5">
            {[
              { ms: 1500, label: '0.25×' },
              { ms: 1000, label: '0.5×' },
              { ms: 600, label: '1×' },
              { ms: 300, label: '2×' },
              { ms: 120, label: '4×' },
            ].map(({ ms, label }) => (
              <button
                key={ms}
                onClick={() => setSpeed(ms)}
                disabled={disabled}
                className={cn(
                  'rounded px-2 py-0.5 font-mono text-[10px] transition-all disabled:opacity-30',
                  speedMs === ms
                    ? 'bg-neon-cyan/15 text-neon-cyan'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
  title,
  primary,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  primary?: boolean;
  accent?: 'pink';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'group flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed',
        primary
          ? 'border-neon-green/30 bg-gradient-to-br from-neon-green/15 to-neon-green/5 text-neon-green hover:from-neon-green/25 hover:to-neon-green/10 hover:shadow-[0_0_16px_rgba(57,255,20,0.25)] hover:scale-105 active:scale-95'
          : accent === 'pink'
            ? 'border-neon-pink/25 bg-neon-pink/5 text-neon-pink hover:border-neon-pink/40 hover:bg-neon-pink/10 hover:shadow-[0_0_10px_rgba(255,45,149,0.2)] active:scale-95'
            : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-zinc-100 active:scale-95'
      )}
    >
      <span className={cn('transition-transform', primary && 'group-hover:scale-110')}>
        {children}
      </span>
    </button>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d={path} />
    </svg>
  );
}

function StepOverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 14a9 9 0 0 1 16 0" strokeLinecap="round" />
      <path d="M19 14l-3-3M19 14l-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

function StepOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20V4" strokeLinecap="round" />
      <path d="M6 10l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BreakpointForwardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="12" r="3" fill="currentColor" />
      <path d="M12 12h8M16 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BreakpointBackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="12" r="3" fill="currentColor" />
      <path d="M12 12H4M8 8l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
