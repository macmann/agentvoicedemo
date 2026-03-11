import { getPreToolUnderstanding } from "@/lib/understanding/preToolProviders";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    utterance?: string;
    recentConversation?: Array<{ role: string; text: string }>;
    activeSupportIntent?: "service_status" | "announcements" | "troubleshooting";
    pendingQuestion?: { expectedSlot?: string; prompt?: string };
    pendingWorkflow?: { workflowName?: string; missingSlots?: string[] };
    previousToolContext?: { toolName?: string; normalizedResult?: unknown };
  };

  const result = await getPreToolUnderstanding({
    utterance: typeof body.utterance === "string" ? body.utterance : "",
    recentConversation: body.recentConversation,
    activeSupportIntent: body.activeSupportIntent,
    pendingQuestion: body.pendingQuestion,
    pendingWorkflow: body.pendingWorkflow,
    previousToolContext: body.previousToolContext
  });

  return Response.json(result);
}
