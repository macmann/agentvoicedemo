import { SessionState } from "@/types/session";

export function generateMockResponse(state: SessionState): string {
  if (state.routing?.decision === "clarify") {
    return state.routing.clarificationPrompt ?? "I want to make sure I understood you correctly. Could you clarify your request?";
  }

  if (state.handoff?.triggered) {
    return "I understand. I’m connecting you to a human specialist now and sharing your case details so you won’t need to repeat yourself.";
  }

  if (state.understanding?.empathyNeeded && state.understanding.workflowRequired) {
    return "I’m sorry you’re dealing with that. I’ll take care of this for you now and run the requested support step.";
  }

  if (state.understanding?.intent === "empathy_only") {
    return "I’m really sorry you’re going through that. I’m here with you, and if you want support with an account or service task, I can help right away.";
  }

  if (state.toolResult?.status === "failure") {
    return "I couldn’t complete that check right now. I can transfer you to a specialist immediately, or keep trying with a simplified diagnostic flow.";
  }

  if (state.toolResult?.toolName === "OutageLookupAPI") {
    if ((state.toolResult.result as { incidentId?: string } | undefined)?.incidentId) {
      return "I checked your area and there is a confirmed outage (incident INC-44721) with an estimated restoration time of about 2 hours.";
    }
    return "I found a service outage in your area with an estimated restoration time of about 2 hours. I can also send status updates to your phone.";
  }

  if (state.toolResult?.toolName === "DeviceDiagnostics") {
    return "Your router’s red blinking light usually indicates a line signal issue. Please power-cycle the router and verify the fiber/cable connection. If it stays red, I can escalate this immediately.";
  }

  if (state.toolResult?.toolName === "AppointmentManager") {
    return "Done — your technician visit has been rescheduled to tomorrow between 10:00 AM and 12:00 PM. Would you like a confirmation text?";
  }

  return "Thanks for sharing that. I can help with your account issue and guide you through the next best step.";
}
