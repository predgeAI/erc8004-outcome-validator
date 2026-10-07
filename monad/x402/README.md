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
| `runs/` | output of each agent run |

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
