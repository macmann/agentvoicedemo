# Enterprise Voice AI Support — Architecture Simulator

This prototype demonstrates a deterministic support orchestration pipeline with inspectable node-by-node state.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Hybrid Understanding Layer configuration

The understanding node supports **live structured interpretation** with graceful fallback to the deterministic mock provider.

### Environment variables

Create a `.env.local` file:

```bash
# Optional: enables live understanding
OPENAI_API_KEY=sk-...

# Optional override; defaults to gpt-5-mini
OPENAI_UNDERSTANDING_MODEL=gpt-5-mini

# Optional override; defaults to https://api.openai.com/v1
OPENAI_BASE_URL=https://api.openai.com/v1
```

### Mock mode (no API key)

If `OPENAI_API_KEY` is missing or invalid, the app automatically runs in **mock mode**.

- UI remains functional.
- Understanding node details show provider=`mock` and fallback reason.
- Deterministic routing and policy behavior are still enforced.

### Live mode

With a valid API key, the understanding adapter sends a structured request to GPT-5 mini and validates/sanitizes the result before it reaches routing.

If model output is malformed, the adapter falls back safely to mock/unclear behavior.

## Safety note

Structured model output never directly executes tools. The existing deterministic routing/policy layer remains the action gate.

## Tool Execution subsystem

Tool execution is implemented as a typed subsystem under `tools/`:

- `toolTypes.ts`: typed tool contracts (request/response per tool)
- `toolConfigs.ts`: per-tool mode/endpoint/timeout/fallback config
- `registry.ts`: tool registry that dispatches each tool by name
- `mockTools.ts`: deterministic demo-friendly local behavior
- `apiTools.ts`: fetch-based API adapter with timeout/error handling
- `toolRunner.ts`: orchestration entrypoint that selects tools, validates payloads, executes, and returns inspectable execution records

Supported tools:

- `diagnose_connectivity()`
- `check_outage_status(postcode)`
- `reschedule_technician(date)`
- `create_support_ticket(summary)`

Switching mock vs API mode is done in demo controls and requires no orchestration rewrite.


## MVP polish additions (UX + inspectability)

This pass improves demo-readiness without changing simulator core behavior:

- Clearer controls copy and run-button wording in full-run vs step mode.
- Keyboard shortcuts for presenter speed:
  - `Ctrl/Cmd + Enter`: run simulation
  - `N`: next step (only in step mode)
- Lightweight progress indicator in header (`currentStep/totalSteps`).
- Copyable **inspection JSON** from the Execution panel (`session` + `logs` snapshot).
- Readable structured diagnostics (pretty-printed payloads in node details).

## Demo flow checklist

Use this sequence for reliable stakeholder walkthroughs:

1. Start with default sample utterance and `Run full simulation`.
2. Open **Execution Log & Latency Timeline** and copy inspection JSON.
3. Click each node to inspect inputs/outputs and fallback behavior.
4. Enable **Step-through mode** and use `N` to show deterministic progression.
5. Toggle fallback and workflow flags to show policy-controlled route changes.
6. Switch tool mode between mock/API stub to demonstrate adapter boundaries.
7. Replay synthesized audio from Session Summary.

## Verification commands

```bash
npm run lint
npm run build
```

If both pass, the MVP is ready for demo packaging and handoff.

## Demo documentation

- `README.md`: architecture and setup overview
- `DEMO_GUIDE.md`: presenter walkthrough and edge-case scripts
- `MVP_CHECKLIST.md`: final pre-demo verification checklist
