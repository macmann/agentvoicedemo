import { NodeDetails } from "@/types/session";

export const nodeCatalog: NodeDetails[] = [
  {
    id: "stt",
    label: "STT",
    purpose: "Convert caller speech into text with low-latency partial transcription.",
    input: "Raw voice audio frames",
    output: "Transcript text + confidence",
    parameters: ["language=en-US", "partialResults=true", "noiseSuppression=medium"],
    latencyEstimate: "300-700ms",
    fallbackBehavior: "Ask user to repeat and route to low-bandwidth speech profile."
  },
  {
    id: "understanding",
    label: "Hybrid Understanding Layer",
    purpose: "Combine deterministic intent/entity extraction with sentiment/empathy signals.",
    input: "Transcript text",
    output: "Intent, entities, empathy/handoff flags",
    parameters: ["intentThreshold=0.78", "entityResolver=telecom-domain-v1", "sentiment=true"],
    latencyEstimate: "200-600ms",
    fallbackBehavior: "Low confidence routes to clarify question or handoff recommendation."
  },
  {
    id: "decision",
    label: "Workflow / Tool Decision",
    purpose: "Select deterministic workflow path and guardrails before free-form generation.",
    input: "Understanding object",
    output: "Routing decision + workflow name",
    parameters: ["routingTable=static-intent-map", "confidenceThreshold=0.72", "fallbackOnUnknown=clarify"],
    latencyEstimate: "40-90ms",
    fallbackBehavior: "Switch to no-workflow answer or human handoff path."
  },
  {
    id: "toolExecution",
    label: "Tool Execution",
    purpose: "Execute backend checks (e.g., outage lookup, appointment update) with strict schemas.",
    input: "Workflow + entities",
    output: "Tool payload success/failure",
    parameters: ["mode=mock|api", "registry=typed-tools-v1", "timeoutMs=1500", "fallback=create_support_ticket|handoff"],
    latencyEstimate: "100-1200ms",
    fallbackBehavior: "Return graceful degradation response and optionally queue handoff."
  },
  {
    id: "responseGeneration",
    label: "LLM Response Generation",
    purpose: "Generate conversational response grounded in tool outputs and policy.",
    input: "Structured context only (utterance, empathy, workflow/handoff/policy state)",
    output: "Voice-friendly response text + diagnostics",
    parameters: ["model=gpt-5-mini|mock", "tone=calm+helpful+empathetic", "maxLength=220", "grounding=required"],
    latencyEstimate: "250-700ms",
    fallbackBehavior: "Use deterministic template when LLM unavailable."
  },
  {
    id: "tts",
    label: "TTS",
    purpose: "Render response text into natural speech for caller playback.",
    input: "Response text",
    output: "Audio waveform/stream",
    parameters: ["provider=openai|mock_browser", "voiceStyle=calm-neutral", "speed=1.0", "streaming=true"],
    latencyEstimate: "150-400ms",
    fallbackBehavior: "Fallback to alternate voice profile or text callback channel."
  },
  {
    id: "handoff",
    label: "Human Handoff",
    purpose: "Transfer session context and summary to human agent with minimal repetition.",
    input: "Session state + reason",
    output: "Handoff payload and confirmation",
    parameters: ["priority=sentiment+failure", "summaryMode=concise"],
    latencyEstimate: "80-160ms",
    fallbackBehavior: "If queue unavailable, offer callback and keep context persisted."
  }
];

export const nodeOrder = nodeCatalog.map((node) => node.id);
