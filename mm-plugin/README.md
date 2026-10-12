# mm-plugin-predge: settlement-risk guard for MetaMask Agent Wallet

A plugin for the MetaMask Agent Wallet CLI (`mm`) that adds `mm predge`: a settlement-risk check
for prediction-market trades.

`mm predict` can quote, place and redeem Polymarket orders, but it does not look at how a market
settles. Polymarket outcomes go through UMA's optimistic oracle: a proposal can be disputed, reset,
or sent to a UMA token-holder vote. In 2026, 33.5% of settled disputed Polymarket markets settled
differently from the disputed proposal (853 of 2,543, from Predge's scan of UMA and the Polymarket
UMA CTF adapter on Polygon). An agent that buys into a disputed or proposed-but-not-final market is
trading on an outcome that is not settled yet.

`mm predge` closes that gap before the order:

| command | what it does |
|---|---|
| `mm predge check <market>` | Resolves a market id, slug, condition id or polymarket.com URL; fetches Predge's signed settlement-risk record and verifies it (ed25519 against pinned key `13fa3d18a369e6c7`, sha256 content hash, payload equals the signed bytes, signed condition id equals the market asked for); reads Predge's verdict on Monad when one exists and checks it is bound to the signed bytes; prints the risk level, dispute count and timeline, disputed proposal against the current or final outcome, the verdict with an explorer link, and one line: `Safe to act: yes/no, because ...` |
| `mm predge scan --address <wallet>` | Lists a Polymarket wallet's open positions (public Data API v2) and flags every position whose market is disputed or proposed but not final. Positions without a signed record are listed as unchecked, never as clear. |
| `mm predge guard <market> --side YES\|NO\|<outcome> --size <n>` | Runs `check`. If safe, prints the exact `mm predict quote ...` and `mm predict place ...` commands (token id, side, size, limit price from the live CLOB book, tick size). If not, refuses with the reason and exits non-zero. |

All three are read-only. The plugin never signs, never sends a transaction, never pays (no x402 in
this version), and never calls `mm predict place` itself. `check` and `guard` declare the
`wallet-read` capability only to read Monad through the host's `ctx.publicClient`; `scan` declares
no capability.

The agent-facing rule set is in [`skills/predge-settlement-risk/SKILL.md`](skills/predge-settlement-risk/SKILL.md):
always run `mm predge check` (or `guard`) before `mm predict place`, and treat any failure as unsafe.

## Install (local `file:` install)

Requires Node 22.18 or later (the `@metamask/agent-wallet` engine) and `mm` 6.2 to 7.x.

```bash
npm install -g @metamask/agent-wallet        # provides `mm`
git clone https://github.com/predgeAI/erc8004-outcome-validator
cd erc8004-outcome-validator/mm-plugin
npm install
npm run build                                 # esbuild bundle + oclif manifest
npm run link-host                             # see "Why link-host" below

mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true   # allows file: installs
mm plugins install "file:$PWD" --accept-permissions
mm predge check 1112268
```

No sign-in is needed: the commands set `requiresAuth = false` and `requiresInit = false`.

Uninstall with `mm plugins uninstall mm-plugin-predge`.

### Why link-host

For a `file:` install, `mm` symlinks this directory into its data directory, and Node resolves the
plugin's imports from here. The `@metamask/agent-wallet` copy that `npm install` puts in
`node_modules` (needed for types and `oclif manifest`) is then loaded as a second CLI instance: the
command fails the host's `PluginCommand` check and crashes with `window.addEventListener is not a
function`. `npm run link-host` replaces that copy with a symlink to the `mm` on your `PATH` (or to
`MM_CLI_ROOT`), so the plugin resolves the running CLI. Run it again after any `npm install`.

### Notes on the template

- `minCliVersion` is `">=6.2.0 <8"`, not the template's `"^6.2.0"`, which `mm` 7.1 refuses with
  `PLUGIN_CLI_VERSION: Package requires CLI ^6.2.0; running 7.1.0`.
- The plugin bundles the Predge SDK (`../sdk`), viem and ethers with esbuild, so it has no runtime
  dependencies besides the host CLI.

## Usage

```bash
mm predge check 1137824                                    # market id
mm predge check will-trump-say-ammunition-this-week-20261011   # slug
mm predge check 0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0  # condition id
mm predge check 1112268 --max-risk resolved --json         # stricter limit, machine output
mm predge check 1112268 --no-chain                         # skip the Monad read

mm predge scan --address 0x614dc8d3542c12103d2c6a3553fd761e391d1546
mm predge scan --address <wallet> --include-redeemable --max 50 --json

