interface PortalRequestOptions {
  endpoint: string;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
}

function baseUrl() {
  return process.env.OSS_PORTAL_BASE_URL ?? process.env.OSS_SUPPORT_PORTAL_BASE_URL ?? "https://api.oss-support-portal.example.com";
}

function buildQuery(query?: PortalRequestOptions["query"]) {
  const params = new URLSearchParams();
  if (!query) return "";
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function callSupportPortal<T>(options: PortalRequestOptions): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`${baseUrl()}${options.endpoint}${buildQuery(options.query)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.OSS_PORTAL_API_KEY ? { Authorization: `Bearer ${process.env.OSS_PORTAL_API_KEY}` } : {}),
      ...(process.env.OSS_SUPPORT_PORTAL_API_KEY ? { Authorization: `Bearer ${process.env.OSS_SUPPORT_PORTAL_API_KEY}` } : {})
    },
    ...(method === "POST" ? { body: JSON.stringify(options.payload ?? {}) } : {})
  });

  if (!response.ok) {
    throw new Error(`Support Portal API request failed (${response.status})`);
  }

  return (await response.json()) as T;
}
