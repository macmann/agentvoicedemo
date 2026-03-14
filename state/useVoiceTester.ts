"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clearStoredTurns, loadStoredTurns, saveStoredTurns } from "@/state/testerHistoryStorage";
import { requestMicrophonePermission, startMicrophoneCapture, stopMicrophoneCapture } from "@/audio/sttAdapter";
import { getSpeechSynthesis, isSynthesizedAudioPlaying, playSynthesizedAudio, stopSynthesizedAudio } from "@/audio/ttsAdapter";
import { runTesterTurn } from "@/orchestration/runTesterTurn";
import { SessionState } from "@/types/session";
import { PlaybackStatus, TesterConversationState, TesterInputSource, TesterMessage, TesterSttState, TesterTurnRecord, TurnStatus, VoicePhase } from "@/types/tester";
import { resolveToolExecutionMode } from "@/tools/runtimeToolConfig";
import { ToolName } from "@/tools/toolTypes";
import { useDashboardRuntimeConfig } from "@/state/useDashboardRuntimeConfig";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function buildTtsSettings(voiceStyle: string) {
  return {
    voiceStyle,
    speed: voiceStyle === "warm-friendly" ? 1 : 0.95,
    streamingEnabled: true
  };
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
  const [conversation, setConversation] = useState<TesterConversationState>(() => {
    const initial = initialConversation();
    return {
      ...initial,
      turns: loadStoredTurns()
    };
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(true);
  const [lastSession, setLastSession] = useState<SessionState>();
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [sttState, setSttState] = useState<TesterSttState>(() => initialSttState());
  const capturePromise = useRef<ReturnType<typeof startMicrophoneCapture>["result"] | null>(null);
  const draftMessageId = useRef<string | null>(null);
  const hasSubmittedCapture = useRef(false);
  const hasMicrophonePermission = useRef(false);
  const hasStartedVoiceLoop = useRef(false);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const activeAssistantSpeechRef = useRef("");
  const activeTurnToken = useRef(0);
  const activeTurnAbortController = useRef<AbortController | null>(null);
  const conversationStatusRef = useRef<TurnStatus>("idle");
  const { config, setConfig, setGlobalToolMode: setGlobalMode, setPerToolMode, resetToolSettings, perToolOverrides, setVoiceModeEnabled } = useDashboardRuntimeConfig();
  const runtimeConfig = config.toolConfig;
  const voiceModeEnabled = config.voiceModeEnabled;

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

  const normalizeSpeechText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const shouldInterruptForTranscript = (transcript: string) => {
    const normalizedTranscript = normalizeSpeechText(transcript);
    const rawTranscript = transcript.toLowerCase().trim();
    if (!normalizedTranscript) return false;

    const transcriptWords = normalizedTranscript.split(" ").filter(Boolean);
    if (transcriptWords.length < 2) return false;

    const assistantSpeech = normalizeSpeechText(activeAssistantSpeechRef.current);
    if (assistantSpeech && assistantSpeech.includes(normalizedTranscript)) {
      return false;
    }

    const interruptWords = ["stop", "wait", "hold on", "excuse me", "cancel"];
    if (interruptWords.some((phrase) => normalizedTranscript.includes(phrase))) {
      return true;
    }

    return rawTranscript.includes("?") || transcriptWords.length >= 4;
  };

  const interruptCurrentWork = () => {
    activeTurnToken.current += 1;
    activeTurnAbortController.current?.abort();
    activeTurnAbortController.current = null;
    activeAssistantSpeechRef.current = "";
    stopSynthesizedAudio();
    setPlaybackStatus("stopped");
    setIsProcessing(false);
  };

  useEffect(() => {
    conversationStatusRef.current = conversation.status;
  }, [conversation.status]);

  useEffect(() => {
    saveStoredTurns(conversation.turns);
  }, [conversation.turns]);

  useEffect(() => {
    if (playbackStatus !== "playing" && conversation.status !== "speaking") {
      activeAssistantSpeechRef.current = "";
    }
  }, [playbackStatus, conversation.status]);

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
    const turnToken = activeTurnToken.current + 1;
    activeTurnToken.current = turnToken;
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
      const output = config.orchestrationApproach === "agentic"
        ? await (async () => {
            const controller = new AbortController();
            activeTurnAbortController.current = controller;
            const response = await fetch("/api/agentic-turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              utterance: text,
              inputSource: source,
              previousSession: lastSession,
              runtimeToolConfig: runtimeConfig,
              voiceModeEnabled,
              ttsVoiceStyle: config.ttsVoiceStyle,
              troubleshootingKbMode: config.troubleshootingKbMode,
              troubleshootingKbSource: config.troubleshootingKbSource,
              uploadedTroubleshootingKbs: config.uploadedTroubleshootingKbs
            })
            });
            return response.json();
          })()
        : await runTesterTurn({
        utterance: text,
        inputSource: source,
        sttCapture,
        previousSession: lastSession,
        workflowMode: "auto",
        runtimeToolConfig: runtimeConfig,
        forceFallback: false,
        voiceModeEnabled,
        ttsVoiceStyle: config.ttsVoiceStyle,
        fillerEnabled: config.fillerEnabled,
        intentUnderstandingMode: config.intentUnderstandingMode,
        postToolResponseMode: config.postToolResponseMode,
        troubleshootingKbMode: config.troubleshootingKbMode,
        troubleshootingKbSource: config.troubleshootingKbSource,
        uploadedTroubleshootingKbs: config.uploadedTroubleshootingKbs,
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

      let session = output.session;
      let ttsPlayed = output.session.tts?.status === "played";
      let ttsFirstAudioMs = output.metadata.latency?.ttsFirstAudioMs;

      if (config.orchestrationApproach === "agentic" && voiceModeEnabled && output.responseText) {
        activeAssistantSpeechRef.current = output.responseText;
        const tts = await getSpeechSynthesis(output.responseText, buildTtsSettings(config.ttsVoiceStyle));
        const playback = await playSynthesizedAudio(tts);
        activeAssistantSpeechRef.current = "";
        ttsPlayed = playback.ok;
        ttsFirstAudioMs = playback.firstAudioMs ?? tts.firstAudioLatencyMs;
        session = {
          ...session,
          tts: playback.ok ? { ...tts, status: "played" } : { ...tts, status: "fallback", reason: playback.reason ?? tts.reason },
          latency: {
            ...session.latency,
            ttsFirstAudioMs
          }
        };
      }

      if (turnToken !== activeTurnToken.current) {
        return;
      }

      const turn: TesterTurnRecord = {
        id: userTurnId,
        createdAt: output.createdAt,
        inputSource: source,
        transcriptText: output.transcriptText,
        finalResponseText: output.responseText,
        metadata: {
          ...output.metadata,
          ttsProviderMode: session.tts?.provider,
          latency: {
            ...output.metadata.latency,
            ttsFirstAudioMs,
            ttfaMs: ttsFirstAudioMs
          }
        },
        playbackStatus: voiceModeEnabled ? "playing" : "idle",
        fallbackInfo: output.fallbackInfo,
        errorInfo: output.errorInfo,
        session
      };

      setLastSession(session);
      setConversation((prev) => ({ ...prev, turns: [...prev.turns, turn] }));
      if (voiceModeEnabled && ttsPlayed && output.responseText) {
        activeAssistantSpeechRef.current = output.responseText;
      }

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

      if (!(voiceModeEnabled && ttsPlayed)) {
        activeAssistantSpeechRef.current = "";
      }
      setStatus(voiceModeEnabled && ttsPlayed ? "speaking" : "idle");
      setPlaybackStatus(voiceModeEnabled && ttsPlayed ? "playing" : "unavailable");
    } catch (error) {
      if (turnToken !== activeTurnToken.current) {
        return;
      }
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
      if (turnToken === activeTurnToken.current) {
        activeTurnAbortController.current = null;
        setIsProcessing(false);
        if (!sttState.isListening) {
          setStatus("idle");
        }
      }
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
    hasStartedVoiceLoop.current = true;
    setIsVoiceSessionActive(true);
    if (isProcessing) {
      interruptCurrentWork();
    }
    if (!hasMicrophonePermission.current) {
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
      hasMicrophonePermission.current = true;
    }

    if (capturePromise.current) {
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
      silenceThresholdMs: config.silenceTimeoutMs,
      onInterimTranscript: (interimTranscript) => {
        if (!config.streamingTranscript) return;
        if (isSynthesizedAudioPlaying() && shouldInterruptForTranscript(interimTranscript)) {
          interruptCurrentWork();
        }
        setSttState((prev) => ({ ...prev, interimTranscript }));
        upsertDraftMessage(interimTranscript);
      },
      onFinalTranscript: (finalTranscript) => {
        if (!config.streamingTranscript) return;
        if (isSynthesizedAudioPlaying() && shouldInterruptForTranscript(finalTranscript)) {
          interruptCurrentWork();
        }
        setSttState((prev) => ({ ...prev, finalTranscript }));
        upsertDraftMessage(finalTranscript);
      },
      onSpeechState: ({ isSpeechDetected, silenceMs, recordingStartedAt, lastSpeechAt }) => {
        if (isSpeechDetected && isProcessing) {
          interruptCurrentWork();
        }

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
      hasMicrophonePermission.current = false;
    }
  };

  const stopListening = async ({ stopVoiceLoop = true }: { stopVoiceLoop?: boolean } = {}) => {
    if (stopVoiceLoop) {
      hasStartedVoiceLoop.current = false;
      setIsVoiceSessionActive(false);
    }
    if (isProcessing) {
      interruptCurrentWork();
    }
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
    activeAssistantSpeechRef.current = "";
    stopSynthesizedAudio();
    setPlaybackStatus("stopped");
    setStatus("idle");
  };

  const resetConversation = () => {
    activeAssistantSpeechRef.current = "";
    hasStartedVoiceLoop.current = false;
    setIsVoiceSessionActive(false);
    interruptCurrentWork();
    stopSynthesizedAudio();
    stopMicrophoneCapture();
    clearDraftMessage();
    setConversation(initialConversation());
    clearStoredTurns();
    setLastSession(undefined);
    setPlaybackStatus("idle");
    setSttState(initialSttState());
  };

  useEffect(() => {
    if (!voiceModeEnabled) {
      void stopListening();
      return;
    }

    if (!hasStartedVoiceLoop.current) {
      return;
    }

    if (sttState.isListening || capturePromise.current) {
      return;
    }

    if (isProcessing) {
      return;
    }

    const timer = setTimeout(() => {
      void startListening();
    }, 150);

    return () => clearTimeout(timer);
  }, [voiceModeEnabled, isProcessing, sttState.isListening, playbackStatus]);

  const latestTurn = useMemo(() => conversation.turns[conversation.turns.length - 1], [conversation.turns]);
  const toolHistory = useMemo(() => conversation.turns
    .flatMap((turn, index) => {
      const entries: Array<{
        id: string;
        turnNumber: number;
        timestamp: string;
        toolName?: string;
        mode?: string;
        status?: string;
        latencyMs?: number;
        summary: string;
      }> = [];

      if (turn.session.toolExecution?.selectedTool) {
        entries.push({
          id: turn.id,
          turnNumber: index + 1,
          timestamp: turn.createdAt,
          toolName: turn.session.toolExecution?.selectedTool,
          mode: turn.session.toolExecution?.executionMode,
          status: turn.session.toolExecution?.executionStatus,
          latencyMs: turn.session.toolExecution?.executionTimeMs,
          summary: turn.session.toolExecution?.errorMessage ?? (turn.session.toolExecution?.executionStatus === "success" ? "Tool executed successfully" : "-")
        });
      }

      const kbSections = turn.metadata.troubleshootingSelectedKBSections ?? [];
      const kbUsed = (turn.metadata.troubleshootingActive || kbSections.length > 0) && turn.metadata.troubleshootingMode !== "off";

      if (kbUsed) {
        const latestStep = turn.metadata.troubleshootingCurrentStep ?? turn.metadata.troubleshootingStepsShown?.[turn.metadata.troubleshootingStepsShown.length - 1];
        const kbSummaryParts = [
          `KB source: ${turn.metadata.troubleshootingKbSource ?? "-"}`,
          kbSections.length ? `Retrieved sections: ${kbSections.join(", ")}` : "Retrieved sections: -",
          latestStep ? `Step shown: ${latestStep}` : "Step shown: -"
        ];

        entries.push({
          id: `${turn.id}-kb`,
          turnNumber: index + 1,
          timestamp: turn.createdAt,
          toolName: "troubleshooting_kb",
          mode: "kb",
          status: turn.metadata.troubleshootingResolutionStatus === "resolved" ? "resolved" : "used",
          latencyMs: undefined,
          summary: kbSummaryParts.join(" • ")
        });
      }

      return entries;
    })
    .slice(-12)
    .reverse(), [conversation.turns]);

  const setToolOverrideMode = (toolName: ToolName, mode: "mock" | "api" | "default") => {
    setPerToolMode(toolName, mode === "default" ? undefined : mode);
  };

  return {
    conversation,
    latestTurn,
    voiceModeEnabled,
    isVoiceSessionActive,
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
    resetConversation,
    runtimeConfig,
    dashboardConfig: config,
    setDashboardConfig: setConfig,
    setGlobalToolMode: setGlobalMode,
    setToolOverrideMode,
    resetToolSettings,
    perToolOverrides,
    resolveToolMode: (toolName: ToolName) => resolveToolExecutionMode(toolName, runtimeConfig),
    toolHistory
  };
}
