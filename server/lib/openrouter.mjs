// One structured-output call to OpenRouter Chat Completions.
// Request and response shapes were checked against OpenRouter's OpenAPI spec
// (docs/openapi/openapi.yaml, read 2026-11-07):
//   - image parts: {type:"image_url", image_url:{url:"data:image/png;base64,…", detail}}
//   - web search:  tools:[{type:"openrouter:web_search", parameters:{…}}]
//   - citations:   message.annotations[{type:"url_citation", url_citation:{url,title,content}}]

import { analysisFailed } from "./errors.mjs";

/**
 * Calls OpenRouter and returns { data, annotations }. `data` is the parsed
 * JSON content. Throws ApiError(502) for timeouts, upstream errors, and
 * unusable output. Never includes upstream messages or keys in the error.
 */
export async function chatJson(config, {
  model = config.model,
  messages,
  schema,
  schemaName,
  timeoutMs = config.timeoutMs,
  maxTokens = 4096,
  temperature = 0.2,
  tools,
}) {
  const body = {
    model,
    messages,
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    provider: { require_parameters: true },
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  // Reasoning shares the max_tokens budget; exclude keeps it out of the response.
  if (config.reasoningEffort) body.reasoning = { effort: config.reasoningEffort, exclude: true };
  if (tools) body.tools = tools;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  let res;
  let payload;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "NOVA Lecture Visuals",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    payload = await res.json().catch(() => null);
  } catch (err) {
    if (controller.signal.aborted) throw analysisFailed("The analysis service timed out.", "timeout");
    throw analysisFailed("Could not reach the analysis service.", err?.cause?.code ?? "network");
  } finally {
    clearTimeout(timer);
  }

  // OpenRouter can report errors with a non-2xx status or inside a 200 body.
  const upstreamError = payload?.error ?? payload?.choices?.[0]?.error;
  if (!res.ok || upstreamError) {
    throw analysisFailed("The analysis service returned an error.", `upstream ${upstreamError?.code ?? res.status}`);
  }

  const choice = payload?.choices?.[0];
  if (choice?.finish_reason && choice.finish_reason !== "stop") {
    throw analysisFailed("The analysis service returned an incomplete result.", `finish_reason ${choice.finish_reason}`);
  }
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw analysisFailed("The analysis service returned no result.", "empty content");
  }

  let data;
  try {
    data = JSON.parse(stripCodeFence(content));
  } catch {
    throw analysisFailed("The analysis service returned unreadable output.", "bad json");
  }
  return { data, annotations: readAnnotations(choice.message.annotations) };
}

function stripCodeFence(text) {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : text;
}

/** URL citations the provider attached. These are the only URLs we ever return. */
function readAnnotations(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw) {
    const url = a?.type === "url_citation" ? a.url_citation?.url : undefined;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    const title = typeof a.url_citation.title === "string" ? a.url_citation.title : "";
    out.push({ url, title });
  }
  return out;
}
