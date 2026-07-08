import { buildDebriefUserMessage, DEBRIEF_SYSTEM } from "@keepsake/core/prompts/debrief";
import { NextResponse } from "next/server";
import { assertAiQuota, QuotaError, streamText } from "@/lib/ai/core";
import { fetchDebriefAggregate } from "@/lib/debrief/aggregate";
import { debriefInputSchema } from "@/lib/debrief/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a warm, private post-session note for the caregiver. A route handler (not a server
 * action) because the response body is a raw byte stream, not an RSC payload. `requireUser` is
 * the WRONG guard here — it redirects on no-auth, which makes no sense for a fetch() caller — so
 * auth is built inline: `createClient()` + `getUser()` returning a 401 JSON body instead.
 *
 * Response is `text/plain`, not `text/event-stream`: `streamText` (apps/web/src/lib/ai/core.ts)
 * forwards raw UTF-8 text-delta chunks, never SSE `data:` frames, so labelling it event-stream
 * would be a lie the client's plain ReadableStream reader doesn't need anyway.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = debriefInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  try {
    await assertAiQuota(supabase, "debrief");
  } catch (err) {
    const message =
      err instanceof QuotaError ? err.message : "The assistant is unavailable right now.";
    return NextResponse.json({ error: message }, { status: err instanceof QuotaError ? 429 : 503 });
  }

  const { data: aggregate, error } = await fetchDebriefAggregate(supabase, parsed.data.sessionId);
  if (error === "not_found") {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (error === "not_ended") {
    return NextResponse.json({ error: "The session has not ended yet." }, { status: 400 });
  }
  if (error) {
    return NextResponse.json({ error: "Could not load the session." }, { status: 500 });
  }

  const stream = streamText({
    kind: "debrief",
    system: DEBRIEF_SYSTEM,
    user: buildDebriefUserMessage(aggregate),
    maxTokens: 2048,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
