"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Headphones,
  Keyboard,
  Link as LinkIcon,
  ListChecks,
  Mic,
  Play,
  RotateCcw,
  Square,
  Video,
  Volume2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DiffView } from "@/components/diff-view";
import {
  createPracticeSession,
  type PracticeSession,
  type SentenceClip
} from "@/lib/practice-session";
import { buildWordDiff, scoreDiff } from "@/lib/word-diff";

type PracticeMode = "dictation" | "shadowing";

type SavedPracticeState = {
  sourceUrl: string;
  session: PracticeSession;
  activeIndex: number;
  mode: PracticeMode;
  dictationInput: Record<string, string>;
  dictationChecked: Record<string, boolean>;
  shadowRecorded: Record<string, boolean>;
};

type PracticeAppProps = {
  initialSession: PracticeSession;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onError?: () => void;
      };
    }
  ) => YouTubePlayer;
};

type YouTubePlayer = {
  destroy: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STORAGE_KEY = "englisher.practice.v2";
const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
let youtubeApiPromise: Promise<YouTubeApi> | null = null;

export function PracticeApp({ initialSession }: PracticeAppProps) {
  const [initialState] = useState(() => createInitialPracticeState(initialSession));
  const [sourceUrl, setSourceUrl] = useState(initialState.sourceUrl);
  const [session, setSession] = useState(initialState.session);
  const [activeIndex, setActiveIndex] = useState(initialState.activeIndex);
  const [mode, setMode] = useState<PracticeMode>(initialState.mode);
  const [dictationInput, setDictationInput] = useState<Record<string, string>>(initialState.dictationInput);
  const [dictationChecked, setDictationChecked] = useState<Record<string, boolean>>(initialState.dictationChecked);
  const [shadowRecorded, setShadowRecorded] = useState<Record<string, boolean>>(initialState.shadowRecorded);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const clipTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const createdAudioUrlsRef = useRef<string[]>([]);

  const currentSentence = session.sentences[activeIndex] ?? session.sentences[0];
  const currentId = currentSentence.id;
  const dictationText = dictationInput[currentId] ?? "";
  const currentAudioUrl = audioUrls[currentId];

  const dictationDiff = useMemo(
    () => (dictationChecked[currentId] ? buildWordDiff(currentSentence.text, dictationText) : null),
    [currentId, currentSentence.text, dictationChecked, dictationText]
  );

  const completedCount = session.sentences.filter(
    (sentence) => dictationChecked[sentence.id] && shadowRecorded[sentence.id]
  ).length;
  const completionPercent = Math.round((completedCount / session.sentences.length) * 100);
  const averageDictationScore = averageScore(session.sentences, dictationChecked, dictationInput);

  useEffect(() => {
    const state: SavedPracticeState = {
      sourceUrl,
      session,
      activeIndex,
      mode,
      dictationInput,
      dictationChecked,
      shadowRecorded
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [sourceUrl, session, activeIndex, mode, dictationInput, dictationChecked, shadowRecorded]);

  useEffect(() => {
    setPlayerReady(false);
    setPlayerError(null);
    window.clearTimeout(clipTimerRef.current ?? undefined);
    playerRef.current?.destroy();
    playerRef.current = null;

    const videoId = session.video.videoId;
    const host = playerHostRef.current;

    if (!videoId || !host) {
      return;
    }

    let cancelled = false;
    host.replaceChildren(document.createElement("div"));
    const playerElement = host.firstElementChild as HTMLDivElement;
    playerElement.className = "youtube-player-target";

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled) {
          return;
        }

        playerRef.current = new youtube.Player(playerElement, {
          videoId,
          playerVars: {
            controls: 1,
            enablejsapi: 1,
            modestbranding: 1,
            rel: 0
          },
          events: {
            onReady: () => {
              if (!cancelled) {
                setPlayerReady(true);
              }
            },
            onError: () => {
              if (!cancelled) {
                setPlayerError("YouTube player failed to load this fixture.");
              }
            }
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerError("YouTube player is unavailable.");
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(clipTimerRef.current ?? undefined);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [session.video.videoId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(clipTimerRef.current ?? undefined);
      stopTracks();
      createdAudioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSession = createPracticeSession(sourceUrl);

    setSession(nextSession);
    setSourceUrl(nextSession.video.normalizedUrl);
    setActiveIndex(0);
    setMode("dictation");
    setDictationInput({});
    setDictationChecked({});
    setShadowRecorded({});
    setRecordingError(null);
    setPlayerError(null);
    setAudioUrls({});
  }

  function selectSentence(index: number) {
    setActiveIndex(index);
    setMode(dictationChecked[session.sentences[index].id] ? "shadowing" : "dictation");
    setRecordingError(null);
  }

  function playCurrentSentence() {
    const player = playerRef.current;

    if (!player) {
      setPlayerError("YouTube player is still loading.");
      return;
    }

    const startSeconds = currentSentence.startMs / 1000;
    const durationMs = Math.max(500, currentSentence.endMs - currentSentence.startMs);

    window.clearTimeout(clipTimerRef.current ?? undefined);
    setPlayerError(null);
    player.seekTo(startSeconds, true);
    player.playVideo();
    clipTimerRef.current = window.setTimeout(() => player.pauseVideo(), durationMs);
  }

  function checkDictation() {
    setDictationChecked((previous) => ({ ...previous, [currentId]: true }));
  }

  function resetCurrentSentence() {
    setDictationInput((previous) => ({ ...previous, [currentId]: "" }));
    setDictationChecked((previous) => ({ ...previous, [currentId]: false }));
    setShadowRecorded((previous) => ({ ...previous, [currentId]: false }));
    setMode("dictation");
    setRecordingError(null);
  }

  function goNext() {
    const nextIndex = Math.min(activeIndex + 1, session.sentences.length - 1);
    selectSentence(nextIndex);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Recording is unavailable in this browser.");
      return;
    }

    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        createdAudioUrlsRef.current.push(audioUrl);
        setAudioUrls((previous) => ({ ...previous, [currentId]: audioUrl }));
        setShadowRecorded((previous) => ({ ...previous, [currentId]: true }));
        setIsRecording(false);
        stopTracks();
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone permission was not granted.");
      stopTracks();
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Headphones size={18} aria-hidden="true" />
          </span>
          <span>Englisher</span>
        </div>

        <form className="url-form" onSubmit={handleSubmit}>
          <label className="input-shell">
            <LinkIcon size={17} aria-hidden="true" />
            <span className="sr-only">Video URL</span>
            <input
              className="url-input"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Paste a YouTube or video link"
              type="url"
            />
          </label>
          <button className="button primary" type="submit">
            <Check size={17} aria-hidden="true" />
            Create session
          </button>
        </form>

        <div className="status-pill">{session.status}</div>
      </header>

      <div className="workspace">
        <SentenceSidebar
          activeIndex={activeIndex}
          dictationChecked={dictationChecked}
          dictationInput={dictationInput}
          onSelect={selectSentence}
          sentences={session.sentences}
          shadowRecorded={shadowRecorded}
        />

        <section className="panel practice-panel">
          <div className="panel-header">
            <h1 className="panel-title">
              <Volume2 size={18} aria-hidden="true" />
              Practice
            </h1>
            <button className="button icon-only" onClick={resetCurrentSentence} type="button">
              <RotateCcw size={17} aria-hidden="true" />
              <span className="sr-only">Reset sentence</span>
            </button>
          </div>

          <div className="practice-main">
            <section aria-label="Current sentence">
              <div className="sentence-kicker">
                Sentence {activeIndex + 1} of {session.sentences.length}
              </div>
              {mode === "shadowing" ? (
                <p className="sentence-text">{currentSentence.text}</p>
              ) : (
                <div className="locked-transcript" aria-hidden="true">
                  <span className="locked-line" />
                  <span className="locked-line" />
                </div>
              )}
            </section>

            <div className="transport">
              <button className="button primary" onClick={playCurrentSentence} type="button">
                <Play size={17} aria-hidden="true" />
                Play sentence
              </button>
              <span className="recording-status">{playerReady ? "Player ready" : playerError ?? "Loading player"}</span>
            </div>

            <div className="segmented" role="tablist" aria-label="Practice stage">
              <button
                aria-selected={mode === "dictation"}
                className={`segment ${mode === "dictation" ? "is-active" : ""}`}
                onClick={() => setMode("dictation")}
                role="tab"
                type="button"
              >
                <Keyboard size={16} aria-hidden="true" />
                Dictation
              </button>
              <button
                aria-selected={mode === "shadowing"}
                className={`segment ${mode === "shadowing" ? "is-active" : ""}`}
                onClick={() => setMode("shadowing")}
                role="tab"
                type="button"
              >
                <Mic size={16} aria-hidden="true" />
                Shadowing
              </button>
            </div>

            {mode === "dictation" ? (
              <section className="practice-stage" aria-label="Dictation">
                <label>
                  <span className="sr-only">Dictation answer</span>
                  <textarea
                    className="textarea"
                    value={dictationText}
                    onChange={(event) =>
                      setDictationInput((previous) => ({
                        ...previous,
                        [currentId]: event.target.value
                      }))
                    }
                    placeholder="Type what you hear"
                  />
                </label>
                <div className="transport">
                  <button
                    className="button primary"
                    disabled={!dictationText.trim()}
                    onClick={checkDictation}
                    type="button"
                  >
                    <Check size={17} aria-hidden="true" />
                    Check dictation
                  </button>
                  <button className="button" onClick={playCurrentSentence} type="button">
                    <Play size={17} aria-hidden="true" />
                    Replay
                  </button>
                </div>
                <DiffView diff={dictationDiff} title="Dictation diff" />
              </section>
            ) : (
              <section className="practice-stage" aria-label="Shadowing">
                <div className="transport">
                  {isRecording ? (
                    <button className="button danger" onClick={stopRecording} type="button">
                      <Square size={17} aria-hidden="true" />
                      Stop
                    </button>
                  ) : (
                    <button className="button primary" onClick={startRecording} type="button">
                      <Mic size={17} aria-hidden="true" />
                      Record
                    </button>
                  )}
                  <button className="button" onClick={playCurrentSentence} type="button">
                    <Play size={17} aria-hidden="true" />
                    Original
                  </button>
                  <span className={`recording-status ${isRecording ? "is-live" : ""}`}>
                    {isRecording ? "Recording" : recordingError ?? "Ready"}
                  </span>
                </div>

                {currentAudioUrl ? (
                  <audio className="audio-preview" controls src={currentAudioUrl} />
                ) : (
                  <div className="recording-empty">No recording yet</div>
                )}
                <div className="transport">
                  <button
                    className="button"
                    disabled={activeIndex === session.sentences.length - 1}
                    onClick={goNext}
                    type="button"
                  >
                    <ArrowRight size={17} aria-hidden="true" />
                    Next sentence
                  </button>
                </div>
              </section>
            )}
          </div>
        </section>

        <aside className="aside-stack">
          <section className="panel">
            <div className="video-frame">
              {session.video.videoId ? (
                <div className="youtube-player-host" ref={playerHostRef} />
              ) : (
                <div className="waveform" aria-hidden="true">
                  {Array.from({ length: 18 }, (_, index) => (
                    <span key={index} style={{ height: `${28 + ((index * 17) % 56)}%` }} />
                  ))}
                </div>
              )}
            </div>
            <div className="video-meta">
              <span className="meta-label">Source</span>
              <span className="meta-value">{session.video.normalizedUrl}</span>
            </div>
            <div className="metrics">
              <div className="metric-row">
                <span className="metric-label">Progress</span>
                <span className="metric-value">{completionPercent}%</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div className="progress-fill" style={{ width: `${completionPercent}%` }} />
              </div>
              <div className="metric-row">
                <span className="metric-label">Dictation</span>
                <span className="metric-value">{formatScore(averageDictationScore)}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Shadowing</span>
                <span className="metric-value">needs ASR</span>
              </div>
            </div>
            <div className="notes">
              API-free build: controlled YouTube clip playback, microphone recording,
              local transcript practice, localStorage persistence.
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function SentenceSidebar({
  activeIndex,
  dictationChecked,
  dictationInput,
  onSelect,
  sentences,
  shadowRecorded
}: {
  activeIndex: number;
  dictationChecked: Record<string, boolean>;
  dictationInput: Record<string, string>;
  onSelect: (index: number) => void;
  sentences: SentenceClip[];
  shadowRecorded: Record<string, boolean>;
}) {
  return (
    <aside className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <ListChecks size={18} aria-hidden="true" />
          Sentences
        </h2>
      </div>
      <div className="sentence-list">
        {sentences.map((sentence, index) => {
          const isComplete = dictationChecked[sentence.id] && shadowRecorded[sentence.id];
          const score = dictationChecked[sentence.id]
            ? scoreDiff(buildWordDiff(sentence.text, dictationInput[sentence.id] ?? ""))
            : null;

          return (
            <button
              className={`sentence-row ${activeIndex === index ? "is-active" : ""} ${
                isComplete ? "is-complete" : ""
              }`}
              key={sentence.id}
              onClick={() => onSelect(index)}
              type="button"
            >
              {isComplete ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <Circle size={18} aria-hidden="true" />
              )}
              <span>
                <span className="sentence-row-title">Sentence {index + 1}</span>
                <span className="sentence-row-subtitle">{sentence.text}</span>
              </span>
              {score === null ? <Video size={16} aria-hidden="true" /> : <span className="score-chip">{score}%</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function averageScore(
  sentences: SentenceClip[],
  checked: Record<string, boolean>,
  input: Record<string, string>
) {
  const scores = sentences
    .filter((sentence) => checked[sentence.id])
    .map((sentence) => scoreDiff(buildWordDiff(sentence.text, input[sentence.id] ?? "")));

  if (scores.length === 0) {
    return null;
  }

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function formatScore(score: number | null) {
  return score === null ? "-" : `${score}%`;
}

function createInitialPracticeState(initialSession: PracticeSession): SavedPracticeState {
  const saved = readSavedState();

  if (saved?.session.sentences.length) {
    return {
      ...saved,
      activeIndex: Math.min(saved.activeIndex, saved.session.sentences.length - 1),
      mode: saved.mode === "shadowing" ? "shadowing" : "dictation"
    };
  }

  return {
    sourceUrl: initialSession.video.normalizedUrl,
    session: initialSession,
    activeIndex: 0,
    mode: "dictation",
    dictationInput: {},
    dictationChecked: {},
    shadowRecorded: {}
  };
}

function readSavedState(): SavedPracticeState | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as SavedPracticeState) : null;
  } catch {
    return null;
  }
}

function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API is client-only."));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`
    );
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();

      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error("YouTube IFrame API loaded without a Player constructor."));
      }
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = YOUTUBE_IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load YouTube IFrame API."));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}
