# @predge/settlement-risk

Check Predge before an agent acts on a prediction-market outcome. Read-only by default: no key, no
transaction. Not published to npm yet; in this repo `npm ci` at the root installs and builds it.

```ts
import { getSettlementRisk, getOnchainVerdict, isSafeToAct } from "@predge/settlement-risk";

const risk = await getSettlementRisk("1102588");     // signed record, verified
const verdict = await getOnchainVerdict("1102588");  // Monad testnet verdict, bound to signed bytes
const d = await isSafeToAct("1102588", { maxRisk: "resolved", outcome: "Under" });
```

| Function | What it checks |
|---|---|
| `getSettlementRisk(marketId, opts?)` | GET `https://api.predge.io/v1/settlement-risk/<id>`; ed25519 signature over `canonical` with a pinned key (`13fa3d18a369e6c7`, as listed at `api.predge.io/.well-known/predge-keys.json`); `sha256(canonical) == content_hash`; `payload` re-canonicalises to `canonical`; the record is for the market asked. Every returned field comes from the signed bytes. Throws `PredgeVerificationError` otherwise. |
| `getOnchainVerdict(marketId \| requestHash, opts?)` | `requestHash = keccak256(canonical claim)` as in `monad/batch/run-batch.mjs`; `getValidationStatus(requestHash)` on `PredgeAgentValidator` (Monad testnet); the verdict comes from Predge's validator; `responseHash == keccak256(signed record bytes)` and those bytes verify against the pinned key; the score agrees with the record (100 if the market settled as the disputed proposal, 0 if not). The bound record is looked up in the verdict board data file (untrusted, re-checked) or passed as `boundRecord`. |
| `isSafeToAct(marketId, { maxRisk, outcome, maxAgeSeconds, requireOnchainVerdict })` | both of the above; `safe` only if the risk level is within `maxRisk` (`resolved` < `ok` < `watch` < `caution`, default `resolved`), the final outcome equals `outcome` if given, the record is fresh enough, and any on-chain verdict is bound to verifiable signed evidence. Returns a one-line `reason`. |
| `@predge/settlement-risk/x402`: `quoteSettlementRisk`, `createMonadPayingFetch(account)`, `getSettlementRiskPaid` | x402 v2 on Monad testnet (USDC, Monad's facilitator), same client setup as `monad/x402/agent.mjs`. The account comes from your code; the SDK never reads keys. The paid response is verified like the free one, and its on-chain verdict is re-read from Monad, not taken from the server. |

Options common to all calls: `baseUrl`, `fetch`, `pinnedKeys`, `rpcUrl`, `contract`, `provider`.

```bash
npm test             # 13 offline tests on monad/batch/records/ fixtures (stub chain, no network)
npm run test:live    # read-only: api.predge.io and Monad testnet
```
