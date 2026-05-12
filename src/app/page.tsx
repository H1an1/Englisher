import { PracticeApp } from "@/components/practice-app";
import { FIXTURE_VIDEO_URL, createPracticeSession } from "@/lib/practice-session";

export default function Home() {
  const initialSession = createPracticeSession(FIXTURE_VIDEO_URL);

  return <PracticeApp initialSession={initialSession} />;
}
