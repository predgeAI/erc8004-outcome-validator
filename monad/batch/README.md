# Batch: Predge verdicts on 145 real disputed Polymarket markets, on Monad testnet

Run on 2026-10-07. Every verdict is on chain in `PredgeAgentValidator`
[`0x8847…6e8A`](https://testnet.monadvision.com/address/0x884764736dBe1FD36291bDd3Afd50A75465F6e8A),
and every one is bound to a signed Predge record stored in [`records/`](records/).

## What each verdict says

The markets are an evenly spaced sample of disputed Polymarket markets from Predge's scan of UMA and
Polymarket logs on Polygon (1 Jan to 2 Oct 2026; see [`markets.json`](markets.json)). For each one:

- the signed Settlement Risk record comes from `https://api.predge.io/v1/settlement-risk/<market_id>`
  and is verified offline (ed25519, canonical JSON) before use;
- **request** (sent by an agent key): the claim an agent made if it acted on the proposal before
  settlement, "the final on-chain outcome equals the first disputed proposal";
  `requestHash = keccak256(canonical claim)`;
- **verdict** (sent by the Predge validator key): 100 if the on-chain resolution equals that
  proposal, 0 if the market settled differently; `responseHash = keccak256(signed record bytes)`.

## Results

| Metric | Value |
|---|---|
| Verdicts written | 145 (290 transactions: 145 requests + 145 verdicts), 0 failed |
| Read back and bound to the signed record | 145 / 145 (`verify-batch.mjs`) |
| Keys | 6 agent keys for requests, 1 validator key for verdicts |
| Requests, 6 keys in parallel | all 145 landed in 11 blocks (68960430 to 68960440), 3 s of chain time; up to 22 of our txs in one block |
| Verdicts, 1 key, pipelined nonces | 145 landed in 53 blocks (68960460 to 68960512), 16 s, paced by our own one-by-one RPC submission (15.9 s) |
| Whole run | 83 blocks, 25 s of chain time; 28.3 s wall clock from the first request to the last verdict receipt |
| Median send to receipt | request 3.1 s; verdict 9.7 s (queued behind our own submissions) |
| Gas per request | estimate 112,813, limit 124,094 |
| Gas per verdict | estimate 116,299, limit 127,928 |
| Gas charged in total | 36,543,190 (Monad charges the gas limit) |
| Fees | base fee 100 gwei, tip 1 gwei |
| Cost | 3.69 MON in total, 0.0255 MON per verdict (request + verdict) |

Full per-market data (proposal, outcome, score, both tx hashes and blocks): the results file in
[`INDEX`](INDEX). Funding and sweep transactions are listed there too.

## What we learned about Monad

- **Parallel senders help.** With no global mempool and nonces per sender, six agent keys put 145
  requests on chain in 11 blocks. A single key is limited by how fast one client submits.
- **Gas is charged on the limit.** Every limit is the measured estimate plus 10%; a looser limit
  costs real MON.
- **Reserve balance.** An account below 10 MON can only move value in an "emptying" transaction (no
  other transaction from it in the last 3 blocks). Our first attempt funded the six agent keys in a
  burst and five of the six transfers reverted. The script now funds one key at a time and waits 4
  blocks between transfers.

## MON budget

145 verdicts used 3.69 MON. A run of 300 verdicts needs about 7.6 MON (0.0255 per verdict plus
funding and margins); topping this batch up to 300 needs about 4 MON more.

## Reproduce

```bash
npm ci
node monad/batch/verify-batch.mjs                   # read-only: re-check all 145 verdicts on chain
node monad/batch/fetch-records.mjs                  # fetch and verify signed records for markets.json
node monad/batch/run-batch.mjs --n 150              # dry run: plan, gas, cost
CONFIRM_TESTNET=yes node monad/batch/run-batch.mjs --n 150 --send
```

Keys for a new run: the validator key in `~/.predge-monad/monad-testnet.env` (`PRIVATE_KEY`) must be
the validator of the `PredgeAgentValidator` you point `monad/deployment.json` at (deploy your own with
`monad/contracts/deploy.mjs`), and agent keys `AGENT_1_PRIVATE_KEY` to `AGENT_6_PRIVATE_KEY` go in
`~/.predge-monad/monad-metropolis.env`. Already answered markets are skipped, so a run can be resumed.
