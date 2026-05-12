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

export const FIXTURE_VIDEO_URL = "https://www.youtube.com/watch?v=UF8uR6Z6KLc";

const FIXTURE_SENTENCES = [
  {
    text: "Thank You. I am honored to be with you today at your commencement from one of the finest universities in the world.",
    startMs: 22492,
    endMs: 32738
  },
  {
    text: "Truth be told, I never graduated from college.",
    startMs: 35559,
    endMs: 41559
  },
  {
    text: "And this is the closest I've ever gotten to a college graduation.",
    startMs: 41560,
    endMs: 45929
  },
  {
    text: "Today I want to tell you three stories from my life. That's it.",
    startMs: 47980,
    endMs: 52009
  },
  {
    text: "No big deal. Just three stories.",
    startMs: 52010,
    endMs: 54849
  },
  {
    text: "The first story is about connecting the dots.",
    startMs: 55850,
    endMs: 59569
  }
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

export function createPracticeSession(_videoUrl: string): PracticeSession {
  const video = parseVideoUrl(FIXTURE_VIDEO_URL);

  return {
    id: `local-${hashString(video.normalizedUrl || video.inputUrl)}`,
    status: "ready",
    title: "Steve Jobs Stanford commencement fixture",
    createdAt: new Date().toISOString(),
    video,
    sentences: FIXTURE_SENTENCES.map((sentence, index) => ({
      id: `sentence-${index + 1}`,
      index,
      text: sentence.text,
      startMs: sentence.startMs,
      endMs: sentence.endMs
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
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
