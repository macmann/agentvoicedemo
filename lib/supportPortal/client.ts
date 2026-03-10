interface PortalOptions {
  endpoint: string;
  payload: Record<string, unknown>;
}

function baseUrl() {
  return process.env.OSS_SUPPORT_PORTAL_BASE_URL ?? "https://api.oss-support-portal.example.com";
}

export async function callSupportPortal<T>(options: PortalOptions): Promise<T> {
  const response = await fetch(`${baseUrl()}${options.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.OSS_SUPPORT_PORTAL_API_KEY ? { Authorization: `Bearer ${process.env.OSS_SUPPORT_PORTAL_API_KEY}` } : {})
    },
    body: JSON.stringify(options.payload)
  });

  if (!response.ok) {
    throw new Error(`Support Portal API request failed (${response.status})`);
  }

  return (await response.json()) as T;
}
