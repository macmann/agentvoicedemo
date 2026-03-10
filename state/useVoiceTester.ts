"use client";

import { useMemo, useRef, useState } from "react";
import { requestMicrophonePermission, startMicrophoneCapture, stopMicrophoneCapture } from "@/audio/sttAdapter";
import { playSynthesizedAudio, stopSynthesizedAudio } from "@/audio/ttsAdapter";
import { runTesterTurn } from "@/orchestration/runTesterTurn";
import { SessionState } from "@/types/session";
import { PlaybackStatus, TesterConversationState, TesterInputSource, TesterMessage, TesterTurnRecord, TurnStatus } from "@/types/tester";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const initialConversation = (): TesterConversationState => ({
  sessionId: crypto.randomUUID(),
  turns: [],
  messages: [],
  status: "idle"
});

export function useVoiceTester() {
  const [conversation, setConversation] = useState<TesterConversationState>(() => initialConversation());
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(true);
  const [lastSession, setLastSession] = useState<SessionState>();
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const capturePromise = useRef<ReturnType<typeof startMicrophoneCapture>["result"] | null>(null);

  const appendMessage = (message: TesterMessage) => {
    setConversation((prev) => ({ ...prev, messages: [...prev.messages, message] }));
  };

  const setStatus = (status: TurnStatus) => setConversation((prev) => ({ ...prev, status }));

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
      const output = await runTesterTurn({
        utterance: text,
        inputSource: source,
        sttCapture,
        previousSession: lastSession,
        workflowMode: "auto",
        toolMode: "mock",
        forceFallback: false,
        voiceModeEnabled,
        onStage: (stage) => setStatus(stage)
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

      if (output.transcriptText && output.transcriptText !== optimisticUserText) {
        appendMessage({
          id: id("msg"),
          role: "system",
          text: `Transcript: ${output.transcriptText}`,
          createdAt: output.createdAt,
          turnId: userTurnId,
          status: "thinking"
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

    setStatus("listening");
    const capture = startMicrophoneCapture();
    capturePromise.current = capture.result;
    if (!capture.ok) {
      const result = await capture.result;
      appendMessage({
        id: id("msg"),
        role: "system",
        text: result.reason ?? "Could not start microphone capture.",
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("error");
      return;
    }
  };

  const stopListening = async () => {
    if (!capturePromise.current) return;
    stopMicrophoneCapture();
    const result = await capturePromise.current;
    capturePromise.current = null;

    if (!result.transcript.trim()) {
      appendMessage({
        id: id("msg"),
        role: "system",
        text: result.reason ?? "No transcript captured. Try again or use text input.",
        createdAt: new Date().toISOString(),
        status: "error"
      });
      setStatus("idle");
      return;
    }

    await runTurn(result.transcript, "microphone", result);
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
    setConversation(initialConversation());
    setLastSession(undefined);
    setPlaybackStatus("idle");
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
    runTurn,
    startListening,
    stopListening,
    replayLastAudio,
    stopAudio,
    resetConversation
  };
}
