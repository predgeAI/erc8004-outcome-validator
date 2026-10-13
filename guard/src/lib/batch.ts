import raw from "../generated/batch.json";
import type { BundleData } from "./data";

/** Batch summary only (a few hundred bytes), so the first screen does not pull in the 145 bundled records. */
export const BATCH = raw as unknown as BundleData["batch"] & { mainnet: { verdicts: number; open: number } };
