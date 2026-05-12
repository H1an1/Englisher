import { NextResponse } from "next/server";
import { createPracticeSession } from "@/lib/practice-session";
import { createPracticeSessionFromYouTubeCaptions } from "@/lib/ytdlp-ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const session = await createPracticeSessionFromYouTubeCaptions(url);
    return NextResponse.json({ session, source: "youtube-captions" });
  } catch (error) {
    const fallbackSession = createPracticeSession(url);
    return NextResponse.json({
      session: fallbackSession,
      source: "fixture",
      warning: `Caption ingest unavailable, using demo fixture. ${formatError(error)}`
    });
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown ingest error.";
}
