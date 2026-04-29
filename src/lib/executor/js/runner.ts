/**
 * Parent-side executor. Spawns the trace worker as a forked child process,
 * enforces a wall-clock timeout, and resolves with the captured trace.
 *
 * The worker is compiled to dist/worker/worker.js by `npm run build:worker`.
 * In dev we fall back to using `tsx`/`ts-node` if the compiled file is missing.
 */

import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { ExecuteResponse, ExecutorOptions } from '../types';

const DEFAULT_OPTS: ExecutorOptions = {
  timeoutMs: 5000,
  maxSteps: 5000,
  maxHeapObjects: 1000,
  maxStringLength: 200,
};

function resolveWorkerEntry(): { path: string; useTsx: boolean } {
  const compiled = path.join(process.cwd(), 'dist/worker/js/worker.js');
  if (fs.existsSync(compiled)) return { path: compiled, useTsx: false };

  // Dev fallback — requires `tsx` to be installed (npm i -D tsx)
  const tsSource = path.join(process.cwd(), 'src/lib/executor/js/worker.ts');
  return { path: tsSource, useTsx: true };
}

export function executeJavaScript(
  code: string,
  overrides: Partial<ExecutorOptions> = {}
): Promise<ExecuteResponse> {
  const opts: ExecutorOptions = { ...DEFAULT_OPTS, ...overrides };
  const entry = resolveWorkerEntry();

  return new Promise<ExecuteResponse>((resolve) => {
    const execArgv: string[] = ['--max-old-space-size=128'];
    if (entry.useTsx) {
      // Use tsx loader so we can run the .ts worker directly in dev
      execArgv.push('--import', 'tsx');
    }

    let child: ChildProcess;
    try {
      child = fork(entry.path, [], {
        execArgv,
        env: {
          // Strip user env — pass only what's needed
          NODE_ENV: process.env.NODE_ENV ?? 'production',
          PATH: process.env.PATH ?? '',
        },
        silent: true,
        serialization: 'advanced',
        // Detach so we can kill the entire process group on timeout
        detached: false,
      });
    } catch (err) {
      resolve({
        trace: [],
        error: {
          message: `Failed to spawn worker: ${(err as Error).message}`,
        },
      });
      return;
    }

    let settled = false;
    const settle = (r: ExecuteResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (!child.killed) child.kill('SIGKILL');
      } catch {}
      resolve(r);
    };

    const timer = setTimeout(() => {
      settle({
        trace: [],
        error: { message: `Execution timed out after ${opts.timeoutMs}ms` },
      });
    }, opts.timeoutMs);

    child.on('message', (msg) => settle(msg as ExecuteResponse));
    child.on('error', (err) =>
      settle({ trace: [], error: { message: err.message } })
    );
    child.on('exit', (exitCode, signal) => {
      if (!settled) {
        settle({
          trace: [],
          error: {
            message: `Worker exited unexpectedly (code=${exitCode}, signal=${signal})`,
          },
        });
      }
    });

    // Capture stderr output for debugging — visible in server logs only.
    child.stderr?.on('data', (chunk: Buffer) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[worker stderr]', chunk.toString());
      }
    });

    child.send({ code, opts });
  });
}
