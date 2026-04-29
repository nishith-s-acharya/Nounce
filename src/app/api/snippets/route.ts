import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snippets = await prisma.snippet.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        language: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ snippets });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, snippets: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: unknown;
      code?: unknown;
      language?: unknown;
    };

    if (typeof body.title !== 'string' || typeof body.code !== 'string') {
      return NextResponse.json(
        { error: 'title and code are required strings' },
        { status: 400 }
      );
    }

    const snippet = await prisma.snippet.create({
      data: {
        title: body.title.slice(0, 200),
        code: body.code,
        language: typeof body.language === 'string' ? body.language : 'javascript',
      },
    });

    return NextResponse.json({ snippet });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
