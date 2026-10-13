# Predge indexer on Monad testnet (Envio HyperIndex)

Hosted on Envio Cloud as `predgeai/predge-validator` (branch `main`, root `./indexer`), syncing Monad mainnet (chain 143) and Monad testnet (10143) over HyperSync.

An [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) indexer for every Predge
contract on Monad testnet (chain 10143). It turns the raw events into a GraphQL API: verdicts by
market, by agent and by registry, bonded verdicts and slashes, the escrow lifecycle of each job, and
pay-per-call receipts, with running aggregates kept up to date as new blocks arrive.

## What it indexes

| Contract | Address | Events |
|---|---|---|
| `PredgeAgentValidator` (Predge's ERC-8004 validation registry) | `0x884764736dBe1FD36291bDd3Afd50A75465F6e8A` | `ValidationRequest`, `ValidationResponse`, `ValidatorUpdated` |
| ERC-8004 `ValidationRegistry` (reference deployment, shared) | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `ValidationRequest`, `ValidationResponse`, filtered to Predge's validator `0x9F0A…9Fc9` |
| ERC-8004 `IdentityRegistry` (reference deployment, shared) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `Registered`, filtered to Predge's owner key |
| `PredgeValidatorBond` (main) | `0x0fE4D5fF3f4392bEC36c8003079E31102a403E84` | `Committed`, `Scored`, `Slashed`, `Reclaimed` |
| `PredgeValidatorBond` (slash-demo instance, [`monad/slash/`](../monad/slash/README.md)) | `0x95652b86c10Eb0E012b22E08dBC98481d4a19Bc2` | same |
| `AgentJob` | `0x34F1ef2f39Bfdd6c10Fcaa02f5B257A5dB2e93E9` | `JobCreated`, `Submitted`, `Completed`, `Rejected` |
| `PredgeSettlement` | `0xf4EE0Af65804D5754E59316b3DBB53D5c3AeeeF9` | `Paid` (from `payForRoute`), `Withdrawn` |

Indexing starts at block **68349040**, the `PredgeAgentValidator` deploy transaction in
[`monad/deployment.json`](../monad/deployment.json) and the earliest Predge contract on Monad
testnet. Event signatures are copied from the Solidity sources in
[`monad/contracts/`](../monad/contracts/); the ERC-8004 registry topics were checked against the
smoke-run receipts on chain (`ValidationResponse(address,uint256,bytes32,uint8,string,bytes32,string)`
= `0xafddf629…`, `Registered(uint256,string,address)` = `0xca52e62c…`).

### Entities ([`schema.graphql`](schema.graphql))

| Entity | One row per | Notes |
|---|---|---|
| `ValidationRequest` | request, per registry | `requester` = the agent key that sent it; `marketId` parsed from `pm:<id>` or `…/pm-<id>-…` request URIs |
| `Verdict` | `ValidationResponse` event | `requestHash`, `agent`, `agentId`, `validator`, `score`, `responseHash`, `tag`, `marketId`, `leadTimeSeconds` (request to verdict), `block`, `tx`, `timestamp`; linked to its `request` |
| `Bond` | bonded verdict (bond contract + requestHash) | stake, committed `expected`, `score`, `status` (open / scored / slashed / reclaimed), `challenger`, `deliveredHash`, slashed amount; linked to its `job` (the bond contract requires `job.specHash == requestHash`) |
| `Job` | AgentJob escrow | client, provider, evaluator, escrow, `specHash`, `deliverable`, `status` (open / submitted / completed / rejected), paid / refunded, all four tx hashes |
| `Receipt` | `payForRoute` payment | payer, `route` and `routeText` (known routes are keccak256 of the path, e.g. `/v1/settlement-risk`), amount, `meta` |
| `AgentIdentity` | ERC-8004 agent registered by Predge's key | |
| `VerdictStats` | `global`, `PredgeAgentValidator`, `ERC8004ValidationRegistry` | totals, score buckets (0, 1–49, 50–99, 100), bonds committed / scored / slashed / reclaimed, MON staked and slashed, jobs, escrow, receipts |
| `AgentStats` | agent address | requests, verdicts received, score 100 / 0 / other, average score (x100) |
| `MarketStats` | Polymarket market id | requests, verdicts, latest score and tx |

Amounts are in wei (MON has 18 decimals). Addresses are lowercase.

## What synced (local run, 12 Oct 2026)

Synced from block 68349040 to the chain head (70463717) and kept following it.

| | Count |
|---|---|
| Events processed | 328 |
| `Verdict` from `PredgeAgentValidator` | **148** = 145 batch verdicts (tag `predge:settlement-risk-v1`, 7 Oct) + 3 smoke-run verdicts (two on 5 Oct, one on 12 Oct) |
| `Verdict` from the ERC-8004 reference registry (Predge validator) | 3 (agent ids 2003, 2004, 2220) |
| Score buckets, all registries | 108 at 100, 43 at 0 (batch alone: 102 / 43, as in the batch results file) |
| `Bond` | 4 committed and scored, **1 slashed** (slash-demo instance, job 3), 0.04 MON staked in total, 0.01 MON slashed |
| `Job` | 4 (3 completed, 1 left at submitted: the slash demo) |
| `Receipt` | 3 `payForRoute` payments on `/v1/settlement-risk`, 0.001 MON each |

## Run it locally

Needs Node.js 22+, pnpm and Docker Desktop running.

```bash
cd indexer
pnpm install
pnpm dev            # = envio dev: starts Postgres + Hasura in Docker, runs codegen, indexes
```

GraphQL (Hasura) is at http://localhost:8080/v1/graphql, console at http://localhost:8080 (local
admin password `testing`). `pnpm envio stop` removes the local containers and database.

