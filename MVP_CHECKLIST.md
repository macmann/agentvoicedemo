# MVP Final Verification Checklist

Use this checklist before interview/demo presentation.

## Architecture visibility and inspectability
- [ ] All seven stages visible in flow graph.
- [ ] Clicking each stage updates node detail panel.

## Controls
- [ ] STT input mode toggle (text/microphone) works.
- [ ] Microphone start/stop controls appear in microphone mode.
- [ ] Simulated streaming indicator toggle works.
- [ ] Sample utterance selector works.
- [ ] Custom utterance input works.
- [ ] Step-through mode works.
- [ ] Fallback path toggle works.
- [ ] Workflow-needed selector works.
- [ ] Tool execution mode selector works.
- [ ] Run / Next step / Reset controls work.

## Session summary completeness
- [ ] Original utterance
- [ ] Transcript
- [ ] STT mode/provider
- [ ] STT status/confidence
- [ ] STT fallback occurred
- [ ] STT failure count
- [ ] Intent
- [ ] Understanding mode
- [ ] Sentiment/empathy
- [ ] Final generated response
- [ ] TTS first audio latency
- [ ] Audio status indicator
- [ ] Voice style/speed
- [ ] Streaming enabled
- [ ] TTS fallback reason
- [ ] Latency breakdown

## Demoable scenarios
- [ ] Clarify
- [ ] Handoff
- [ ] Tool failure
- [ ] STT fallback
- [ ] TTS fallback

## Documentation
- [ ] `README.md` present and current.
- [ ] `DEMO_GUIDE.md` present and current.
- [ ] `MVP_CHECKLIST.md` present and current.

## Mode safety
- [ ] App works with no API keys (mock mode).
