import { NextResponse } from "next/server";

async function fetchAssemblyToken(apiKey: string) {
  const params = new URLSearchParams({
    // Window to open the websocket after minting the token (max 600).
    expires_in_seconds: "600",
    // How long one live listening session may run once connected.
    max_session_duration_seconds: "3600",
  });

  const response = await fetch(
    `https://streaming.assemblyai.com/v3/token?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: apiKey,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AssemblyAI token HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const apiKey = process.env.ASSEMBLY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Retry once — transient "fetch failed" / DNS blips are common locally.
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = await fetchAssemblyToken(apiKey);
        return NextResponse.json(data);
      } catch (err) {
        lastError = err;
        console.warn(`[getToken] attempt ${attempt} failed:`, err);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "Failed to get token";
    return NextResponse.json({ error: message }, { status: 500 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get token";
    console.error("Token fetch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
