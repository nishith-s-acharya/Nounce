/**
 * Remote Java executor using the Piston API.
 *
 * Used as a fallback when the local JDK is not available (e.g. on Vercel).
 * Piston (https://github.com/engineer-man/piston) is a free, open-source
 * code execution engine. We use the public instance at emkc.org.
 *
 * Limitations vs the JDI tracer:
 *  - No step-by-step tracing (only final output)
 *  - No heap/scope inspection
 *  - Produces a minimal single-step trace with stdout
 */

import type { ExecuteResponse, ExecutorOptions } from '../types';

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';

interface PistonResponse {
  run: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number | null;
  };
}

/** Heuristic: does the source already define a public class? */
function hasClassDeclaration(src: string): boolean {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  return /\bclass\s+[A-Z]\w*/.test(stripped);
}

function wrapIfNeeded(source: string): string {
  if (hasClassDeclaration(source)) return source;
  return `import java.util.*;
public class Main {
    public static void main(String[] args) {
${source}
    }
}
`;
}

export async function executeJavaRemote(
  rawCode: string,
  opts: ExecutorOptions
): Promise<ExecuteResponse> {
  const code = wrapIfNeeded(rawCode);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    const res = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'java',
        version: '15.0.2',
        files: [{ name: 'Main.java', content: code }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        trace: [],
        error: {
          message: `Piston API error (${res.status}): ${text.slice(0, 300)}`,
        },
      };
    }

    const data = (await res.json()) as PistonResponse;

    // Check for compilation errors
    if (data.compile && data.compile.code !== 0 && data.compile.stderr) {
      return {
        trace: [],
        error: {
          message: data.compile.stderr.slice(0, 1000),
        },
      };
    }

    // Check for runtime errors
    if (data.run.stderr && data.run.code !== 0) {
      // Try to extract line number from stack trace
      const lineMatch = /\.java:(\d+)/.exec(data.run.stderr);
      return {
        trace: buildMinimalTrace(data.run.stdout, code),
        error: {
          message: data.run.stderr.slice(0, 1000),
          line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
        },
      };
    }

    return {
      trace: buildMinimalTrace(data.run.stdout, code),
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return {
        trace: [],
        error: { message: `Execution timed out after ${opts.timeoutMs}ms` },
      };
    }
    return {
      trace: [],
      error: {
        message: `Remote Java execution failed: ${(err as Error).message}`,
      },
    };
  }
}

/**
 * Build a minimal trace from the program output.
 *
 * Since we can't do step-by-step tracing remotely, we create a single-step
 * trace that shows the final state with stdout. This lets the visualizer
 * at least display the output.
 */
function buildMinimalTrace(stdout: string, code: string) {
  const lines = code.split('\n');
  const lastLine = lines.length;

  return [
    {
      stepIndex: 0,
      line: 1,
      callStack: [{ functionName: 'main', line: 1 }],
      scopes: [],
      heap: {},
      changedVars: [],
      stdout: stdout || undefined,
    },
    {
      stepIndex: 1,
      line: lastLine,
      callStack: [{ functionName: 'main', line: lastLine }],
      scopes: [],
      heap: {},
      changedVars: [],
      stdout: stdout || undefined,
    },
  ];
}
