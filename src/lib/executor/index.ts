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
import type { ExecuteResponse, ExecutorOptions, Language } from './types';

const DEFAULT_OPTS: ExecutorOptions = {
  timeoutMs: 5000,
  maxSteps: 5000,
  maxHeapObjects: 1000,
  maxStringLength: 200,
};

export function executeCode(
  code: string,
  language: Language,
  overrides: Partial<ExecutorOptions> = {}
): Promise<ExecuteResponse> {
  const opts: ExecutorOptions = { ...DEFAULT_OPTS, ...overrides };

  switch (language) {
    case 'javascript':
      return executeJavaScript(code, opts);
    case 'java':
      // Java needs more time — JVM startup alone can be 500ms
      return executeJava(code, { ...opts, timeoutMs: Math.max(opts.timeoutMs, 10000) });
    default:
      return Promise.resolve({
        trace: [],
        error: { message: `Unsupported language: ${language}` },
      });
  }
}

export type { ExecuteResponse, Language } from './types';
