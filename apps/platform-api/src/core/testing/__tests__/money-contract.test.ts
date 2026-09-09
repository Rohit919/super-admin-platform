/**
 * Money contract tests (Phase 6B).
 *
 * The currency allow-list and minor-unit amount schema are the boundary that
 * enforces valid money — the DB columns are plain string/int, so this contract
 * is where invalid currencies and amounts are actually rejected.
 */
import { describe, it, expect } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  Currency,
  AmountMinor,
  Money,
  isSupportedCurrency,
  SUPPORTED_CURRENCIES,
} from "@app/api-contracts";

describe("Money contracts (Phase 6B)", () => {
  it("accepts allow-listed ISO-4217 currencies", () => {
    expect(Value.Check(Currency, "USD")).toBe(true);
    expect(Value.Check(Currency, "JPY")).toBe(true);
    expect(Value.Check(Currency, "NGN")).toBe(true);
  });

  it("rejects unsupported / malformed currency codes", () => {
    expect(Value.Check(Currency, "usd")).toBe(false); // case-sensitive
    expect(Value.Check(Currency, "XYZ")).toBe(false); // not allow-listed
    expect(Value.Check(Currency, "US")).toBe(false); // wrong length
    expect(Value.Check(Currency, "")).toBe(false);
  });

  it("isSupportedCurrency guards at runtime", () => {
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency("BTC")).toBe(false);
    // Every allow-listed code passes its own guard.
    for (const c of SUPPORTED_CURRENCIES) {
      expect(isSupportedCurrency(c)).toBe(true);
    }
  });

  it("AmountMinor requires a non-negative integer", () => {
    expect(Value.Check(AmountMinor, 0)).toBe(true);
    expect(Value.Check(AmountMinor, 1099)).toBe(true);
    expect(Value.Check(AmountMinor, -1)).toBe(false);
    expect(Value.Check(AmountMinor, 10.5)).toBe(false); // not an integer
  });

  it("Money pairs a valid amount with a valid currency", () => {
    expect(Value.Check(Money, { amountMinor: 2500, currency: "USD" })).toBe(
      true,
    );
    expect(Value.Check(Money, { amountMinor: 2500, currency: "XYZ" })).toBe(
      false,
    );
    expect(Value.Check(Money, { amountMinor: -5, currency: "USD" })).toBe(
      false,
    );
  });
});
