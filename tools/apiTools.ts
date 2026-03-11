import { ToolConfig } from "@/tools/toolConfigs";
import { ToolExecutionResult, ToolRequestByName, ToolName } from "@/tools/toolTypes";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function executeApiTool<TName extends ToolName>(
  toolName: TName,
  request: ToolRequestByName[TName],
  config: ToolConfig
): Promise<ToolExecutionResult> {
  if (!config.endpoint) {
    return {
      tool_name: toolName,
      status: "failure",
      request,
      mode: "api",
      error: "API endpoint not configured",
      fallback_behavior: config.fallbackBehavior
    };
  }

  try {
    const response = await withTimeout(
      fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_name: toolName, request })
      }),
      config.timeoutMs
    );

    const rawText = await response.text();
    let rawPayload: unknown = rawText;
    try {
      rawPayload = rawText ? JSON.parse(rawText) : {};
    } catch {
      rawPayload = rawText;
    }

    if (!response.ok) {
      return {
        tool_name: toolName,
        status: "failure",
        request,
        mode: "api",
        endpoint: config.endpoint,
        error: `API request failed (${response.status})`,
        fallback_behavior: config.fallbackBehavior,
        raw_response: rawPayload
      };
    }

    const data = (typeof rawPayload === "object" && rawPayload ? rawPayload : {}) as Record<string, unknown>;
    if (data.status !== "success") {
      return {
        tool_name: toolName,
        status: "failure",
        request,
        mode: "api",
        endpoint: config.endpoint,
        error: String(data.error ?? "API tool returned failure"),
        fallback_behavior: config.fallbackBehavior,
        raw_response: rawPayload
      };
    }

    return {
      tool_name: toolName,
      status: "success",
      request,
      result: (data.result ?? {}) as never,
      mode: "api",
      endpoint: config.endpoint,
      fallback_behavior: config.fallbackBehavior,
      raw_response: rawPayload
    };
  } catch (error) {
    return {
      tool_name: toolName,
      status: "failure",
      request,
      mode: "api",
      endpoint: config.endpoint,
      error: error instanceof Error ? error.message : "Unknown API error",
      fallback_behavior: config.fallbackBehavior
    };
  }
}
