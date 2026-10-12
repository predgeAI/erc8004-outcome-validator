# Predge settlement watch: a Chainlink CRE workflow

A [Chainlink Runtime Environment](https://docs.chain.link/cre) workflow that answers one question
for an agent before it acts on a Polymarket outcome: **is a dispute open, and does the Predge verdict
on Monad agree with the newest signed Predge record for this market?**

```
 cron (every 10 min, a list of markets)        HTTP trigger {"market_id": "1112268"}
                 \                              /
                  v                            v
   1  HTTP, every DON node      GET api.predge.io/v1/settlement-risk/<market_id>
                                verify ed25519 (pinned Predge key) + sha256(canonical) == content_hash
                                consensus: identical on every field
   2  EVM read, Monad testnet   PredgeAgentValidator.getValidationStatus(requestHash)   0x8847…6e8A
   3  decide                    consistent | conflict | no-onchain-verdict | unsettled | open-dispute
   4  EVM write (optional)      DON-signed report -> CRE forwarder -> PredgeSettlementWatch.onReport
```

Result, per market:
`{market_id, risk_level, open_dispute, onchain_verdict, expected_verdict, status, request_hash, onchain_response_hash, content_hash}`.

## Why it matters for agents on Monad

Predge has 145 verdicts on Monad testnet for real disputed Polymarket markets
([`monad/batch/`](../monad/batch/README.md)): for each market, an agent's claim "the final on-chain
outcome equals the first disputed proposal" and Predge's verdict (100 or 0), bound to a signed
record. An agent that settles a trade, pays out, or releases a bond on the strength of that verdict
needs two more things at the moment it acts:

- **Is the market still contested?** A dispute blocks a proposal. The workflow reads `open_dispute`
  and `risk_level` from a fresh signed record, not from a cached copy.
- **Does the chain still say what the evidence says?** The workflow recomputes the verdict from the
  newest signed record and compares it with the on-chain verdict. A mismatch is reported as
  `conflict` (and the consumer contract emits a `Conflict` event).

CRE adds what a single script cannot: every DON node fetches and verifies the signed record, the
nodes must agree field by field, and the on-chain result is a report signed by the DON. A contract
or agent on Monad can then check one storage slot (`safeToAct(requestHash)`) instead of trusting
whoever ran the check.

## What is in here

| Path | What it is |
|---|---|
| `settlement-watch/workflow.ts` | The workflow: cron + HTTP triggers, HTTP fetch with consensus, EVM read on Monad testnet, optional EVM write. |
| `settlement-watch/logic.ts` | Pure verification and decision logic: canonical JSON, ed25519 (`@noble/curves`, strict RFC 8032), sha256, requestHash derivation (same as `monad/batch/run-batch.mjs`), decision. |
| `settlement-watch/*.test.ts` | 26 unit tests, plus a live run (`live.test.ts`) against the real API and Monad RPC. |
| `settlement-watch/fixtures/` | Two signed records as returned by api.predge.io on 12 Oct 2026. |
| `settlement-watch/config.staging.json` | Markets, pinned Predge key, Monad contract and validator, write target. |
| `contracts/PredgeSettlementWatch.sol` | Consumer contract: accepts reports only from the CRE forwarder, stores the latest result per requestHash, `safeToAct(requestHash)`. |
| `contracts/deploy.mjs` | Compile and (with your own key) deploy the consumer to Monad testnet. Dry run by default. |

## What was run, and what it printed

### Unit tests (no network)

```
$ cd cre/settlement-watch && bun install && bun test
 26 pass
 3 skip      (live.test.ts, needs LIVE=1)
 0 fail
Ran 29 tests across 3 files.
```

They cover: a real record verifies; a record edited after signing, a corrupted signature, a valid
signature from a different key, a wrong `content_hash`, an unsigned field added to `payload`, and a
record for a different market are all rejected; the requestHash derived from both the 7 Oct batch
record and today's re-issued record equals the one on chain; every decision branch; the report the
workflow writes decodes back to the result; a tampered API response stops the run before any read or
write.

### Workflow compiles to WASM with the CRE CLI

```
$ cd cre && cre workflow build ./settlement-watch --target staging-settings
  Compiling workflow...
✓ Workflow compiled successfully
  Binary hash: 00cbf96ad6383dcf5b52ce1472dd68559112a60a07cb4e9d349d8810d847f2be
✓ Build output written to cre/settlement-watch/binary.wasm
```

(CRE CLI v1.30.0, `@chainlink/cre-sdk` 1.23.0.)

### Live run: real API, real Monad testnet, CRE SDK test runtime

`cre workflow simulate` needs a logged-in CRE account (see below), so the same workflow code was run
in the CRE SDK test runtime with the real responses: the signed records from api.predge.io and
`eth_call` results from `https://testnet-rpc.monad.xyz` at the finalized block. This is **not** the
CRE simulator: there is one "node", and consensus is the SDK's local implementation.

```
$ LIVE=1 bun test --timeout 60000 live.test.ts        (12 Oct 2026)
[1004831] signed record verified (ed25519 + sha256), consensus reached: risk_level=resolved open_dispute=false outcome=No proposal=No content_hash=0x022690914ee6a0843235939c2ebd23d06dd1a6cefecfd84943bd09ae991f164f
[1004831] Monad testnet getValidationStatus(0xf678c0cc8da4fd896ff5ab5fa56a931bffb59ec868e0cee4cb38e616d1fa2018): validator=0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9 response=100 tag=predge:settlement-risk-v1 lastUpdate=1791373161
[1004831] result {"market_id":"1004831","risk_level":"resolved","open_dispute":false,"onchain_verdict":100,"expected_verdict":100,"status":"consistent","request_hash":"0xf678c0cc8da4fd896ff5ab5fa56a931bffb59ec868e0cee4cb38e616d1fa2018","onchain_response_hash":"0x98eac14b0b9410336e819c9b51a56f76020a2eb92112749ed8d0cb6dfc373c7f","content_hash":"0x022690914ee6a0843235939c2ebd23d06dd1a6cefecfd84943bd09ae991f164f"}
[1004831] no receiver configured: report not written on chain
[1112268] signed record verified (ed25519 + sha256), consensus reached: risk_level=resolved open_dispute=false outcome=Under proposal=Over content_hash=0x31253c5fd8789422d56b6adb2cf499a5d15a669855c53a2685d545e546897e83
[1112268] Monad testnet getValidationStatus(0x9ccefa67ebdc1f3f4ee31d17616a37be2546deca5dd2847523942f1e7e396e4a): validator=0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9 response=0 tag=predge:settlement-risk-v1 lastUpdate=1791373163
[1112268] result {"market_id":"1112268","risk_level":"resolved","open_dispute":false,"onchain_verdict":0,"expected_verdict":0,"status":"consistent","request_hash":"0x9ccefa67ebdc1f3f4ee31d17616a37be2546deca5dd2847523942f1e7e396e4a","onchain_response_hash":"0xc762be90c1831cf043a2f11bbc1ab1e6913cd465496a8138d87dc5897fc41220","content_hash":"0x31253c5fd8789422d56b6adb2cf499a5d15a669855c53a2685d545e546897e83"}
[1112268] no receiver configured: report not written on chain
 2 pass
```

Market 1004831 settled as disputed (No, verdict 100); market 1112268 settled differently from the
disputed proposal (proposal Over, outcome Under, verdict 0). Both on-chain verdicts and response
hashes match `monad/batch/results-2026-10-07T11-39-11-867Z.json`. `content_hash` differs on every
run because Predge signs a fresh record (new `issued_at`, `checked_at`) for each request.

### Consumer contract

`node cre/contracts/deploy.mjs` compiles it (solc 0.8.26, 3,605 bytes) and stops (dry run). It was
also checked with `eth_call` and a code override on Monad testnet: `onReport` from the
MockKeystoneForwarder with a report encoded like the workflow's succeeds, from any other sender it
reverts with `NotForwarder`, and `supportsInterface(0x805f2132)` (IReceiver) is true. It is deployed; see the on-chain report below.

### `cre workflow simulate` (CRE CLI 1.30.0, 12 Oct 2026)

Cron trigger over both markets:

```
$ cre workflow simulate ./settlement-watch --target staging-settings --non-interactive --trigger-index 0
[USER LOG] [1004831] signed record verified (ed25519 + sha256), consensus reached: risk_level=resolved open_dispute=false outcome=No proposal=No
[USER LOG] [1004831] Monad testnet getValidationStatus(0xf678c0cc…2018): validator=0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9 response=100 tag=predge:settlement-risk-v1
[USER LOG] [1004831] result {"market_id":"1004831","risk_level":"resolved","onchain_verdict":100,"expected_verdict":100,"status":"consistent",…}
[USER LOG] [1112268] signed record verified (ed25519 + sha256), consensus reached: risk_level=resolved open_dispute=false outcome=Under proposal=Over
[USER LOG] [1112268] Monad testnet getValidationStatus(0x9ccefa67…6e4a): validator=0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9 response=0 tag=predge:settlement-risk-v1
[USER LOG] [1112268] result {"market_id":"1112268","risk_level":"resolved","onchain_verdict":0,"expected_verdict":0,"status":"consistent",…}
✓ Workflow Simulation Result
```

HTTP trigger with `{"market_id":"1112268"}` gives the same result for that market.

### On-chain report on Monad testnet

The consumer `PredgeSettlementWatch` is deployed at
[`0x1518ad21cF96Ed0429D022b038263e68fD50A90c`](https://testnet.monadvision.com/address/0x1518ad21cF96Ed0429D022b038263e68fD50A90c)
(tx `0x69b4e66a…7eef`, forwarder = MockKeystoneForwarder `0xB9F7…D192`). With the HTTP trigger and
`--broadcast`, the simulator wrote the DON-signed report through the forwarder:

```
[USER LOG] [1112268] report written to 0x1518ad21cF96Ed0429D022b038263e68fD50A90c on monad-testnet, tx 0xfc7af2fc6b0b9ad0f21e55bb0182df3a48f5379183f1f743c32ff466993e7d2a
```

[Tx 0xfc7a…7d2a](https://testnet.monadvision.com/tx/0xfc7af2fc6b0b9ad0f21e55bb0182df3a48f5379183f1f743c32ff466993e7d2a):
status 1, block 70482662, `Watched` emitted by the consumer. `safeToAct(0x9ccefa67…6e4a)` now returns
`true` on chain.

To repeat it:

```bash
cre login
cd cre/settlement-watch && bun install && cd ..
cre workflow simulate ./settlement-watch --target staging-settings --non-interactive --trigger-index 0
# --broadcast needs CRE_ETH_PRIVATE_KEY with a little testnet MON (gasLimit 300000 in the config)
cre workflow simulate ./settlement-watch --target staging-settings --non-interactive \
  --trigger-index 1 --http-payload '{"market_id":"1112268"}' --broadcast
```

The CLI's WASM runtime has no `URL` global, so `apiBase` is validated with a regex instead of
`z.string().url()`.

## Not run yet: needs deploy access

### 3. Deployment to a DON

`cre workflow deploy` needs CRE deploy access for the account, the production KeystoneForwarder
(`deploy.mjs --forwarder 0xF834…4482`, or `setForwarder`), and `authorizedKeys` on the HTTP trigger
(it is `{}` here, which is only for simulation).

## Limitations, stated plainly

- **No `cre workflow simulate` output yet.** The output above is from the CRE SDK test runtime with
  real data, not from the CRE simulator. It becomes a simulator run once `cre login` works.
- **No on-chain report yet.** The write path is implemented and unit tested (the report bytes decode
  to the result), and the consumer contract is checked by `eth_call`, but nothing has been broadcast.
- **Consensus on `content_hash` relies on the HTTP cache.** Predge re-signs every response, so two
  independent fetches give two different (both valid) records. The request sets
  `cacheSettings: {store: true, maxAge: "60s"}` so DON nodes share one response. If the nodes do not
  share it, the identical-field consensus fails and the run errors: it fails closed rather than
  reporting a hash the nodes did not agree on.
- **The on-chain `responseHash` is bound to the 7 Oct record**, `keccak256` of that record's
  `canonical` (kept in `monad/batch/records/`). The workflow verifies today's re-issued record and
  compares what it implies (the verdict 100 or 0), not the bytes; it reports both hashes so the 7 Oct
  binding can still be checked offline with `monad/batch/verify-batch.mjs`.
- **All 145 batch markets are settled**, so a live run shows `risk_level=resolved` and
  `status=consistent`. The `open-dispute`, `conflict`, `no-onchain-verdict` and `unsettled` paths
  are covered by unit tests, not by a live market.
- `risk_level` and `recommendation` are Predge's reading of chain facts, not advice; the workflow
  passes `risk_level` through and does not reinterpret it.
- Trust anchors are in config: the Predge ed25519 public key
  (`13fa3d18…52d9`) and the validator address whose verdicts count
  (`0x9F0A…9Fc9`, from `monad/deployment.json`). A verdict from any other address is ignored.

## Toolchain

CRE CLI v1.30.0 (`~/.cre/bin/cre`), Bun 1.3, `@chainlink/cre-sdk` 1.23.0, viem 2.34.0,
`@noble/curves` 2.0.1, `@noble/hashes` 2.0.1, zod 3.25.76; solc 0.8.26 and ethers 6 from the repo
root `package.json` for the contract.
