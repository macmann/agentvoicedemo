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
