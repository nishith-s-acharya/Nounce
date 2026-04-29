/**
 * Top-level executor dispatcher.
 *
 * Routes execution requests to the appropriate language-specific runner
 * based on the `language` field. Each runner returns the same TraceStep[]
 * shape, so the frontend visualizer renders them identically.
 *
 * Adding a new language: implement a runner returning Promise<ExecuteResponse>
 * and add a case below.
 */

import { executeJavaScript } from './js/runner';
import { executeJava } from './java/runner';
import { executeJavaRemote } from './java/piston-runner';
import type { ExecuteResponse, ExecutorOptions, Language } from './types';

const DEFAULT_OPTS: ExecutorOptions = {
  timeoutMs: 5000,
  maxSteps: 5000,
  maxHeapObjects: 1000,
  maxStringLength: 200,
};

/**
 * Check whether local JDK tooling is available.
 * Cached after first check so we don't stat the filesystem on every request.
 */
let _hasLocalJdk: boolean | null = null;
async function hasLocalJdk(): Promise<boolean> {
  if (_hasLocalJdk !== null) return _hasLocalJdk;
  try {
    const { access } = await import('fs/promises');
    const path = await import('path');
    await access(path.join(process.cwd(), 'dist/java/Tracer.class'));
    _hasLocalJdk = true;
  } catch {
    _hasLocalJdk = false;
  }
  return _hasLocalJdk;
}

export async function executeCode(
  code: string,
  language: Language,
  overrides: Partial<ExecutorOptions> = {}
): Promise<ExecuteResponse> {
  const opts: ExecutorOptions = { ...DEFAULT_OPTS, ...overrides };

  switch (language) {
    case 'javascript':
      return executeJavaScript(code, opts);
    case 'java': {
      // Java needs more time — JVM startup alone can be 500ms locally,
      // and remote APIs need network round-trip time
      const javaOpts = { ...opts, timeoutMs: Math.max(opts.timeoutMs, 15000) };
      if (await hasLocalJdk()) {
        return executeJava(code, javaOpts);
      }
      // Fallback: use Piston API for remote execution (e.g. on Vercel)
      return executeJavaRemote(code, javaOpts);
    }
    default:
      return Promise.resolve({
        trace: [],
        error: { message: `Unsupported language: ${language}` },
      });
  }
}

export type { ExecuteResponse, Language } from './types';
