'use client';

import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useMemo, useRef } from 'react';
import type { editor as monacoEditor } from 'monaco-editor';
import type { TraceStep, HeapValue, HeapObject } from '@/lib/executor/types';
import type { ControlEvent } from '@/lib/controlFlow';
import { formatPrimitive } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  language: 'javascript' | 'java';
  step: TraceStep | null;
  trace: TraceStep[];
  breakpoints: number[];
  /** Optional: control-flow event for the current step, drawn inline */
  controlEvent?: ControlEvent | null;
  onLineClick?: (line: number) => void;
  onToggleBreakpoint?: (line: number) => void;
  onDirty?: () => void;
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language,
  step,
  trace,
  breakpoints,
  controlEvent,
  onLineClick,
  onToggleBreakpoint,
  onDirty,
  readOnly,
}: Props) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const decorationsRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null);
  const inlineDecorationsRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null);
  const breakpointDecorationsRef = useRef<monacoEditor.IEditorDecorationsCollection | null>(null);
  const valueAtTraceTimeRef = useRef<string>(value);

  // Density per line (count of steps that hit each line)
  const lineDensity = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of trace) counts[t.line] = (counts[t.line] || 0) + 1;
    return counts;
  }, [trace]);

  const maxDensity = useMemo(
    () => Math.max(1, ...Object.values(lineDensity)),
    [lineDensity]
  );

  // Snapshot source at trace time
  useEffect(() => {
    if (trace.length > 0) valueAtTraceTimeRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace]);

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('midnight', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'FF2D95' },
        { token: 'string', foreground: '39FF14' },
        { token: 'number', foreground: '00E5FF' },
        { token: 'comment', foreground: '5A5A60', fontStyle: 'italic' },
        { token: 'identifier', foreground: 'E4E4E7' },
        { token: 'type', foreground: 'FFB400' },
      ],
      colors: {
        'editor.background': '#1C1C1E',
        'editor.foreground': '#E4E4E7',
        'editor.lineHighlightBackground': '#FFFFFF08',
        'editorLineNumber.foreground': '#3F3F46',
        'editorLineNumber.activeForeground': '#A1A1AA',
        'editorCursor.foreground': '#39FF14',
        'editor.selectionBackground': '#39FF1430',
        'editorIndentGuide.background': '#FFFFFF08',
        'editorIndentGuide.activeBackground': '#FFFFFF20',
        'editorGutter.background': '#1C1C1E',
      },
    });
    monaco.editor.setTheme('midnight');

    decorationsRef.current = ed.createDecorationsCollection();
    inlineDecorationsRef.current = ed.createDecorationsCollection();
    breakpointDecorationsRef.current = ed.createDecorationsCollection();

    // Gutter clicks: shift = toggle breakpoint, plain = jump to line
    ed.onMouseDown((e) => {
      const t = e.target.type;
      if (
        t === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
        t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      ) {
        const line = e.target.position?.lineNumber;
        if (!line) return;
        // Shift-click on line numbers, OR any click on glyph margin = breakpoint toggle
        if (
          t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          e.event.shiftKey
        ) {
          onToggleBreakpoint?.(line);
        } else {
          onLineClick?.(line);
        }
      }
    });
  };

  // Detect edits → mark stale
  useEffect(() => {
    if (trace.length > 0 && value !== valueAtTraceTimeRef.current) {
      onDirty?.();
    }
  }, [value, trace.length, onDirty]);

  // Active line + visited lines + density heatmap
  useEffect(() => {
    const monaco = monacoRef.current;
    const ed = editorRef.current;
    if (!monaco || !ed || !decorationsRef.current) return;

    const isDirty = trace.length > 0 && value !== valueAtTraceTimeRef.current;
    const decs: monacoEditor.IModelDeltaDecoration[] = [];

    // Visited lines with density-based opacity
    for (const [lineStr, count] of Object.entries(lineDensity)) {
      const line = Number(lineStr);
      const intensity = Math.min(1, count / maxDensity);
      const className = isDirty
        ? 'visited-line-glyph-stale'
        : intensity > 0.66
          ? 'visited-line-hot'
          : intensity > 0.33
            ? 'visited-line-warm'
            : 'visited-line-cool';
      decs.push({
        range: makeRange(line, line),
        options: {
          linesDecorationsClassName: className,
        },
      });
    }

    // Active line
    const activeLine = step?.line ?? null;
    if (activeLine != null && !isDirty) {
      decs.push({
        range: makeRange(activeLine, activeLine),
        options: {
          isWholeLine: true,
          className: 'active-line-neon',
          glyphMarginClassName: 'active-line-glyph',
          overviewRuler: {
            color: '#39FF14',
            position: monaco.editor.OverviewRulerLane.Full,
          },
          minimap: {
            color: '#39FF14',
            position: monaco.editor.MinimapPosition.Inline,
          },
        },
      });
    }

    decorationsRef.current.set(decs);

    if (activeLine != null && !isDirty) {
      ed.revealLineInCenterIfOutsideViewport(
        activeLine,
        monaco.editor.ScrollType.Smooth
      );
    }

    function makeRange(start: number, end: number) {
      return {
        startLineNumber: start,
        endLineNumber: end,
        startColumn: 1,
        endColumn: 1,
      };
    }
  }, [step, lineDensity, maxDensity, trace.length, value]);

  // Breakpoint decorations (separate so they don't get clobbered)
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !breakpointDecorationsRef.current) return;
    const decs: monacoEditor.IModelDeltaDecoration[] = breakpoints.map((line) => ({
      range: {
        startLineNumber: line,
        endLineNumber: line,
        startColumn: 1,
        endColumn: 1,
      },
      options: {
        glyphMarginClassName: 'breakpoint-glyph',
        overviewRuler: {
          color: '#FF2D95',
          position: monaco.editor.OverviewRulerLane.Left,
        },
      },
    }));
    breakpointDecorationsRef.current.set(decs);
  }, [breakpoints]);

  // Inline value hints + control flow hint
  useEffect(() => {
    const monaco = monacoRef.current;
    const ed = editorRef.current;
    if (!monaco || !ed || !inlineDecorationsRef.current) return;

    const isDirty = trace.length > 0 && value !== valueAtTraceTimeRef.current;
    if (!step || isDirty) {
      inlineDecorationsRef.current.clear();
      return;
    }

    const model = ed.getModel();
    if (!model) return;

    const vars: Array<{ name: string; valueText: string; isChanged: boolean }> = [];
    const changedSet = new Set(step.changedVars);
    for (const scope of step.scopes) {
      for (const [name, val] of Object.entries(scope.bindings)) {
        vars.push({
          name,
          valueText: stringifyValue(val, step.heap),
          isChanged: changedSet.has(name),
        });
      }
    }

    const lineCount = model.getLineCount();
    if (step.line > lineCount) {
      inlineDecorationsRef.current.clear();
      return;
    }
    const lineText = model.getLineContent(step.line);

    // Variable hints
    const varAnnotations: string[] = [];
    for (const v of vars) {
      const re = new RegExp(`\\b${escapeRegex(v.name)}\\b`);
      if (re.test(lineText)) {
        varAnnotations.push(
          `${v.isChanged ? '✦ ' : ''}${v.name} = ${v.valueText}`
        );
      }
    }

    // Branch hint — prepend with arrow + true/false badge
    const decs: monacoEditor.IModelDeltaDecoration[] = [];
    const lineLen = model.getLineMaxColumn(step.line);

    // Build annotation string
    const parts: string[] = [];
    if (controlEvent?.kind === 'condition') {
      const arrow = controlEvent.taken ? '✓ true' : '✗ false';
      const iter =
        controlEvent.iteration !== undefined
          ? ` · iter ${controlEvent.iteration}`
          : '';
      parts.push(`${arrow}${iter}`);
    } else if (controlEvent?.kind === 'iteration') {
      parts.push(`↻ iter ${controlEvent.iteration}`);
    }
    if (varAnnotations.length > 0) parts.push(varAnnotations.join('  ·  '));

    if (parts.length > 0) {
      const isCondition = controlEvent?.kind === 'condition';
      const taken = controlEvent?.kind === 'condition' && controlEvent.taken;
      const inlineClass = isCondition
        ? taken
          ? 'inline-hint-true'
          : 'inline-hint-false'
        : 'inline-value-hint';

      decs.push({
        range: {
          startLineNumber: step.line,
          endLineNumber: step.line,
          startColumn: lineLen,
          endColumn: lineLen,
        },
        options: {
          after: {
            content: '   ' + parts.join('  ·  '),
            inlineClassName: inlineClass,
          },
        },
      });
    }

    inlineDecorationsRef.current.set(decs);
  }, [step, trace.length, value, controlEvent]);

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      options={{
        readOnly,
        fontSize: 13,
        lineHeight: 22,
        fontFamily: 'JetBrains Mono, Menlo, monospace',
        fontLigatures: true,
        minimap: { enabled: true, scale: 1, renderCharacters: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        glyphMargin: true,
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: 'none',
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        lineNumbersMinChars: 3,
      }}
    />
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stringifyValue(
  v: HeapValue,
  heap: Record<string, HeapObject>
): string {
  if (v.kind === 'primitive') {
    return formatPrimitive(v.value);
  }
  const obj = heap[v.id];
  if (!obj) return `→ ?`;
  if (obj.kind === 'array') {
    if (obj.entries.length === 0) return '[]';
    const sample = obj.entries
      .slice(0, 4)
      .map((e) => (e.kind === 'primitive' ? formatPrimitive(e.value) : `→`))
      .join(', ');
    return `[${sample}${obj.entries.length > 4 ? ', …' : ''}]`;
  }
  if (obj.kind === 'object') {
    const keys = Object.keys(obj.entries);
    if (keys.length === 0) return '{}';
    const sample = keys
      .slice(0, 3)
      .map((k) => {
        const e = obj.entries[k];
        const val = e.kind === 'primitive' ? formatPrimitive(e.value) : '→';
        return `${k}: ${val}`;
      })
      .join(', ');
    return `{${sample}${keys.length > 3 ? ', …' : ''}}`;
  }
  return `ƒ ${obj.name}`;
}
