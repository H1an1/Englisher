import { describe, expect, it } from "vitest";
import {
  buildPracticeSessionFromCaptionLines,
  normalizeCaptionLines,
  parseJson3Captions,
  selectBestEnglishCaptionTrack
} from "./ytdlp-ingest";

describe("parseJson3Captions", () => {
  it("turns YouTube json3 caption events into millisecond caption lines", () => {
    const lines = parseJson3Captions(
      JSON.stringify({
        events: [
          {
            tStartMs: 22492,
            dDurationMs: 7527,
            segs: [{ utf8: "Thank You. " }, { utf8: "I am honored" }]
          },
          {
            tStartMs: 30020,
            dDurationMs: 2718,
            segs: [{ utf8: "from one of the finest universities in the world." }]
          }
        ]
      })
    );

    expect(lines).toEqual([
      {
        index: 0,
        startMs: 22492,
        endMs: 30019,
        text: "Thank You. I am honored"
      },
      {
        index: 1,
        startMs: 30020,
        endMs: 32738,
        text: "from one of the finest universities in the world."
      }
    ]);
  });
});

describe("normalizeCaptionLines", () => {
  it("merges wrapped human captions into sentence-sized clips", () => {
    const lines = normalizeCaptionLines(
      [
        { index: 0, startMs: 22492, endMs: 30019, text: "Thank You. I am honored to be with you today" },
        { index: 1, startMs: 30020, endMs: 32738, text: "at your commencement from one of the finest universities in the world." },
        { index: 2, startMs: 35559, endMs: 41559, text: "Truth be told, I never graduated from college." }
      ],
      { automatic: false }
    );

    expect(normalizeText(lines[0].text)).toBe(
      "Thank You. I am honored to be with you today at your commencement from one of the finest universities in the world."
    );
    expect(lines[0]).toMatchObject({ index: 0, startMs: 22492, endMs: 32738 });
    expect(lines[1]).toMatchObject({ index: 1, startMs: 35559, endMs: 41559 });
  });

  it("merges fragmented automatic captions into sentence-sized clips", () => {
    const lines = normalizeCaptionLines(
      [
        { index: 0, startMs: 22492, endMs: 30019, text: "Thank You. I am honored to be with you today" },
        { index: 1, startMs: 30020, endMs: 32738, text: "at your commencement from one of the finest universities in the world." },
        { index: 2, startMs: 35559, endMs: 41559, text: "Truth be told, I never graduated from college." }
      ],
      { automatic: true }
    );

    expect(normalizeText(lines[0].text)).toBe(
      "Thank You. I am honored to be with you today at your commencement from one of the finest universities in the world."
    );
    expect(lines[0]).toMatchObject({ index: 0, startMs: 22492, endMs: 32738 });
    expect(lines[1]).toMatchObject({ index: 1, startMs: 35559, endMs: 41559 });
  });
});

describe("buildPracticeSessionFromCaptionLines", () => {
  it("creates a real YouTube practice session from caption lines", () => {
    const session = buildPracticeSessionFromCaptionLines({
      rawUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
      title: "Caption-backed session",
      lines: [
        { index: 0, startMs: 1000, endMs: 2300, text: "We're no strangers to love." },
        { index: 1, startMs: 2500, endMs: 4200, text: "You know the rules and so do I." }
      ]
    });

    expect(session.title).toBe("Caption-backed session");
    expect(session.video.normalizedUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(session.sentences).toHaveLength(2);
    expect(session.sentences[0]).toEqual({
      id: "caption-1",
      index: 0,
      text: "We're no strangers to love.",
      startMs: 1000,
      endMs: 2300
    });
  });
});

describe("selectBestEnglishCaptionTrack", () => {
  it("prefers manual English subtitle tracks with yt-dlp suffixed language ids over automatic captions", () => {
    const selected = selectBestEnglishCaptionTrack({
      subtitles: {
        "en-eEY6OEpapPo": [
          {
            ext: "json3",
            name: "English - English",
            url: "https://captions.example/manual.json3"
          }
        ]
      },
      automatic_captions: {
        "en-orig": [
          {
            ext: "json3",
            name: "English (Original)",
            url: "https://captions.example/automatic.json3"
          }
        ]
      }
    });

    expect(selected).toMatchObject({
      automatic: false,
      extension: "json3",
      language: "en-eEY6OEpapPo",
      track: {
        url: "https://captions.example/manual.json3"
      }
    });
  });
});

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
