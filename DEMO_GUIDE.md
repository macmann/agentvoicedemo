# Demo Guide — Enterprise Voice AI Support MVP

This guide is for interviewer/stakeholder walkthroughs and assumes **mock mode** (no API keys).

## Quick start

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

## Walkthrough sequence

1. Keep default controls and click **Run full simulation**.
2. In the flow graph, click each stage node to inspect diagnostics:
   - STT
   - Hybrid Understanding Layer
   - Workflow / Tool Decision
   - Tool Execution
   - LLM Response Generation
   - TTS
   - Human Handoff
3. Open **Execution Log & Latency Timeline** and click **Copy inspection JSON** for exportable state.
4. Use **Step-through mode** and **Next step** to narrate deterministic routing.
5. Toggle **Fallback path** and **Workflow-needed** to demonstrate policy behavior changes.
6. Switch **Tool execution mode** between `mock` and `api` to show adapter boundaries.

## Demoable edge cases

- Clarify path: use sample utterance `"[unclear] mumble can you help"`.
- Human handoff path: use sample utterance `"I want to speak to a human."`.
- Tool failure path: enable **Fallback path toggle**, set workflow to `Force workflow`, then run.
- STT fallback: set **STT input mode** to `Microphone capture` in unsupported/blocked environments to trigger fallback diagnostics.
- TTS fallback: in mock mode, TTS diagnostics include fallback reason tied to missing/invalid OpenAI key.

## Mock mode behavior

- No API keys are required.
- Understanding falls back to deterministic mock provider.
- TTS falls back to browser mock behavior.
- Deterministic routing/policy still controls all actions.
