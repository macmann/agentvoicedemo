import { getUnderstandingResult } from "@/lib/understanding/providers";

export async function POST(req: Request) {
  const body = (await req.json()) as { utterance?: string };
  const utterance = typeof body.utterance === "string" ? body.utterance : "";
  const result = await getUnderstandingResult(utterance);
  return Response.json(result);
}
