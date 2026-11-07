// HTTP helpers: JSON responses and size-capped JSON body parsing.

import { invalid } from "./errors.mjs";

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

export const sendError = (res, err) =>
  sendJson(res, err.status, { error: { code: err.code, message: err.message } });

const describeBytes = (n) => (n % (1024 * 1024) === 0 ? `${n / (1024 * 1024)} MB` : `${n / 1024} KB`);

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => invalid(`Request body exceeds ${describeBytes(maxBytes)}.`);
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(tooLarge());
      return;
    }
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > maxBytes) {
        over = true;
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!over) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

/** Reads a JSON object body or throws 400 INVALID_INPUT. */
export async function readJson(req, maxBytes) {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    req.resume();
    throw invalid("Content-Type must be application/json.");
  }
  const raw = await readBody(req, maxBytes);
  try {
    return JSON.parse(raw);
  } catch {
    throw invalid("Request body must be valid JSON.");
  }
}
