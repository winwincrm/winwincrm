/**
 * Extract a useful numeric amount for reporting without changing the value the
 * user imported. The original text is stored separately in payload.amount_raw.
 */
export function parseAmountNumber(raw: unknown): number | undefined {
  const source = String(raw ?? "").trim();
  if (!source || !/\d/.test(source)) return undefined;

  const token = source.match(/[+-]?\d[\d\s.,]*(?:[kKmM])?/);
  if (!token) return undefined;

  let value = token[0].replace(/\s+/g, "");
  const suffix = value.match(/[kKmM]$/)?.[0]?.toLowerCase();
  if (suffix) value = value.slice(0, -1);

  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? /,/g : /\./g;
    value = value.replace(thousands, "").replace(decimal, ".");
  } else if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(value)) {
    value = value.replace(/[.,]/g, "");
  } else {
    value = value.replace(",", ".");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (suffix === "k") return parsed * 1_000;
  if (suffix === "m") return parsed * 1_000_000;
  return parsed;
}

export function amountDisplayValue(
  amount: unknown,
  payload: Record<string, unknown> | null | undefined,
): unknown {
  const raw = payload?.amount_raw;
  return raw != null && String(raw).trim() !== "" ? raw : (amount ?? payload?.amount);
}