mm predge guard nfl-buf-la-2026-10-13-spread-home-3pt5 --side YES --size 10
mm predge guard 5635483 --side "Brewers +3.5" --size 10 --price 0.62
mm predge guard <market> --side NO --size 25 --action sell
```

Flags shared by all `mm` commands apply: `--json`, `--format text|json|toon`, `--verbose`.

`--side` takes `YES`/`NO` (outcome 0/1, as Polymarket orders binary markets) or an outcome label
such as `Over`. `--max-risk` (default `ok`) is the highest level that still counts as safe:

| level | meaning |
|---|---|
| `resolved` | the on-chain resolution is final |
| `ok` | no proposal, no dispute, no recent clarification on chain |
| `watch` | an outcome is proposed and its challenge window is open |
| `caution` | disputed, reset for a new proposal, or at a UMA token-holder vote |

`guard` also refuses when the market is closed, is not accepting orders, has no book on the side you
want (pass `--price`), when the size is below the market minimum, and when the signed record shows
the market already resolved to a different outcome than the one you want to buy.

Exit codes: `0` on success; non-zero with `PREDGE_GUARD_REFUSED` when guard refuses, and with
`PREDGE_CHECK_FAILED` / `PREDGE_GUARD_FAILED` when evidence could not be fetched or verified. A
failed check is a refusal: unknown risk is not low risk.

### Where the chain read goes

The Monad read is one `eth_call` to `getValidationStatus(requestHash)`:

- Monad testnet (10143), `PredgeAgentValidator` `0x884764736dBe1FD36291bDd3Afd50A75465F6e8A`, for
  disputed markets: the claim is "the final outcome equals the first disputed proposal";
  `requestHash` is keccak256 of that claim (as in the SDK), score 100 means the disputed proposal
  stood, 0 means it was overturned. The bound record is looked up in the verdict board data and
  re-verified.
- Monad mainnet (143), ERC-8004 ValidationRegistry `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`, for
  the markets listed in `MAINNET_VERDICTS` (currently 1112268).

The plugin first asks the host for `ctx.publicClient(chainId)`. When the host cannot provide one
(for example `mm` 7.1 without sign-in answers "A project id is required to resolve the default EVM
gateway RPC URL"), it falls back to Monad's public RPC and says so in `verdicts[].via`.

## Sample output

Captured from real runs through `mm` 7.1.0 on 12 Oct 2026 (all files in [`examples/`](examples/);
`examples/capture.sh` re-runs them). In text mode `mm` prints the structured result first, then the
human summary after `Hint:`; below is the summary part.

A market at a UMA vote:

```text
$ mm predge check will-trump-say-ammunition-this-week-20261011 --format text
Will Trump say "Ammunition" this week? (market 5219930, will-trump-say-ammunition-this-week-20261011)
Risk:      CAUTION  (UMA state disputed; disputed twice, at UMA vote)
Disputes:  2, sent to UMA token-holder vote, open
  2026-10-12T08:18:58Z  dispute 1 of proposal No  https://polygonscan.com/tx/0x7a19f69e9d4c2e1b128b9a994b3367a957ef431af0380a364d840fa656fa3b74
  2026-10-12T09:12:26Z  dispute 2 of proposal No (sends the outcome to a UMA vote)  https://polygonscan.com/tx/0x7c371b3029539f6dc060fb75a3c91b5036f05a1ad85efab8552acfe492daf590
