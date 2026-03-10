export function synthesizeMockSpeech(response: string) {
  return {
    voice: "calm-neutral",
    characters: response.length,
    streamReady: true
  };
}
