// Small validation helpers shared by request and model-output validation.

import { ShapeError } from "./errors.mjs";

export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isTime = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

// Plain text: collapse control characters and whitespace runs to single spaces.
export function cleanText(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function requireText(value, path, maxChars, { allowEmpty = false } = {}) {
  if (typeof value !== "string") throw new ShapeError(`${path} must be a string`);
  const text = cleanText(value);
  if (!allowEmpty && text.length === 0) throw new ShapeError(`${path} must not be empty`);
  if (text.length > maxChars) throw new ShapeError(`${path} exceeds ${maxChars} characters`);
  return text;
}

export function requireId(value, path, maxChars) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxChars) {
    throw new ShapeError(`${path} must be a non-empty string up to ${maxChars} characters`);
  }
  return value;
}

export function requireArray(value, path, max, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw new ShapeError(`${path} must be an array`);
  if (value.length < min || value.length > max) {
    throw new ShapeError(min ? `${path} must contain ${min}–${max} items` : `${path} must contain at most ${max} items`);
  }
  return value;
}

export function optionalArray(body, key, max) {
  if (body[key] === undefined || body[key] === null) return [];
  return requireArray(body[key], key, max);
}

export function requireEnum(value, path, allowed) {
  if (!allowed.includes(value)) throw new ShapeError(`${path} must be one of ${allowed.join(", ")}`);
  return value;
}

/** Shortens model text to `max` characters on a word boundary, adding "…". */
export function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/** Keeps the first `maxWords` words of a label, adding "…" when shortened. */
export function clipWords(text, maxWords) {
  const words = text.split(" ");
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:.-]+$/, "")}…`;
}

/**
 * JSON for embedding untrusted data in a prompt. "<" is escaped so data can
 * never close the surrounding <data> delimiter.
 */
export const dataJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
