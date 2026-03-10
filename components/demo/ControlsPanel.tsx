"use client";

import { ToolExecutionMode } from "@/tools/toolTypes";
import { SttInputMode } from "@/types/session";

interface Props {
  utterance: string;
  sampleUtterances: string[];
  stepMode: boolean;
  forceFallback: boolean;
  workflowMode: "auto" | "workflow" | "no_workflow";
  sttInputMode: SttInputMode;
  sttStreamingSimulated: boolean;
  microphoneState: "idle" | "listening" | "recognized" | "fallback";
  microphoneReason?: string;
  toolMode: ToolExecutionMode;
  onUtteranceChange: (value: string) => void;
  onStepModeChange: (value: boolean) => void;
  onForceFallbackChange: (value: boolean) => void;
  onWorkflowModeChange: (value: "auto" | "workflow" | "no_workflow") => void;
  onSttInputModeChange: (value: SttInputMode) => void;
  onSttStreamingSimulatedChange: (value: boolean) => void;
  onStartMicrophoneCapture: () => void;
  onStopMicrophoneCapture: () => void;
  onToolModeChange: (value: ToolExecutionMode) => void;
  onRun: () => void;
  onNext: () => void;
  onReset: () => void;
  nextDisabled: boolean;
}

export function ControlsPanel(props: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Demo Controls</h2>
      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium text-slate-600">STT input mode</span>
          <select
            className="w-full rounded border border-slate-300 p-2"
            value={props.sttInputMode}
            onChange={(e) => props.onSttInputModeChange(e.target.value as SttInputMode)}
          >
            <option value="text">Text input</option>
            <option value="microphone">Microphone capture</option>
          </select>
        </label>

        {props.sttInputMode === "microphone" ? (
          <div className="rounded border border-slate-200 p-2">
            <div className="flex gap-2">
              <button
                className="rounded bg-slate-800 px-3 py-2 text-white disabled:bg-slate-300"
                disabled={props.microphoneState === "listening"}
                onClick={props.onStartMicrophoneCapture}
                type="button"
              >
                Start recording
              </button>
              <button
                className="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                disabled={props.microphoneState !== "listening"}
                onClick={props.onStopMicrophoneCapture}
                type="button"
              >
                Stop recording
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">Mic status: {props.microphoneState}{props.microphoneReason ? ` (${props.microphoneReason})` : ""}</p>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <input
            id="stt-streaming"
            type="checkbox"
            checked={props.sttStreamingSimulated}
            onChange={(e) => props.onSttStreamingSimulatedChange(e.target.checked)}
          />
          <label htmlFor="stt-streaming">Simulated streaming indicator</label>
        </div>

        <label className="block">
          <span className="mb-1 block font-medium text-slate-600">Sample utterance</span>
          <select
            className="w-full rounded border border-slate-300 p-2"
            value={props.utterance}
            onChange={(e) => props.onUtteranceChange(e.target.value)}
          >
            {props.sampleUtterances.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-medium text-slate-600">Custom utterance</span>
          <input
            className="w-full rounded border border-slate-300 p-2"
            value={props.utterance}
            onChange={(e) => props.onUtteranceChange(e.target.value)}
            placeholder="Type caller text..."
          />
        </label>

        <div className="flex items-center gap-2">
          <input id="step-mode" type="checkbox" checked={props.stepMode} onChange={(e) => props.onStepModeChange(e.target.checked)} />
          <label htmlFor="step-mode">Step-through mode</label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="fallback-path"
            type="checkbox"
            checked={props.forceFallback}
            onChange={(e) => props.onForceFallbackChange(e.target.checked)}
          />
          <label htmlFor="fallback-path">Fallback path toggle</label>
        </div>

        <label className="block">
          <span className="mb-1 block font-medium text-slate-600">Workflow-needed toggle</span>
          <select
            className="w-full rounded border border-slate-300 p-2"
            value={props.workflowMode}
            onChange={(e) => props.onWorkflowModeChange(e.target.value as "auto" | "workflow" | "no_workflow")}
          >
            <option value="auto">Auto detect</option>
            <option value="workflow">Force workflow</option>
            <option value="no_workflow">Force no-workflow</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-medium text-slate-600">Tool execution mode</span>
          <select
            className="w-full rounded border border-slate-300 p-2"
            value={props.toolMode}
            onChange={(e) => props.onToolModeChange(e.target.value as ToolExecutionMode)}
          >
            <option value="mock">Mock local tools</option>
            <option value="api">API-backed adapter (stub)</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          <button className="rounded bg-indigo-600 px-3 py-2 text-white" onClick={props.onRun} type="button">
            Run simulation
          </button>
          <button className="rounded border border-slate-300 px-3 py-2" onClick={props.onNext} disabled={props.nextDisabled} type="button">
            Next-step
          </button>
          <button className="rounded border border-slate-300 px-3 py-2" onClick={props.onReset} type="button">
            Reset flow
          </button>
        </div>
      </div>
    </section>
  );
}