Outcome:   disputed proposal No, no final outcome yet
Record:    signed by Predge key 13fa3d18a369e6c7, signature ok, pinned key ok, content hash ok, condition id matches; checked 2026-10-12T21:26:13Z
Verdict:   Monad testnet: none yet for requestHash 0x48c69bd0...4793 (https://testnet.monadvision.com/address/0x884764736dBe1FD36291bDd3Afd50A75465F6e8A)
Safe to act: no, because disputed twice, the outcome goes to a UMA token-holder vote, second dispute 12.2 h ago; median 88.5 h from a second dispute to on-chain resolution (Polymarket, 2026-01-01 to 2026-10-02). Latest bulletin-board update (clarification) 1.2 h ago (risk caution, above the ok limit)
```

A settled market whose disputed proposal was overturned, with verdicts on Monad testnet and mainnet:

```text
$ mm predge check 1112268 --format text
Torino FC vs. AS Roma: O/U 2.5 (market 1112268, sea-tor-rom-2026-01-18-total-2pt5)
Risk:      RESOLVED  (UMA state settled; final: Under)
Disputes:  1
  2026-01-13T21:12:12Z  dispute 1 of proposal Over  https://polygonscan.com/tx/0x7e59d684ba06456639386a8ec25d04ef02a2769d2cf1435887188b91ea664540
  2026-10-12T21:24:37Z  state at check time: resolved on chain, outcome Under
Outcome:   disputed proposal Over was overturned: final outcome Under
Record:    signed by Predge key 13fa3d18a369e6c7, signature ok, pinned key ok, content hash ok, condition id matches; checked 2026-10-12T21:24:37Z
Verdict:   Monad testnet: score 0, disputed proposal Over did not stand (tag predge:settlement-risk-v1), bound to the signed record, validator is Predge
           https://testnet.monadvision.com/tx/0x64a9cc8fc9caa13be5200965498d7219dffbc1c0eea7da5f3bd4d8bc0644fee5
Verdict:   Monad mainnet: score 100 (tag predge:resolved-outcome-vs-claim), bound to the signed record, validator is Predge
           https://monadvision.com/tx/0xbd6ff81a066d99be913bfcace9a743a3701e2802297cab86a290d0bef9ccae28
Safe to act: yes, because the on-chain resolution is final (Under); nothing is left to settle (risk resolved, within the ok limit); the Monad testnet verdict is bound to the signed record
```

Guard, allowed and refused:

```text
$ mm predge guard nfl-buf-la-2026-10-13-spread-home-3pt5 --side YES --size 10 --format text
...
Safe to act: yes, because no proposal, dispute or recent bulletin-board update on chain (risk ok, within the ok limit)

GUARD: allowed to buy 10 Rams (YES = outcome 0) at up to 0.48 (best ask on the Polymarket CLOB book). Run:
  mm predict quote --token-id 23250308899791469248496736713890367877528653645908077470390716328108040647589 --side buy --size 10 --limit-price 0.48 --tick-size 0.01
  mm predict place --token-id 23250308899791469248496736713890367877528653645908077470390716328108040647589 --side buy --size 10 --price 0.48 --tick-size 0.01

$ mm predge guard 5635483 --side YES --size 10 --format text
Error [PREDGE_GUARD_REFUSED]: Refused: "Brewers +3.5" proposed, challenge window ends 2026-10-12T23:10:57Z; no dispute yet (risk watch, above the ok limit)
Hint: Do not run mm predict place for market 5635483. Re-run mm predge check 5635483 later.
```

Scan of a public wallet (34 open positions, all checked):

```text
$ mm predge scan --address 0x614dc8d3542c12103d2c6a3553fd761e391d1546 --format text
Wallet 0x614dc8d3542c12103d2c6a3553fd761e391d1546: 34 positions, 34 checked against signed Predge records
Flagged: 1  (disputed or proposed but not final)
  [disputed] CAUTION  Will Trump say "Ammunition" this week?  holds No 7441.17 ($7,378)
      market 5219930 will-trump-say-ammunition-this-week-20261011: disputed twice, at UMA vote; disputes 2
      caution: disputed twice, the outcome goes to a UMA token-holder vote, second dispute 12.4 h ago; median 88.5 h from a second dispute to on-chain resolution (Polymarket, 2026-01-01 to 2026-10-02). Latest bulletin-board update (clarification) 1.3 h ago.
Clear: 33 (no dispute and no pending proposal, or final)
```

`examples/scan-wallet-small.txt` shows the `proposed-not-final` flag (11 of 13 positions in markets
inside their challenge window), and `examples/fail-closed-upstream-502.txt` shows a check that could
not fetch its evidence failing closed.

## Development

```bash
npm run typecheck     # tsc, strict
npm run build         # dist/commands/predge/*.js, dist/core.js, oclif.manifest.json
npm test              # offline tests on the signed record in ../monad/mainnet (no network)
node scripts/harness.mjs check 1112268          # same handlers without mm, live data
node scripts/harness.mjs guard 5219930 --side YES --size 10 --json
```

`src/core/` is host-agnostic (market resolution, record verification, Monad read, decision, text
rendering); `src/commands/predge/` are thin `PluginCommand` wrappers; `src/host.ts` maps the host's
`ctx.publicClient` and errors.

Data sources: `api.predge.io/v1/settlement-risk/<market>` (free, signed), Polymarket Gamma
(market lookup, unsigned and cross-checked against the signed condition id), Polymarket CLOB book
(limit price), Polymarket Data API v2 `/v2/positions` (scan), Monad RPC (verdicts). The free Predge
endpoint rate-limits bursts; the plugin retries 429/502/503 with backoff, and anything still failing
is reported, never treated as safe.

## Limits of this version

- Read-only by design: no `wallet-submit`, no x402 payment, no on-chain writes.
- On-chain verdicts exist only for disputed markets Predge has scored (testnet) and for the markets
  in `MAINNET_VERDICTS` (mainnet). For other markets the decision rests on the signed record.
- Markets for which Predge has no record (for example ones not resolved through the UMA CTF
  adapters) come back as errors: `check` fails closed and `scan` lists them as unchecked.

License: MIT.
