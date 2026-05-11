import { describe, expect, it } from "vitest";
import { createPracticeSession, parseVideoUrl } from "./practice-session";

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
});

describe("createPracticeSession", () => {
  it("creates a ready local session with ordered sentence clips", () => {
    const session = createPracticeSession("https://youtu.be/dQw4w9WgXcQ");

    expect(session.status).toBe("ready");
    expect(session.video.platform).toBe("youtube");
    expect(session.sentences.length).toBeGreaterThan(4);
    expect(session.sentences.map((sentence) => sentence.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(session.sentences[0]).toMatchObject({
      id: "sentence-1",
      startMs: 0,
      text: "When you shadow a speaker, you borrow their rhythm before you borrow their words."
    });
  });
});

