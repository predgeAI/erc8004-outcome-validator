# x402 on Monad testnet, through Monad's facilitator

An agent pays 0.001 USDC per call on Monad testnet for Predge's signed Settlement Risk record, then
checks the evidence before it acts. Payment is x402 v2, scheme `exact` (EIP-3009
`transferWithAuthorization`), network `eip155:10143`, asset Monad testnet USDC
`0x534b2f3A21130d7a60830c2Df862319e593943A3`, facilitator `https://x402-facilitator.molandak.org`
(the one in Monad's x402 guide). The agent holds USDC and no MON: the facilitator submits the
transfer and pays the gas.

| File | What |
|---|---|
| `server.mjs` | x402 resource server (`@x402/express` 2.28.0), `GET /v1/settlement-risk/:market` at $0.001; returns the signed record and, when Predge has one, the on-chain verdict from `PredgeAgentValidator` with the exact signed record it is bound to. Holds no key. |
| `agent.mjs` | paying agent (`@x402/fetch`): gets the 402, signs the authorization, pays, verifies ed25519, verifies `responseHash == keccak256(signed record)` against Monad, finds the USDC `Transfer` in the settlement receipt, then decides |
| `spend-semantics.mjs` | two optional off-chain spend fields: `redeem_count` (seller side) and `consumed` (buyer side). Zero dependencies, no contract change. See below. |
| `runs/` | output of each agent run |

## Spend semantics (`redeem_count` / `consumed`)

Predge's receipt proves *what was bought* and *that it was paid for*. Two questions it does
not answer, and which no receipt spec currently answers:

1. **Did the buyer actually use the result?** An agent can pay, receive a valid record, and
   never reference it downstream — budget exhausted, a downstream step discarded it, a retry
   superseded it. Real cost, zero downstream effect, indistinguishable today from a used
   result.
2. **How many times was the same payment proof redeemed?** x402 permits multiple `complete`
   transitions for one proof. In-flight dedup prevents *concurrent* replay but records
   nothing.

`spend-semantics.mjs` adds both as optional, off-chain fields. **No contract changes, no new
dependencies, no change to the attestation or the verdict path.**

| Field | Side | Meaning |
|---|---|---|
| `payment.redeem_count` | seller | How many times the seller **saw** this payment proof. Counted as *attempts* — a replay, a retry or a refused second redemption all increment. Under `exact` (EIP-3009) the nonce is single-use, so a *completed* second redemption is structurally impossible; counting attempts is what makes `> 1` meaningful instead of reading as broken forever at `1`. |
| `result.consumed` | buyer | `yes` / `no` / `unknown`, default `unknown`. Whether the buyer runtime referenced the paid result downstream. Attested by the **buyer**, never by the seller: the seller has no observation of the buyer's runtime, so a seller-written `consumed` is unfalsifiable. Absence of a downstream reference is **not** evidence of idle spend. |

The server counts redemptions before it writes the response, so a refused retry is still
recorded, and surfaces the count as `spend` in the JSON body plus an
`x-predge-redeem-count` header. The agent attests `consumed` from the decision it derived,
and both fields land in `runs/*.json`.

The counter is in-process (`Map`). A multi-instance deployment needs the same interface over
Redis; the module does not pretend otherwise.

Field names follow [gates-spec v0.1](https://github.com/ruiruii/gates-spec) (Apache-2.0). If
Predge prefers different names, we're happy to adopt them — the objective is one vocabulary,
not a new project.

```bash
npm ci
PAY_TO=0xYourAddress node monad/x402/server.mjs &
node monad/x402/agent.mjs 2169995          # payer key: X402_PAYER_PRIVATE_KEY, see the script header
```

Testnet USDC for the payer: https://faucet.circle.com (Monad Testnet), or Circle's faucet API.

## Runs

First paid call, 2026-10-07, market 2169995: unpaid request returned HTTP 402 with one `accepts`
entry (eip155:10143, 1000 atomic USDC); the paid request returned 200 in 6.7 s including verify and
settle; settlement tx
[`0xa41ba1f9…`](https://testnet.monadvision.com/tx/0xa41ba1f995eb229c322d5bc34c4d69550395356d94459c0706ba065b8da99cea)
(block 68959337, status 1, 0.001 USDC payer to payTo, gas paid by the facilitator signer
`0x7f6a…Db86`). Record signature verified. Run file:
[`runs/x402-2026-10-07T11-33-43-407Z.json`](runs/x402-2026-10-07T11-33-43-407Z.json).

Second paid call, 2026-10-07, market 1137824 (one of the batch markets): paid in 6.7 s, settlement
tx
[`0x4e52243b…`](https://testnet.monadvision.com/tx/0x4e52243b505c28511dd6740102496afa062006f510d16e5fc09f144085d56a3e)
(block 68961131). The response carried Predge's on-chain verdict 0 for this market (the disputed
proposal was Under, the market settled Over; verdict tx
[`0xf9cc82ee…`](https://testnet.monadvision.com/tx/0xf9cc82eee06ab10ea7cce11e0a800beb8f6a80a5785a1d7d4cba7d0844c3c016)),
and the agent checked on Monad that its `responseHash` equals keccak256 of the signed record. Run
file: [`runs/x402-2026-10-07T11-42-44-822Z.json`](runs/x402-2026-10-07T11-42-44-822Z.json).

Not done: the production API at api.predge.io does not offer Monad as a payment network yet; this
demo server is a separate process that serves the same signed records.
