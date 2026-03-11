"use client";

import { useMemo, useRef, useState } from "react";
import { requestMicrophonePermission, startMicrophoneCapture, stopMicrophoneCapture } from "@/audio/sttAdapter";
import { playSynthesizedAudio, stopSynthesizedAudio } from "@/audio/ttsAdapter";
import { runTesterTurn } from "@/orchestration/runTesterTurn";
import { SessionState } from "@/types/session";
import { PlaybackStatus, TesterConversationState, TesterInputSource, TesterMessage, TesterSttState, TesterTurnRecord, TurnStatus, VoicePhase } from "@/types/tester";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const initialConversation = (): TesterConversationState => ({
  sessionId: crypto.randomUUID(),
  turns: [],
  messages: [],
  status: "idle"
});

const initialSttState = (): TesterSttState => ({
  interimTranscript: "",
  finalTranscript: "",
  isListening: false,
  isSpeechDetected: false,
  silenceMs: 0,
  autoSubmitted: false,
  providerMode: "webspeech_streaming"
});

export function useVoiceTester() {
  const [conversation, setConversation] = useState<TesterConversationState>(() => initialConversation());
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(true);
  const [lastSession, setLastSession] = useState<SessionState>();
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [sttState, setSttState] = useState<TesterSttState>(() => initialSttState());
  const capturePromise = useRef<ReturnType<typeof startMicrophoneCapture>["result"] | null>(null);
  const draftMessageId = useRef<string | null>(null);
  const hasSubmittedCapture = useRef(false);

  const appendMessage = (message: TesterMessage) => {
    setConversation((prev) => ({ ...prev, messages: [...prev.messages, message] }));
  };

  const phaseToStatus: Record<VoicePhase, TurnStatus> = {
    idle: "idle",
    listening: "listening",
    processing: "thinking",
    checking_tool: "tool",
    speaking_filler: "speaking",
    speaking_final: "speaking",
    error: "error"
  };

  const setStatus = (status: TurnStatus) => setConversation((prev) => ({ ...prev, status }));

  const upsertDraftMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setConversation((prev) => {
      if (!draftMessageId.current) {
        const draftId = id("msg");
        draftMessageId.current = draftId;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            { id: draftId, role: "system", text: `Hearing you… ${trimmed}`, createdAt: new Date().toISOString(), status: "listening" }
          ]
        };
      }

      return {
        ...prev,
        messages: prev.messages.map((msg) => (msg.id === draftMessageId.current ? { ...msg, text: `Hearing you… ${trimmed}` } : msg))
      };
    });
  };

  const clearDraftMessage = () => {
    if (!draftMessageId.current) return;
    const draftId = draftMessageId.current;
    setConversation((prev) => ({ ...prev, messages: prev.messages.filter((msg) => msg.id !== draftId) }));
    draftMessageId.current = null;
  };

  const runTurn = async (text: string, source: TesterInputSource, sttCapture?: SessionState["sttCapture"]) => {
    if (!text.trim() && source === "text") return;

    const startedAt = new Date().toISOString();
    setIsProcessing(true);
    setStatus("thinking");

    const optimisticUserText = text.trim() || "(voice input)";
    const userTurnId = id("turn");
    appendMessage({
      id: id("msg"),
      role: "user",
      text: optimisticUserText,
      createdAt: startedAt,
      turnId: userTurnId
    });

    try {
      let announcedToolStage = false;
      const output = await runTesterTurn({
        utterance: text,
        inputSource: source,
        sttCapture,
        previousSession: lastSession,
        workflowMode: "auto",
        toolMode: "mock",
        forceFallback: false,
        voiceModeEnabled,
        onStage: (phase) => {
          setStatus(phaseToStatus[phase]);
          if (phase === "checking_tool" && !announcedToolStage) {
            announcedToolStage = true;
            appendMessage({
              id: id("msg"),
              role: "system",
              text: "Checking tool results…",
              createdAt: new Date().toISOString(),
              turnId: userTurnId,
              status: "tool"
            });
          }
        }
      });

      const turn: TesterTurnRecord = {
        id: userTurnId,
        createdAt: output.createdAt,
        inputSource: source,
        transcriptText: output.transcriptText,
        finalResponseText: output.responseText,
        metadata: output.metadata,
        playbackStatus: voiceModeEnabled ? "playing" : "idle",
        fallbackInfo: output.fallbackInfo,
        errorInfo: output.errorInfo,
        session: output.session
      };

      setLastSession(output.session);
      setConversation((prev) => ({ ...prev, turns: [...prev.turns, turn] }));

      if (output.fillerResponseText) {
        appendMessage({
          id: id("msg"),
          role: "assistant",
          text: output.fillerResponseText,
          createdAt: output.createdAt,
          turnId: userTurnId,
          status: "speaking"
        });
      }

      appendMessage({
        id: id("msg"),
        role: "assistant",
        text: output.responseText,
        createdAt: output.createdAt,
        turnId: userTurnId,
        status: output.metadata.handoffTriggered ? "tool" : "speaking"
      });

      if (output.metadata.handoffTriggered) {
        appendMessage({
          id: id("msg"),
          role: "system",
          text: `Handoff started: ${output.metadata.handoffReason ?? "policy trigger"}`,
          createdAt: output.createdAt,
          turnId: userTurnId,
          status: "tool"
        });
      }

      setStatus(voiceModeEnabled ? "speaking" : "idle");
      setPlaybackStatus(voiceModeEnabled ? "playing" : "idle");
    } catch (error) {
      appendMessage({
        id: id("msg"),
        role: "system",
        text: `Something went wrong while running the turn. ${error instanceof Error ? error.message : "Unknown error."}`,
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("error");
      setPlaybackStatus("unavailable");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatus("idle"), 600);
    }
  };

  const finalizeListening = async ({ autoSubmitted }: { autoSubmitted: boolean }) => {
    if (!capturePromise.current || hasSubmittedCapture.current) return;
    hasSubmittedCapture.current = true;

    const result = await capturePromise.current;
    capturePromise.current = null;

    setSttState((prev) => ({
      ...prev,
      isListening: false,
      autoSubmitted,
      finalTranscript: result.transcript.trim() || prev.finalTranscript,
      interimTranscript: ""
    }));

    clearDraftMessage();

    const transcript = result.transcript.trim();
    if (!transcript) {
      appendMessage({
        id: id("msg"),
        role: "system",
        text: result.reason ?? "No speech detected. Try again or use text input.",
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("idle");
      return;
    }

    if (transcript.length < 2) {
      appendMessage({
        id: id("msg"),
        role: "system",
        text: "Captured utterance was too short. Please try again.",
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("idle");
      return;
    }

    await runTurn(transcript, "microphone", result);
  };

  const startListening = async () => {
    if (isProcessing) return;
    const permission = await requestMicrophonePermission();
    if (!permission.granted) {
      appendMessage({
        id: id("msg"),
        role: "system",
        text: permission.reason ?? "Microphone permission denied.",
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("error");
      return;
    }

    hasSubmittedCapture.current = false;
    setStatus("listening");
    setSttState({
      ...initialSttState(),
      isListening: true,
      recordingStartedAt: Date.now(),
      providerMode: "webspeech_streaming"
    });

    const capture = startMicrophoneCapture({
      silenceThresholdMs: 1000,
      onInterimTranscript: (interimTranscript) => {
        setSttState((prev) => ({ ...prev, interimTranscript }));
        upsertDraftMessage(interimTranscript);
      },
      onFinalTranscript: (finalTranscript) => {
        setSttState((prev) => ({ ...prev, finalTranscript }));
        upsertDraftMessage(finalTranscript);
      },
      onSpeechState: ({ isSpeechDetected, silenceMs, recordingStartedAt, lastSpeechAt }) => {
        setSttState((prev) => ({ ...prev, isSpeechDetected, silenceMs, recordingStartedAt, lastSpeechAt }));
      },
      onAutoSubmit: () => {
        setStatus("thinking");
        void finalizeListening({ autoSubmitted: true });
      }
    });

    capturePromise.current = capture.result;
    if (!capture.ok) {
      const result = await capture.result;
      setSttState((prev) => ({ ...prev, providerMode: "unsupported", isListening: false }));
      appendMessage({
        id: id("msg"),
        role: "system",
        text: result.reason ?? "Could not start microphone capture.",
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("error");
    }
  };

  const stopListening = async () => {
    if (!capturePromise.current) return;
    stopMicrophoneCapture();
    await finalizeListening({ autoSubmitted: false });
  };

  const replayLastAudio = async () => {
    const last = [...conversation.turns].reverse().find((turn) => Boolean(turn.session.tts));
    if (!last?.session.tts) return;
    const playback = await playSynthesizedAudio(last.session.tts);
    setPlaybackStatus(playback.ok ? "playing" : "unavailable");
  };

  const stopAudio = () => {
    stopSynthesizedAudio();
    setPlaybackStatus("stopped");
    setStatus("idle");
  };

  const resetConversation = () => {
    stopSynthesizedAudio();
    stopMicrophoneCapture();
    clearDraftMessage();
    setConversation(initialConversation());
    setLastSession(undefined);
    setPlaybackStatus("idle");
    setSttState(initialSttState());
  };

  const latestTurn = useMemo(() => conversation.turns[conversation.turns.length - 1], [conversation.turns]);

  return {
    conversation,
    latestTurn,
    voiceModeEnabled,
    setVoiceModeEnabled,
    isProcessing,
    isDebugOpen,
    setIsDebugOpen,
    playbackStatus,
    sttState,
    runTurn,
    startListening,
    stopListening,
    replayLastAudio,
    stopAudio,
    resetConversation
  };
}
