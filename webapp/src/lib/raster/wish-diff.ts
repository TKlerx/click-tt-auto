import { createHash } from "node:crypto";

export type WishValue = {
  homeWeekday?: string | null;
  hall?: string | null;
  startTime?: string | null;
  spielwochePref?: string | null;
  requestedRasterzahl?: string | number | readonly number[] | null;
  notes?: string | null;
};

const FIELDS = [
  "homeWeekday",
  "hall",
  "startTime",
  "spielwochePref",
  "requestedRasterzahl",
  "notes",
] as const;

export type WishDiffField = (typeof FIELDS)[number];

export function fingerprintWishValue(value: WishValue) {
  return createHash("sha256")
    .update(JSON.stringify(normalizeWishValue(value)))
    .digest("hex");
}

export function diffWishValues(left: WishValue, right: WishValue) {
  const normalizedLeft = normalizeWishValue(left);
  const normalizedRight = normalizeWishValue(right);
  return FIELDS.filter(
    (field) => normalizedLeft[field] !== normalizedRight[field],
  );
}

export function normalizeWishValue(value: WishValue) {
  return {
    homeWeekday: normalizeToken(value.homeWeekday),
    hall: normalizeText(value.hall),
    startTime: normalizeText(value.startTime),
    spielwochePref: normalizeToken(value.spielwochePref),
    requestedRasterzahl: normalizeRasterzahl(value.requestedRasterzahl),
    notes: normalizeText(value.notes),
  };
}

function normalizeToken(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

function normalizeText(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeRasterzahl(value: WishValue["requestedRasterzahl"]) {
  if (Array.isArray(value)) return value.map(String).join(",");
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return Array.from(value).map(String).join(",");
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(String).join(",")
      : normalizeText(value);
  } catch {
    return normalizeText(value);
  }
}
