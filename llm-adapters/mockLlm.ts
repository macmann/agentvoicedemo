import { SessionState } from "@/types/session";

export function generateMockResponse(state: SessionState): string {
  if (state.handoff?.triggered) {
    return "I understand. I’m connecting you to a human specialist now and sharing your case details so you won’t need to repeat yourself.";
  }

  if (state.toolResult?.status === "failure") {
    return "I couldn’t complete that check right now. I can transfer you to a specialist immediately, or keep trying with a simplified diagnostic flow.";
  }

  if (state.toolResult?.toolName === "OutageLookupAPI") {
    return "I found a service outage in your area with an estimated restoration time of about 2 hours. I can also send status updates to your phone.";
  }

  if (state.toolResult?.toolName === "AppointmentManager") {
    return "Done — your technician visit has been rescheduled to tomorrow between 10:00 AM and 12:00 PM. Would you like a confirmation text?";
  }

  return "Thanks for sharing that. I can help with your account issue and guide you through the next best step.";
}
