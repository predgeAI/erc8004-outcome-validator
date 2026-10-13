// Binary (cash-or-nothing) option maths for "price above K at time T" markets.

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const pdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;
/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, |err| < 1.5e-7). */
export function cdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

const HOURS_PER_YEAR = 24 * 365;

/** Annualised close-to-close volatility from candles of `resolutionSec`. */
export function realizedVol(candles, resolutionSec = 3600, floor = 0) {
  const closes = candles.map((c) => c.c).filter((x) => x > 0);
  if (closes.length < 3) return floor;
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  const perYear = (HOURS_PER_YEAR * 3600) / resolutionSec;
  return Math.max(floor, Math.sqrt(v * perYear));
}

/**
 * P(S_T > K) and dP/dS for a driftless lognormal price.
 * Returns delta per $1 of payout, in units of the underlying (e.g. BTC per share).
 */
export function binaryAbove({ spot, strike, vol, years }) {
  if (years <= 0) return { prob: spot > strike ? 1 : 0, deltaPerShare: 0, d2: spot > strike ? Infinity : -Infinity };
  const sd = vol * Math.sqrt(years);
  const d2 = (Math.log(spot / strike) - 0.5 * sd * sd) / sd;
  return { prob: cdf(d2), deltaPerShare: pdf(d2) / (spot * sd), d2 };
}

/**
 * Target perp position (signed, base units) that offsets a Polymarket position's price exposure.
 * A YES holder is long the underlying, so the hedge is short; a NO holder is the opposite.
 */
export function targetHedge({ side, shares, spot, strike, vol, years, maxHedgeUsd }) {
  const b = binaryAbove({ spot, strike, vol, years });
  const exposure = (side === "Yes" ? 1 : -1) * shares * b.deltaPerShare; // underlying units
  let target = -exposure;
  let capped = false;
  if (Math.abs(target) * spot > maxHedgeUsd) { target = Math.sign(target) * maxHedgeUsd / spot; capped = true; }
  return { ...b, exposure, target, capped, hedgeUsd: Math.abs(target) * spot, dollarDeltaPer1Pct: exposure * spot * 0.01 };
}

export const YEAR_MS = HOURS_PER_YEAR * 3600 * 1000;
