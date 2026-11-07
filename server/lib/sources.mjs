// Tier 3 sources: material and note excerpts in requests, and citations in
// responses. Every citation must point at an ID from the same request, or at
// a URL the provider returned as an annotation. Anything else is dropped.

import { ShapeError } from "./errors.mjs";
import { LIMITS } from "./limits.mjs";
import { cleanText, clip, isPlainObject, isTime, requireArray, requireEnum, requireId, requireText } from "./text.mjs";

export const MATERIAL_KINDS = ["slides", "notes", "reading", "equation-sheet", "syllabus", "other"];

function uniqueId(seen, id, path) {
  if (seen.has(id)) throw new ShapeError(`${path} "${id}" is duplicated`);
  seen.add(id);
  return id;
}

export function validateMaterials(value, path = "materials") {
  const seen = new Set();
  return requireArray(value, path, LIMITS.materials).map((m, i) => {
    const p = `${path}[${i}]`;
    if (!isPlainObject(m)) throw new ShapeError(`${p} must be an object`);
    return {
      id: uniqueId(seen, requireId(m.id, `${p}.id`, LIMITS.segmentIdChars), `${p}.id`),
      materialId: requireId(m.materialId, `${p}.materialId`, LIMITS.segmentIdChars),
      title: requireText(m.title, `${p}.title`, LIMITS.excerptMetaChars),
      locator: requireText(m.locator, `${p}.locator`, LIMITS.excerptMetaChars, { allowEmpty: true }),
      kind: requireEnum(m.kind, `${p}.kind`, MATERIAL_KINDS),
      text: requireText(m.text, `${p}.text`, LIMITS.excerptChars),
    };
  });
}

export function validateNotes(value, path = "notes") {
  const seen = new Set();
  return requireArray(value, path, LIMITS.notes).map((n, i) => {
    const p = `${path}[${i}]`;
    if (!isPlainObject(n)) throw new ShapeError(`${p} must be an object`);
    if (n.startSec !== null && !isTime(n.startSec)) throw new ShapeError(`${p}.startSec must be a non-negative number or null`);
    return {
      id: uniqueId(seen, requireId(n.id, `${p}.id`, LIMITS.segmentIdChars), `${p}.id`),
      sessionId: requireId(n.sessionId, `${p}.sessionId`, LIMITS.segmentIdChars),
      sessionTitle: requireText(n.sessionTitle, `${p}.sessionTitle`, LIMITS.excerptMetaChars, { allowEmpty: true }),
      startSec: n.startSec,
      text: requireText(n.text, `${p}.text`, LIMITS.excerptChars),
    };
  });
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

/** JSON-schema fragment for a citation the model may emit. */
export function citationSchema(kinds) {
  const properties = {
    kind: { type: "string", enum: kinds },
    id: { type: "string", description: "The excerpt, segment, or web source id exactly as given." },
  };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

const normalizeUrl = (url) => url.trim().replace(/\/+$/, "");

/**
 * Context for citation filtering.
 * @param segments, materials, notes  arrays from the validated request
 * @param annotations  [{url,title}] from the provider (web pass only)
 * @param kinds        citation kinds this item may carry
 */
export function citationContext({ segments = [], materials = [], notes = [], annotations = [] }) {
  const web = new Map();
  const webById = new Map();
  for (const a of annotations) {
    const key = normalizeUrl(a.url);
    if (web.has(key)) continue;
    web.set(key, a);
    webById.set(`web${webById.size + 1}`, a);
  }
  return {
    segment: new Set(segments.map((s) => s.id)),
    material: new Set(materials.map((m) => m.id)),
    note: new Set(notes.map((n) => n.id)),
    web,
    webById,
  };
}

/** Web sources as data for a follow-up prompt: [{id:"web1", title}] (no URLs; the server maps ids back). */
export function webSourcesForPrompt(ctx) {
  return [...ctx.webById].map(([id, a]) => ({ id, title: cleanText(a.title ?? "") || hostOf(a.url) }));
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function webCitation(entry) {
  const title = cleanText(entry.title ?? "") || hostOf(entry.url);
  return { kind: "web", url: entry.url, title: clip(title, LIMITS.excerptMetaChars) };
}

/** Converts one model citation to a contract Citation, or null if it is not backed by the request. */
export function toCitation(raw, ctx, kinds) {
  if (!isPlainObject(raw) || !kinds.includes(raw.kind)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  switch (raw.kind) {
    case "lecture":
      return ctx.segment.has(id) ? { kind: "lecture", segmentId: id } : null;
    case "material":
      return ctx.material.has(id) ? { kind: "material", excerptId: id } : null;
    case "note":
      return ctx.note.has(id) ? { kind: "note", excerptId: id } : null;
    case "web": {
      // By source id from webSourcesForPrompt, or by an exact annotated URL.
      const entry = ctx.webById.get(id) ?? (typeof raw.url === "string" ? ctx.web.get(normalizeUrl(raw.url)) : undefined);
      return entry ? webCitation(entry) : null;
    }
    default:
      return null;
  }
}

const citationKey = (c) => `${c.kind}:${c.segmentId ?? c.excerptId ?? c.url}`;

/** Filters a model citation list: drops invented IDs and URLs, dedupes, caps. */
export function filterCitations(list, ctx, kinds, max = LIMITS.citationsPerItem) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const c = toCitation(raw, ctx, kinds);
    if (!c || seen.has(citationKey(c))) continue;
    seen.add(citationKey(c));
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** All provider annotations as web citations (used when a single item owns the whole web pass). */
export function annotationCitations(ctx, max = 3) {
  return [...ctx.web.values()].slice(0, max).map(webCitation);
}

/**
 * sourceMode = the lowest-priority source tier actually cited:
 * web if any web citation, else materials if any material citation, else
 * `fallback` ("lecture" for analyze, "materials" for assist).
 */
export function sourceModeOf(citations, fallback) {
  if (citations.some((c) => c.kind === "web")) return "web";
  if (citations.some((c) => c.kind === "material")) return "materials";
  return fallback;
}
