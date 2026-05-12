import { describe, expect, it } from "vitest";
import { FIXTURE_VIDEO_URL, createPracticeSession, parseVideoUrl } from "./practice-session";

describe("parseVideoUrl", () => {
  it("normalizes YouTube watch links into an embeddable video reference", () => {
    const parsed = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s");

    expect(parsed).toEqual({
      inputUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      normalizedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      platform: "youtube",
      videoId: "dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    });
  });

  it("accepts non-YouTube links as pending future API sources", () => {
    const parsed = parseVideoUrl("https://x.com/example/status/123");

    expect(parsed.platform).toBe("external");
    expect(parsed.embedUrl).toBeNull();
    expect(parsed.videoId).toBeNull();
  });

  it("rejects malformed YouTube IDs instead of embedding broken videos", () => {
    const parsed = parseVideoUrl("https://www.youtube.com/watch?v=abcdef");

    expect(parsed.platform).toBe("external");
    expect(parsed.videoId).toBeNull();
    expect(parsed.embedUrl).toBeNull();
  });
});

describe("createPracticeSession", () => {
  it("creates the fixed demo session with ordered transcript clips matching the fixture video", () => {
    const session = createPracticeSession("https://x.com/example/status/123");

    expect(session.status).toBe("ready");
    expect(session.video.platform).toBe("youtube");
    expect(session.video.normalizedUrl).toBe(FIXTURE_VIDEO_URL);
    expect(session.sentences).toHaveLength(6);
    expect(session.sentences.map((sentence) => sentence.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(session.sentences[0]).toMatchObject({
      id: "sentence-1",
      startMs: 22492,
      endMs: 32738,
      text: "Thank You. I am honored to be with you today at your commencement from one of the finest universities in the world."
    });
  });
});
