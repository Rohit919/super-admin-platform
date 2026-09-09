import { Type, type Static } from "@sinclair/typebox";

/**
 * Money contracts (Phase 6B).
 *
 * Money is represented as an INTEGER amount in the currency's MINOR unit
 * (`amountMinor` / `priceMinor`) plus an ISO-4217 `currency` code — never a
 * float. "Minor" (not "cents") because not every currency has a 1/100 subunit
 * (e.g. JPY has no minor unit in normal usage).
 *
 * This module is the single source of truth for the currency allow-list. The
 * API validates `currency` against it at the boundary; the database column is a
 * plain string, so this contract is where the constraint is actually enforced.
 */

/**
 * ISO-4217 currency codes accepted by the platform. Intentionally a curated
 * allow-list (not "any 3 letters") so an invalid/typo'd code is rejected at the
 * boundary. Extend deliberately as new markets are supported.
 */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "JPY",
  "CNY",
  "INR",
  "SGD",
  "HKD",
  "AED",
  "SAR",
  "ZAR",
  "NGN",
  "KES",
  "GHS",
  "EGP",
  "BRL",
  "MXN",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** Runtime guard: is a string a supported ISO-4217 currency code? */
export function isSupportedCurrency(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/**
 * TypeBox schema for a currency code. Uses a literal union of the allow-list so
 * ajv rejects unsupported codes at the request boundary (not just any string).
 */
export const Currency = Type.Union(
  SUPPORTED_CURRENCIES.map((c) => Type.Literal(c)),
  {
    description: "ISO-4217 currency code (allow-listed).",
  },
);
export type Currency = Static<typeof Currency>;

/**
 * A monetary amount in the currency's minor unit. Non-negative integer — the
 * minor unit is the smallest indivisible amount for the currency, so it is
 * always a whole number. Callers needing signed values (e.g. adjustments)
 * should compose their own schema.
 */
export const AmountMinor = Type.Integer({
  minimum: 0,
  description:
    "Amount in the currency's minor unit (integer; e.g. 1099 = USD $10.99, 1000 = JPY ¥1000).",
});
export type AmountMinor = Static<typeof AmountMinor>;

/**
 * A money value pairing a minor-unit amount with its currency. Use in request
 * bodies where an amount is supplied (e.g. recording a payment).
 */
export const Money = Type.Object({
  amountMinor: AmountMinor,
  currency: Currency,
});
export type Money = Static<typeof Money>;
