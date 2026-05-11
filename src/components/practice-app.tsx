"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Headphones,
  Keyboard,
  Link,
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
import { buildWordDiff, scoreDiff, type WordDiff } from "@/lib/word-diff";

type PracticeMode = "dictation" | "shadowing";

type SavedPracticeState = {
  sourceUrl: string;
  session: PracticeSession;
  activeIndex: number;
  mode: PracticeMode;
  dictationInput: Record<string, string>;
  shadowInput: Record<string, string>;
  dictationChecked: Record<string, boolean>;
  shadowChecked: Record<string, boolean>;
};

type PracticeAppProps = {
  initialSession: PracticeSession;
};

const STORAGE_KEY = "englisher.practice.v1";

export function PracticeApp({ initialSession }: PracticeAppProps) {
  const [sourceUrl, setSourceUrl] = useState(initialSession.video.normalizedUrl);
  const [session, setSession] = useState(initialSession);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<PracticeMode>("dictation");
  const [dictationInput, setDictationInput] = useState<Record<string, string>>({});
  const [shadowInput, setShadowInput] = useState<Record<string, string>>({});
  const [dictationChecked, setDictationChecked] = useState<Record<string, boolean>>({});
  const [shadowChecked, setShadowChecked] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const createdAudioUrlsRef = useRef<string[]>([]);

  const currentSentence = session.sentences[activeIndex] ?? session.sentences[0];
  const currentId = currentSentence.id;
  const dictationText = dictationInput[currentId] ?? "";
  const shadowText = shadowInput[currentId] ?? "";
  const currentAudioUrl = audioUrls[currentId];

  const dictationDiff = useMemo(
    () => (dictationChecked[currentId] ? buildWordDiff(currentSentence.text, dictationText) : null),
    [currentId, currentSentence.text, dictationChecked, dictationText]
  );
  const shadowDiff = useMemo(
    () => (shadowChecked[currentId] ? buildWordDiff(currentSentence.text, shadowText) : null),
    [currentId, currentSentence.text, shadowChecked, shadowText]
  );

  const completedCount = session.sentences.filter(
    (sentence) => dictationChecked[sentence.id] && shadowChecked[sentence.id]
  ).length;
  const completionPercent = Math.round((completedCount / session.sentences.length) * 100);
  const averageDictationScore = averageScore(session.sentences, dictationChecked, dictationInput);
  const averageShadowScore = averageScore(session.sentences, shadowChecked, shadowInput);

  useEffect(() => {
    const saved = readSavedState();

    if (!saved) {
      return;
    }

    setSourceUrl(saved.sourceUrl);
    setSession(saved.session);
    setActiveIndex(Math.min(saved.activeIndex, saved.session.sentences.length - 1));
    setMode(saved.mode);
    setDictationInput(saved.dictationInput);
    setShadowInput(saved.shadowInput);
    setDictationChecked(saved.dictationChecked);
    setShadowChecked(saved.shadowChecked);
  }, []);

  useEffect(() => {
    const state: SavedPracticeState = {
      sourceUrl,
      session,
      activeIndex,
      mode,
      dictationInput,
      shadowInput,
      dictationChecked,
      shadowChecked
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [
    sourceUrl,
    session,
    activeIndex,
    mode,
    dictationInput,
    shadowInput,
    dictationChecked,
    shadowChecked
  ]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
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
    setShadowInput({});
    setDictationChecked({});
    setShadowChecked({});
    setRecordingError(null);
    setAudioUrls({});
  }

  function selectSentence(index: number) {
    setActiveIndex(index);
    setMode(dictationChecked[session.sentences[index].id] ? "shadowing" : "dictation");
    setRecordingError(null);
  }

  function playCurrentSentence() {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentSentence.text);
    utterance.lang = "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function checkDictation() {
    setDictationChecked((previous) => ({ ...previous, [currentId]: true }));
  }

  function checkShadowing() {
    setShadowChecked((previous) => ({ ...previous, [currentId]: true }));
  }

  function resetCurrentSentence() {
    setDictationInput((previous) => ({ ...previous, [currentId]: "" }));
    setShadowInput((previous) => ({ ...previous, [currentId]: "" }));
    setDictationChecked((previous) => ({ ...previous, [currentId]: false }));
    setShadowChecked((previous) => ({ ...previous, [currentId]: false }));
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
            <Link size={17} aria-hidden="true" />
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
          shadowChecked={shadowChecked}
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
              <button className="button" onClick={() => setMode("dictation")} type="button">
                <Keyboard size={17} aria-hidden="true" />
                Dictation
              </button>
              <button className="button" onClick={() => setMode("shadowing")} type="button">
                <Mic size={17} aria-hidden="true" />
                Shadowing
              </button>
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
                  <audio className="audio-preview" controls src={currentAudioUrl}>
                    <track kind="captions" />
                  </audio>
                ) : null}

                <label>
                  <span className="sr-only">Shadowing transcript</span>
                  <textarea
                    className="textarea"
                    value={shadowText}
                    onChange={(event) =>
                      setShadowInput((previous) => ({
                        ...previous,
                        [currentId]: event.target.value
                      }))
                    }
                    placeholder="Type your spoken version"
                  />
                </label>
                <div className="transport">
                  <button
                    className="button primary"
                    disabled={!shadowText.trim()}
                    onClick={checkShadowing}
                    type="button"
                  >
                    <Check size={17} aria-hidden="true" />
                    Compare shadowing
                  </button>
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
                <DiffView diff={shadowDiff} title="Shadowing diff" />
              </section>
            )}
          </div>
        </section>

        <aside className="aside-stack">
          <section className="panel">
            <div className="video-frame">
              {session.video.embedUrl ? (
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  src={session.video.embedUrl}
                  title="Source video"
                />
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
                <span className="metric-value">{formatScore(averageShadowScore)}</span>
              </div>
            </div>
            <div className="notes">
              API-free build: browser speech playback, microphone recording, local transcript
              practice, localStorage persistence.
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
  shadowChecked
}: {
  activeIndex: number;
  dictationChecked: Record<string, boolean>;
  dictationInput: Record<string, string>;
  onSelect: (index: number) => void;
  sentences: SentenceClip[];
  shadowChecked: Record<string, boolean>;
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
          const isComplete = dictationChecked[sentence.id] && shadowChecked[sentence.id];
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

function readSavedState(): SavedPracticeState | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as SavedPracticeState) : null;
  } catch {
    return null;
  }
}
