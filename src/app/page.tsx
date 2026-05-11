import { PracticeApp } from "@/components/practice-app";
import { createPracticeSession } from "@/lib/practice-session";

const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

export default function Home() {
  const initialSession = createPracticeSession(DEFAULT_VIDEO_URL);

  return <PracticeApp initialSession={initialSession} />;
}

