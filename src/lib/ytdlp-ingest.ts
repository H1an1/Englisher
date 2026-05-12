import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseVideoUrl, type PracticeSession } from "@/lib/practice-session";

const execFileAsync = promisify(execFile);
const CAPTION_LANGUAGES = "en,en-orig,en-US,en-GB,ai-en";
const MAX_CAPTION_LINES = 80;

export type CaptionLine = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

type NormalizeOptions = {
  automatic: boolean;
};

type YtdlpInfo = {
  title?: string;
};

type DownloadedCaptions = {
  automatic: boolean;
  content: string;
  extension: string;
};

type BuildSessionInput = {
  rawUrl: string;
  title: string;
  lines: CaptionLine[];
};

export async function createPracticeSessionFromYouTubeCaptions(rawUrl: string): Promise<PracticeSession> {
  const parsedVideo = parseVideoUrl(rawUrl);

  if (parsedVideo.platform !== "youtube" || !parsedVideo.videoId) {
    throw new Error("Only YouTube caption ingest is implemented in Englisher right now.");
  }

  const [info, captions] = await Promise.all([extractVideoInfo(rawUrl), downloadEnglishCaptions(rawUrl)]);
  const parsedLines = parseCaptionContent(captions.content, captions.extension);
  const lines = normalizeCaptionLines(parsedLines, { automatic: captions.automatic }).slice(0, MAX_CAPTION_LINES);

  if (lines.length === 0) {
    throw new Error("No usable English caption lines were found.");
  }

  return buildPracticeSessionFromCaptionLines({
    rawUrl,
    title: info.title?.trim() || "YouTube caption session",
    lines
  });
}

export function buildPracticeSessionFromCaptionLines({ rawUrl, title, lines }: BuildSessionInput): PracticeSession {
  const video = parseVideoUrl(rawUrl);
  const safeLines = lines.filter((line) => line.text.trim() && line.endMs > line.startMs);

  if (video.platform !== "youtube" || !video.videoId) {
    throw new Error("Caption-backed practice sessions require a valid YouTube URL.");
  }

  if (safeLines.length === 0) {
    throw new Error("Caption-backed practice sessions require at least one caption line.");
  }

  return {
    id: `captions-${video.videoId}`,
    status: "ready",
    title,
    createdAt: new Date().toISOString(),
    video,
    sentences: safeLines.map((line, index) => ({
      id: `caption-${index + 1}`,
      index,
      text: line.text,
      startMs: Math.round(line.startMs),
      endMs: Math.round(line.endMs)
    }))
  };
}

export function parseJson3Captions(content: string): CaptionLine[] {
  const data = JSON.parse(content) as {
    events?: Array<{
      tStartMs?: number;
      dDurationMs?: number;
      segs?: Array<{ utf8?: string }>;
    }>;
  };

  const events = data.events ?? [];
  const lines: CaptionLine[] = [];

  events.forEach((event, eventIndex) => {
    const startMs = event.tStartMs;
    const text = decodeCaptionText((event.segs ?? []).map((segment) => segment.utf8 ?? "").join(""));

    if (typeof startMs !== "number" || !text) {
      return;
    }

    const endMs = inferJson3EndMs(events, eventIndex);
    if (endMs <= startMs) {
      return;
    }

    lines.push({
      index: lines.length,
      startMs,
      endMs,
      text
    });
  });

  return lines;
}

export function normalizeCaptionLines(lines: CaptionLine[], options: NormalizeOptions): CaptionLine[] {
  let normalized = lines
    .map((line) => ({
      ...line,
      text: decodeCaptionText(line.text)
    }))
    .filter((line) => line.text && line.endMs > line.startMs);

  normalized = dedupeAdjacentLines(normalized);
  normalized = trimOverlappingCaptionEnds(normalized);

  if (options.automatic) {
    normalized = mergeFragmentedAutomaticCaptionLines(normalized);
  }

  return normalized.map((line, index) => ({
    ...line,
    index
  }));
}

async function extractVideoInfo(rawUrl: string): Promise<YtdlpInfo> {
  const { stdout } = await execYtdlp([
    "--dump-json",
    "--no-download",
    "--no-playlist",
    "--no-warnings",
    "--ignore-no-formats-error",
    rawUrl
  ]);

  return JSON.parse(stdout) as YtdlpInfo;
}

async function downloadEnglishCaptions(rawUrl: string): Promise<DownloadedCaptions> {
  const manual = await downloadCaptionsForMode(rawUrl, false);
  if (manual) {
    return manual;
  }

  const automatic = await downloadCaptionsForMode(rawUrl, true);
  if (automatic) {
    return automatic;
  }

  throw new Error("No English captions were downloaded by yt-dlp.");
}

async function downloadCaptionsForMode(rawUrl: string, automatic: boolean): Promise<DownloadedCaptions | null> {
  const tempDir = await mkdtemp(
    /*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ tmpdir(), "englisher-captions-")
  );
  const outputTemplate = path.join(/*turbopackIgnore: true*/ tempDir, "%(id)s.%(ext)s");

  try {
    await execYtdlp([
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      "--ignore-no-formats-error",
      automatic ? "--write-auto-subs" : "--write-subs",
      "--sub-langs",
      CAPTION_LANGUAGES,
      "--sub-format",
      "json3/vtt/srt/best",
      "-o",
      outputTemplate,
      rawUrl
    ]);

    const subtitleFile = await findDownloadedCaptionFile(tempDir);
    if (!subtitleFile) {
      return null;
    }

    return {
      automatic,
      content: await readFile(/*turbopackIgnore: true*/ subtitleFile, "utf8"),
      extension: path.extname(subtitleFile).slice(1).toLowerCase()
    };
  } catch {
    return null;
  } finally {
    await rm(/*turbopackIgnore: true*/ tempDir, { force: true, recursive: true });
  }
}