If port 5433 is already taken on your machine, set `ENVIO_PG_PORT=5435` (any free port).

### Data source: HyperSync or public RPC

Monad testnet is a HyperSync chain (`monad-testnet.hypersync.xyz`), and HyperSync is the fast path.
It needs an Envio API token (`ENVIO_API_TOKEN`, created at envio.dev/app/api-tokens). This repo
does not ship one, so `config.yaml` syncs over public RPC instead:

- `for: sync` is Ankr's public Monad testnet endpoint, `for: fallback` is `testnet-rpc.monad.xyz`.
- Both cap `eth_getLogs` at 100 blocks per call (Monad's also at 25 requests/s), so the plain RPC
  sync walks about 70 blocks/s. From block 68349040 to today's head that is several hours.

**To switch to HyperSync**, delete the `rpc:` block under the chain in `config.yaml` and put
`ENVIO_API_TOKEN=…` in `indexer/.env` (git-ignored). Nothing else changes.

### Fast local sync without a token

[`tools/logs-proxy.mjs`](tools/logs-proxy.mjs) is a small local JSON-RPC proxy: it accepts wide
`eth_getLogs` ranges, fetches each aligned 100-block chunk once for all seven contract addresses
(in parallel across the two public endpoints, rate-limited and retried), caches it, and answers
each of HyperIndex's queries from the cache. It only reads public chain data. With it the full
history synced in about 20 minutes:

```bash
node tools/logs-proxy.mjs &      # http://127.0.0.1:8547
ENVIO_MONAD_SYNC_RPC=http://127.0.0.1:8547 \
ENVIO_MONAD_FALLBACK_RPC=http://127.0.0.1:8547 \
ENVIO_SYNC_BLOCK_INTERVAL=20000 \
ENVIO_SYNC_TIMEOUT_MS=180000 \
pnpm dev
```

### Run the example queries

```bash
HASURA_ADMIN_SECRET=testing node tools/run-queries.mjs     # runs every queries/*.graphql
```

The full output of the 12 Oct run is in [`queries/outputs-2026-10-12.txt`](queries/outputs-2026-10-12.txt).

## Example queries and real outputs

All outputs below are from the local run on 12 Oct 2026, trimmed where marked.

### Aggregates ([`queries/stats.graphql`](queries/stats.graphql))

```graphql
query Stats {
  VerdictStats(order_by: { id: asc }) {
    id totalRequests totalVerdicts score0 score1to49 score50to99 score100
    bondsCommitted bondsScored slashedCount reclaimedCount totalStakedWei totalSlashedWei
    jobsCreated jobsCompleted jobsRejected totalEscrowWei receipts totalPaidWei lastBlock
  }
}
```

```json
{ "id": "global",
  "totalRequests": 151, "totalVerdicts": 151,
  "score0": 43, "score1to49": 0, "score50to99": 0, "score100": 108,
  "bondsCommitted": 4, "bondsScored": 4, "slashedCount": 1, "reclaimedCount": 0,
  "totalStakedWei": "40000000000000000", "totalSlashedWei": "10000000000000000",
  "jobsCreated": 4, "jobsCompleted": 3, "jobsRejected": 0, "totalEscrowWei": "17000000000000000",
  "receipts": 3, "totalPaidWei": "3000000000000000", "lastBlock": 70444799 }
{ "id": "PredgeAgentValidator", "totalRequests": 148, "totalVerdicts": 148, "score0": 43, "score100": 105, "...": "..." }
{ "id": "ERC8004ValidationRegistry", "totalRequests": 3, "totalVerdicts": 3, "score0": 0, "score100": 3, "...": "..." }
```

### All verdicts for market X ([`queries/verdicts-for-market.graphql`](queries/verdicts-for-market.graphql))

```graphql
query VerdictsForMarket($marketId: String = "2169995") {
  Verdict(where: { marketId: { _eq: $marketId } }, order_by: { block: asc }) {
    registry score agent agentId validator tag requestHash responseHash leadTimeSeconds block tx
  }
}
```

Market 2169995 (the smoke-run market), 6 verdicts: one in each registry per smoke run. First two:

```json
{ "registry": "PredgeAgentValidator", "score": 100,
  "agent": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9", "agentId": "0",
  "validator": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9",
  "tag": "predge:settlement-evidence-verified",
  "requestHash": "0x80b502a5ab222406784e43395b76c4da86525a55f43da21555fb77c9de79bbd0",
  "responseHash": "0x325f13d6cf34fae6dc2e6eaf3aa9055ceb5d864dbf13e1e42118236af4a0e796",
  "leadTimeSeconds": 5, "block": 68349140,
  "tx": "0x80aea2ea52ddb0583052d12ad6e93e727f874c3987701d39484b8e6f9a9229a0" }
{ "registry": "ERC8004ValidationRegistry", "score": 100,
  "agent": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9", "agentId": "2003",
  "validator": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9",
  "tag": "predge:resolved-outcome-vs-claim",
  "requestHash": "0x9bfb85500f04a193fc6a2ef282a2a183d19587925c544df91ea5820b07208882",
  "responseHash": "0x80b502a5ab222406784e43395b76c4da86525a55f43da21555fb77c9de79bbd0",
  "leadTimeSeconds": 1, "block": 68349171,
  "tx": "0x3bb937170050e5fc6eaa65e7213da5f6ad66c7d867a04f47ba7dd8a495f9c274" }
```

Note how the ERC-8004 verdict's `responseHash` is the Predge verdict's `requestHash`: the two
registries are bound to each other, and the index makes that visible in one query.

### Agents ranked by verdicts received ([`queries/agents-ranked.graphql`](queries/agents-ranked.graphql))

```graphql
query AgentsRanked {
  AgentStats(order_by: { verdictsReceived: desc }, limit: 10) {
    id requests verdictsReceived score100 score0 avgScoreX100 lastVerdictBlock
  }
}
```

| agent | requests | verdicts | score 100 | score 0 | avg score |
|---|---|---|---|---|---|
| `0x4cc40abe…dc0d` | 25 | 25 | 19 | 6 | 76.00 |
| `0x6bc8f5ab…7680` | 24 | 24 | 15 | 9 | 62.50 |
| `0x758e63d8…cf23` | 24 | 24 | 18 | 6 | 75.00 |
| `0x3985247a…5612` | 24 | 24 | 18 | 6 | 75.00 |
| `0x5403f12c…8fed` | 24 | 24 | 18 | 6 | 75.00 |
| `0xdc0caa86…ad5a` | 24 | 24 | 14 | 10 | 58.33 |
| `0x9f0af03c…9fc9` | 6 | 6 | 6 | 0 | 100.00 |

The six batch agent keys sum to 145 verdicts, 102 at 100 and 43 at 0, the same as
`monad/batch/results-2026-10-07T11-39-11-867Z.json`. The last row is the smoke runs (3 in each
registry).

### Slashed bonds ([`queries/slashed-bonds.graphql`](queries/slashed-bonds.graphql))

```graphql
query SlashedBonds {
  Bond(where: { slashed: { _eq: true } }) {
    bondContract requestHash stakeWei expected deliveredHash recordedScoreAtSlash
    challenger slashedWei closeTx closeBlock
    job { jobId client provider evaluator status deliverable }
  }
}
```

```json
{ "bondContract": "0x95652b86c10eb0e012b22e08dbc98481d4a19bc2",
  "requestHash": "0xf500794cf390aeedef8c2335ceaaae44b6abbaba7aa4002a7691d012359e9b5b",
  "stakeWei": "10000000000000000",
  "expected": "0x284f3b6961176b0edd9b9abb8690a893d36c5c8eb4045b7a94aef22187a37bf1",
  "deliveredHash": "0x43d167272a3b2d170002285da41268d91e709a6e7b8083d4df4005950c83825c",
  "recordedScoreAtSlash": 100,
  "challenger": "0x2a9ddcdb5de78f6bbbd9d33cb1b3da55b1bb25a4",
  "slashedWei": "10000000000000000",
  "closeTx": "0x96f861d0c7810e5687d6694899ce70994e90e86233c12362b19fad118b0184ab",
  "closeBlock": 68958599,
  "job": { "jobId": "3", "client": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9",
           "provider": "0x7fe8d29be8ca6d2f40472f9a8fa97f3dc0ddc55e",
           "evaluator": "0xe85ae59ed129e97943eefbecf4233c68dd77b696",
           "status": "submitted",
           "deliverable": "0x43d167272a3b2d170002285da41268d91e709a6e7b8083d4df4005950c83825c" } }
```

The validator committed `expected = 0x284f…`, the provider's own submission on `AgentJob` is
`0x43d1…`, the validator still recorded 100, and the challenger took the 0.01 MON bond.

### Jobs and receipts ([`queries/jobs-and-receipts.graphql`](queries/jobs-and-receipts.graphql))

Trimmed to job 1 and the first receipt:

```json
{ "jobId": "1", "status": "completed",
  "client": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9",
  "provider": "0x41c31248b5187635f0c639605e53d43792c900ad",
  "evaluator": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9",
  "escrowWei": "5000000000000000", "paidWei": "5000000000000000",
  "specHash": "0x80b502a5ab222406784e43395b76c4da86525a55f43da21555fb77c9de79bbd0",
  "bonds": [{ "status": "scored", "score": 100, "stakeWei": "10000000000000000" }] }
{ "payer": "0x9f0af03c5695b72903c03852f7dd4fe5a0d49fc9", "routeText": "/v1/settlement-risk",
  "amountWei": "1000000000000000",
  "meta": "0x80b502a5ab222406784e43395b76c4da86525a55f43da21555fb77c9de79bbd0",
  "block": 68349161, "tx": "0x9cd46a446a185349b0d3977ee58446b14d5da6a639654c9c82b0a9b09772a63a" }
```

### Also in [`queries/`](queries/)

- `latest-verdicts.graphql`: the newest verdicts with their request (what a board would poll).
- `counts.graphql`: row counts per entity and registry, plus `_meta` sync status.

## How the verdict board and agents can use it

- **Agents** call the GraphQL endpoint before acting: "has Predge already scored market X, and with
  what score?" is one `Verdict(where: {marketId: …})` query instead of an RPC log scan; "how often
  was this agent's claim right?" is one `AgentStats` row.
- **The verdict board** ([`docs/`](../docs/index.html)) currently reads each verdict from Monad RPC
  by the tx list in `docs/board-data.json`. With a public endpoint it could drop that list and
  read `VerdictStats`, `Verdict` and `Bond` directly, including verdicts written after the static
  file was built. The board is left unchanged for now because this indexer only runs locally;
  once it is deployed (below), point the board at the hosted URL.
- `_meta { progressBlock isReady }` tells a client how fresh the index is.

## Hosted deploy (needs the owner)

Envio Cloud (formerly the Hosted Service) deploys from a GitHub repo and needs an Envio account,
which this repo does not create. Steps for the owner:

1. Sign in at https://envio.dev/app with the GitHub account that owns
   `predgeAI/erc8004-outcome-validator`, install the Envio Deployments GitHub app on that repo.
2. Create an indexer: repo `erc8004-outcome-validator`, root directory `indexer`, config
   `config.yaml`, deployment branch (e.g. `envio` or `main`).
3. On Envio Cloud HyperSync is available, so remove the `rpc:` block from `config.yaml` (or keep it
   as a fallback only) before pushing the deployment branch.
4. Push. The dashboard shows the sync progress and the deployment's public GraphQL URL.
5. Optionally wire the board: fetch `VerdictStats(where: {id: {_eq: "global"}})` from that URL in
   `docs/index.html` and show it as "indexed by Envio".

The free development plan covers this volume (a few hundred events; its soft limit is 100,000), but
development deployments are deleted after 30 days, so redeploy or upgrade before a judging window
that runs longer than that.

## Layout

```
indexer/
  config.yaml           contracts, events, chain, data source
  schema.graphql        entities
  src/lib.ts            ids, market and route parsing, aggregate helpers
  src/handlers/         validation.ts, bond.ts, job.ts, settlement.ts, identity.ts
  queries/              example queries + outputs-2026-10-12.txt
  tools/logs-proxy.mjs  local fan-out proxy for fast sync over public RPC
  tools/run-queries.mjs runs every query against an endpoint
```
