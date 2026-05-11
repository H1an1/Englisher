export type VideoPlatform = "youtube" | "external";

export type ParsedVideo = {
  inputUrl: string;
  normalizedUrl: string;
  platform: VideoPlatform;
  videoId: string | null;
  embedUrl: string | null;
};

export type SentenceClip = {
  id: string;
  index: number;
  text: string;
  startMs: number;
  endMs: number;
};

export type PracticeSession = {
  id: string;
  status: "ready";
  title: string;
  createdAt: string;
  video: ParsedVideo;
  sentences: SentenceClip[];
};

const DEMO_SENTENCES = [
  "When you shadow a speaker, you borrow their rhythm before you borrow their words.",
  "Listen once for the shape of the sentence, then listen again for the details.",
  "Dictation trains your ear to notice small sounds that reading often hides.",
  "A short pause can tell you where one idea ends and the next one begins.",
  "Your goal is not to sound perfect, but to stay close to the original timing.",
  "Repeat the sentence until the words feel natural at full speed."
];

export function parseVideoUrl(rawUrl: string): ParsedVideo {
  const inputUrl = rawUrl.trim();

  try {
    const url = new URL(inputUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const videoId = getYouTubeVideoId(url, host);

    if (videoId) {
      return {
        inputUrl,
        normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
        platform: "youtube",
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`
      };
    }

    return {
      inputUrl,
      normalizedUrl: url.toString(),
      platform: "external",
      videoId: null,
      embedUrl: null
    };
  } catch {
    return {
      inputUrl,
      normalizedUrl: inputUrl,
      platform: "external",
      videoId: null,
      embedUrl: null
    };
  }
}

export function createPracticeSession(videoUrl: string): PracticeSession {
  const video = parseVideoUrl(videoUrl);

  return {
    id: `local-${hashString(video.normalizedUrl || video.inputUrl)}`,
    status: "ready",
    title: video.platform === "youtube" ? "YouTube shadowing session" : "External video shadowing session",
    createdAt: new Date().toISOString(),
    video,
    sentences: DEMO_SENTENCES.map((text, index) => ({
      id: `sentence-${index + 1}`,
      index,
      text,
      startMs: index * 7200,
      endMs: index * 7200 + estimateSentenceDuration(text)
    }))
  };
}

function getYouTubeVideoId(url: URL, host: string): string | null {
  if (host === "youtu.be") {
    return cleanVideoId(url.pathname.slice(1));
  }

  if (!host.endsWith("youtube.com")) {
    return null;
  }

  if (url.pathname === "/watch") {
    return cleanVideoId(url.searchParams.get("v"));
  }

  const pathMatch = url.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/);
  return cleanVideoId(pathMatch?.[1] ?? null);
}

function cleanVideoId(value: string | null): string | null {
  const id = value?.trim();
  return id && /^[a-zA-Z0-9_-]{6,}$/.test(id) ? id : null;
}

function estimateSentenceDuration(sentence: string): number {
  const wordCount = sentence.split(/\s+/).length;
  return Math.max(3200, wordCount * 520);
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