async function execYtdlp(args: string[]) {
  const fullArgs = buildYtdlpArgs(args);
  return execFileAsync(process.env.YTDLP_PATH || "yt-dlp", fullArgs, {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000
  });
}

function buildYtdlpArgs(args: string[]) {
  const prefix: string[] = [];

  if (process.env.YTDLP_PROXY) {
    prefix.push("--proxy", process.env.YTDLP_PROXY);
  }

  if (process.env.YTDLP_COOKIES_FILE) {
    prefix.push("--cookies", process.env.YTDLP_COOKIES_FILE);
  } else if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
    prefix.push("--cookies-from-browser", process.env.YTDLP_COOKIES_FROM_BROWSER);
  }

  return [...prefix, ...args];
}

async function findDownloadedCaptionFile(tempDir: string) {
  const files = await readdir(/*turbopackIgnore: true*/ tempDir);
  const orderedExtensions = [".json3", ".vtt", ".srt"];

  for (const extension of orderedExtensions) {
    const match = files.find((file) => file.endsWith(extension));
    if (match) {
      return path.join(/*turbopackIgnore: true*/ tempDir, match);
    }
  }

  return null;
}

function parseCaptionContent(content: string, extension: string): CaptionLine[] {
  if (extension === "json3") {
    return parseJson3Captions(content);
  }

  if (extension === "srt") {
    return parseSrtCaptions(content);
  }

  return parseVttCaptions(content);
}

function parseVttCaptions(content: string): CaptionLine[] {
  const normalized = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const blocks = normalized.split("\n\n");
  const lines: CaptionLine[] = [];

  for (const block of blocks) {
    const blockLines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timestampIndex = blockLines.findIndex((line) => line.includes("-->"));

    if (timestampIndex < 0) {
      continue;
    }

    const [startRaw, endRaw] = blockLines[timestampIndex].split("-->");
    const startMs = parseTimestamp(startRaw);
    const endMs = parseTimestamp(endRaw);
    const text = decodeCaptionText(blockLines.slice(timestampIndex + 1).join(" "));

    if (Number.isFinite(startMs) && Number.isFinite(endMs) && text) {
      lines.push({ index: lines.length, startMs, endMs, text });
    }
  }

  return lines;
}

function parseSrtCaptions(content: string): CaptionLine[] {
  return parseVttCaptions(content);
}

function parseTimestamp(value: string) {
  const cleaned = value.trim().split(/\s+/)[0].replace(",", ".");
  const parts = cleaned.split(":");
  const seconds = Number(parts.pop() ?? 0);
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);

  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

function inferJson3EndMs(
  events: Array<{ tStartMs?: number; dDurationMs?: number }>,
  eventIndex: number
) {
  const event = events[eventIndex];
  const startMs = event.tStartMs ?? 0;

  if (typeof event.dDurationMs === "number" && event.dDurationMs > 0) {
    return startMs + event.dDurationMs;
  }

  for (let index = eventIndex + 1; index < events.length; index += 1) {
    const nextStartMs = events[index].tStartMs;
    if (typeof nextStartMs === "number" && nextStartMs > startMs) {
      return nextStartMs;
    }
  }

  return startMs;
}

function dedupeAdjacentLines(lines: CaptionLine[]) {
  const deduped: CaptionLine[] = [];

  for (const line of lines) {
    if (deduped[deduped.length - 1]?.text === line.text) {
      continue;
    }
    deduped.push(line);
  }

  return deduped;
}

function trimOverlappingCaptionEnds(lines: CaptionLine[]) {
  return lines.map((line, index) => {
    const next = lines[index + 1];
    if (next && line.endMs > next.startMs) {
      return { ...line, endMs: next.startMs };
    }
    return line;
  });
}

function mergeFragmentedAutomaticCaptionLines(lines: CaptionLine[]) {
  const merged: CaptionLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    let current = lines[index];

    while (index + 1 < lines.length && canMergeCaptionLines(current, lines[index + 1])) {
      const next = lines[index + 1];
      current = {
        ...current,
        endMs: next.endMs,
        text: `${current.text} ${next.text}`.trim()
      };
      index += 1;
    }

    merged.push(current);
  }

  return merged;
}

function canMergeCaptionLines(current: CaptionLine, next: CaptionLine) {
  const gapMs = next.startMs - current.endMs;
  const mergedText = `${current.text} ${next.text}`.trim();
  const mergedDurationMs = next.endMs - current.startMs;

  return (
    !endsWithSentencePunctuation(current.text) &&
    gapMs >= 0 &&
    gapMs <= 300 &&
    mergedText.length <= 180 &&
    mergedDurationMs <= 12_000
  );
}

function endsWithSentencePunctuation(text: string) {
  return /[.!?。！？]$/.test(text.trim());
}

function decodeCaptionText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16))
    )
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
