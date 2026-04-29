/**
 * Java executor orchestrator.
 *
 * Workflow:
 *   1. Wrap user source in `class UserCode { public static void main(String[] args) { … } }`
 *      if it's bare statements; otherwise use it as-is.
 *   2. Write to a temp dir as UserCode.java.
 *   3. Compile with `javac -g`.
 *   4. Spawn the precompiled Tracer JVM (in dist/java) which uses JDI to
 *      launch a debuggee JVM running UserCode.main(), step through it, and
 *      write a TraceStep[] JSON to a known path.
 *   5. Read and return the JSON.
 *
 * The Tracer .class files are produced by `npm run build:java`. Don't ship
 * without running that build step — there is no fallback.
 */

import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm, access } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { ExecuteResponse, ExecutorOptions } from '../types';

const TRACER_DIR = path.join(process.cwd(), 'dist/java');

/** Heuristic: does the source already define a public class? */
function hasClassDeclaration(src: string): boolean {
  // Strip comments + strings to avoid false positives. Cheap regex is fine
  // since this is just to decide between two wrapping modes.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  return /\bclass\s+[A-Z]\w*/.test(stripped);
}

function extractClassName(src: string): string {
  // If user defined a public class, use its name; else default to UserCode.
  const m = /\bpublic\s+(?:final\s+)?class\s+([A-Z]\w*)/.exec(src);
  return m ? m[1] : 'UserCode';
}

function wrapIfNeeded(source: string): { wrapped: string; className: string } {
  if (hasClassDeclaration(source)) {
    return { wrapped: source, className: extractClassName(source) };
  }
  // Bare statements — wrap in a UserCode class with main()
  const wrapped = `import java.util.*;
public class UserCode {
    public static void main(String[] args) {
${source}
    }
}
`;
  return { wrapped, className: 'UserCode' };
}

export async function executeJava(
  rawCode: string,
  opts: ExecutorOptions
): Promise<ExecuteResponse> {
  // Verify Tracer was built
  try {
    await access(path.join(TRACER_DIR, 'Tracer.class'));
  } catch {
    return {
      trace: [],
      error: {
        message:
          'Java tracer is not built. Run `npm run build:java` to compile it.',
      },
    };
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'viz-java-'));
  const tracePath = path.join(dir, 'trace.json');

  try {
    const { wrapped, className } = wrapIfNeeded(rawCode);
    const sourcePath = path.join(dir, `${className}.java`);
    await writeFile(sourcePath, wrapped, 'utf8');

    // 1. Compile with -g so JDI can read line numbers and locals
    const compile = await runProcess(
      'javac',
      ['-g', '-d', dir, sourcePath],
      { timeoutMs: 15000 }
    );
    if (compile.exitCode !== 0) {
      return {
        trace: [],
        error: {
          message: cleanCompileError(compile.stderr, dir) || 'Compilation failed',
        },
      };
    }

    // 2. Spawn the Tracer with JDI-enabled JVM
    const tracerResult = await runProcess(
      'java',
      [
        '-cp', `${TRACER_DIR}`,
        // JDI's tools.jar is bundled in modern JDKs (jdk.jdi module)
        '--add-modules=jdk.jdi',
        'Tracer',
        className,
        dir,
        String(opts.maxSteps),
        String(opts.maxHeapObjects),
        String(opts.maxStringLength),
        tracePath,
      ],
      { timeoutMs: opts.timeoutMs }
    );

    if (tracerResult.timedOut) {
      const partial = await readTrace(tracePath);
      return partial ?? {
        trace: [],
        error: { message: `Execution timed out after ${opts.timeoutMs}ms` },
      };
    }

    const traceData = await readTrace(tracePath);
    if (!traceData) {
      return {
        trace: [],
        error: {
          message:
            'Java tracer produced no output. ' +
            (tracerResult.stderr ? `stderr: ${tracerResult.stderr.slice(0, 500)}` : ''),
        },
      };
    }
    return traceData;
  } catch (err) {
    return {
      trace: [],
      error: { message: (err as Error).message ?? 'Java executor error' },
    };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface RunOptions {
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: RunOptions
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
    }, opts.timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > 1_000_000) stdout = stdout.slice(-500_000);
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: stderr + '\n' + err.message, timedOut });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    child.stdin.end();
  });
}

async function readTrace(p: string): Promise<ExecuteResponse | null> {
  try {
    const raw = await readFile(p, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as ExecuteResponse;
  } catch {
    return null;
  }
}

function cleanCompileError(stderr: string, tmpDir: string): string {
  return stderr
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.replace(tmpDir + path.sep, '').replace(tmpDir + '/', ''))
    .slice(0, 12)
    .join('\n');
}
