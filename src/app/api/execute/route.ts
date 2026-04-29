import { NextResponse } from 'next/server';
import { executeCode } from '@/lib/executor';
import type { ExecuteResponse, Language } from '@/lib/executor/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_CODE_BYTES = 50_000;
const VALID_LANGUAGES: ReadonlySet<Language> = new Set<Language>([
  'javascript',
  'java',
]);

export async function POST(req: Request): Promise<NextResponse<ExecuteResponse>> {
  let code: string;
  let language: Language;

  try {
    const body = (await req.json()) as { code?: unknown; language?: unknown };

    if (typeof body?.code !== 'string') {
      return NextResponse.json(
        { trace: [], error: { message: 'Field "code" must be a string' } },
        { status: 400 }
      );
    }
    code = body.code;

    const lang = (body.language ?? 'javascript') as Language;
    if (!VALID_LANGUAGES.has(lang)) {
      return NextResponse.json(
        {
          trace: [],
          error: {
            message: `Unsupported language: ${String(lang)}. Supported: ${[...VALID_LANGUAGES].join(', ')}`,
          },
        },
        { status: 400 }
      );
    }
    language = lang;
  } catch {
    return NextResponse.json(
      { trace: [], error: { message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  if (code.length === 0) {
    return NextResponse.json(
      { trace: [], error: { message: 'Code is empty' } },
      { status: 400 }
    );
  }

  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    return NextResponse.json(
      {
        trace: [],
        error: { message: `Code exceeds ${MAX_CODE_BYTES} bytes` },
      },
      { status: 413 }
    );
  }

  const start = Date.now();
  try {
    const result = await executeCode(code, language, {
      timeoutMs: language === 'java' ? 10000 : 5000,
      maxSteps: 5000,
      maxHeapObjects: 1000,
      maxStringLength: 200,
    });
    return NextResponse.json({
      ...result,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      {
        trace: [],
        error: {
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
