import { NextResponse } from "next/server";

type GenerateRequest = {
  prompt: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;
    if (!body?.prompt?.trim()) {
      return NextResponse.json(
        { error: "Missing prompt." },
        { status: 400 }
      );
    }

    const apiUrl = process.env.LLM_API_URL;
    const apiKey =
      request.headers.get("x-llm-key") ?? process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json(
        {
          error:
            "LLM_API_URL and LLM_MODEL must be set. Provide LLM_API_KEY in env or via the UI input.",
        },
        { status: 500 }
      );
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You write JavaScript only. Return only the function definition for solution(n) with no extra text.",
          },
          { role: "user", content: body.prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `LLM request failed: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const code = data?.choices?.[0]?.message?.content;

    if (!code) {
      return NextResponse.json(
        { error: "LLM response missing code content." },
        { status: 502 }
      );
    }

    return NextResponse.json({ code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
