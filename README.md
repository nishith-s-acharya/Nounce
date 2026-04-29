# Code Visualizer

Interactive step-by-step visualizer for **JavaScript and Java**. Paste code → see the call stack, scopes, heap, and pointer arrows update at every step. Like a debugger, but built for understanding rather than fixing bugs.

## Features

**Control flow visualization** ✨ *new*
- Detects every `if`/`else if`/`while`/`for`/`for…of`/`do…while` in your source
- At each step, shows whether the condition evaluated **true** or **false**
- Inline editor hints display `✓ true · iter 3` or `✗ false` next to the active conditional
- Live iteration counters per loop (which iteration of which loop are you in?)
- "Recent decisions" history — scroll back to see the last 12 branch outcomes
- Powered by Acorn AST parsing for JS; regex-based detection for Java

**Tracing & playback**
- Forward / backward stepping with proper debugger semantics: **Step Into**, **Step Over**, **Step Out**
- **Breakpoints** — click in the gutter to set them, F8 to run-to-next
- **Watch expressions** — pin variables to track values across the whole trace; click on any past value to jump to that step
- **Step density heatmap** in the gutter shows which lines were hit most often
- Auto-play with adjustable speed (0.25× to 4×)
- Backwards execution — scrub the timeline freely

**Editor**
- Monaco with syntax highlighting for both languages
- Active-line glow indicator that scrolls smoothly to follow execution
- Inline value hints — current variable values appear next to the active line
- Stale-trace detection — banner appears when the code differs from what was traced
- Visited-line markers in the minimap

**Memory model visualization**
- Two-column Stack ↔ Heap layout
- **Curved SVG pointer arrows** physically connect variables to their heap targets
- Hover a variable → its heap target lights up + arrow glows
- Click a heap card to pin it
- Type-aware rendering: arrays as numbered cells, objects as key/value rows
- Mutations animate with a green pulse

**Sample programs library**
- 8 JS samples: fibonacci, factorial, bubble sort, two-pointer sum, linked list reverse, closure counter, binary search, hashmap word count
- 6 Java samples: fibonacci, bubble sort, ArrayList ops, binary search, factorial, HashMap word count
- One click loads them; they're tested to trace cleanly

**Shortcuts** (press `?` for the full list)
- `⌘/Ctrl+Enter` — run / re-trace
- `Space` — play / pause
- `→` / `←` — step forward / back
- `Shift+→` / `Shift+←` — step over / step out
- `F8` — run to next breakpoint
- `Home` / `End` — jump to start / end
- Arrow keys, `H`/`L` for vim-style navigation

**Persistence**
- Source code, language choice, breakpoints, watches, and split-pane layout persist across sessions via localStorage
- Refresh-safe

## Architecture

```
            ┌─────────────────┐
Browser ───►│  /api/execute   │
            │  { code, lang } │
            └────────┬────────┘
                     │
              ┌──────┴──────┐
              ▼             ▼
       ┌──────────┐    ┌──────────┐
       │ JS path  │    │ Java path│
       │ fork()   │    │ javac    │
       │ + vm     │    │   ↓      │
       │ + insp.  │    │ JDI VM   │
       └────┬─────┘    └────┬─────┘
            └──── trace ────┘
                  ▼
        Frontend stores trace[]
        in Zustand, scrubs locally
```

Both backends emit the same `TraceStep` JSON shape. JS uses Node `vm` + `inspector`; Java uses `javac` + a JDI tracer (`Tracer.java` in `src/lib/executor/java/`).

## Setup

```bash
npm install

# Database (required for snippet save/share)
cp .env.example .env  # edit DATABASE_URL
npx prisma generate
npx prisma migrate dev --name init

# Dev (auto-builds the JS worker via predev hook)
npm run dev

# For Java support, also build the tracer once
npm run build:java
```

Open http://localhost:3000.

## Production

```bash
npm run build       # builds worker + Java tracer + Next.js
npm run start
```

## Sandboxing notes

The forked Node child + spawned JVM are **not** sufficient sandboxing for a public deployment. Before exposing this externally:

1. Run runners inside containers (Docker + non-root + read-only fs + `--network=none`)
2. For real isolation: gVisor or Firecracker
3. Per-IP rate limiting on `/api/execute` (Redis)
4. Apply seccomp/AppArmor profiles

## Folder Structure

```
src/
├── app/
│   ├── api/execute/route.ts         ← POST { code, language } → trace
│   ├── api/snippets/                ← Prisma-backed CRUD
│   ├── layout.tsx, page.tsx, globals.css
├── components/
│   ├── editor/
│   │   ├── CodeEditor.tsx           ← Monaco + breakpoints + density heatmap
│   │   ├── LanguageToggle.tsx
│   │   └── SamplesMenu.tsx
│   ├── layout/SplitPane.tsx         ← shell + global keyboard shortcuts
│   └── visualizer/
│       ├── VisualizerPane.tsx
│       ├── CallStack.tsx
│       ├── StackFrames.tsx
│       ├── HeapView.tsx
│       ├── PointerArrows.tsx
│       ├── PlaybackControls.tsx     ← step over/into/out, breakpoint nav
│       ├── WatchPanel.tsx           ← watch expressions w/ timeline
│       └── ShortcutsOverlay.tsx     ← ? to open
├── hooks/{useExecution,useTracePlayback}.ts
├── lib/
│   ├── prisma.ts, utils.ts
│   ├── samples.ts                   ← curated sample programs
│   └── executor/
│       ├── index.ts                 ← language dispatcher
│       ├── types.ts                 ← shared TraceStep shape
│       ├── js/                      ← Node vm + inspector tracer
│       └── java/                    ← JDI tracer
└── store/visualizerStore.ts         ← Zustand store w/ persistence
```

## Known constraints

- **Async JS**: `setTimeout`, Promises only trace synchronous boundaries cleanly. Full async tracing would require a Babel statement-instrumentation pass.
- **Java threads**: tracer follows main thread only.
- **Step count cap**: 5000 steps per execution. Tight loops will hit this.
- **Watch expressions**: simple dot-paths only (e.g. `user.name`), not full JS/Java expression eval.
