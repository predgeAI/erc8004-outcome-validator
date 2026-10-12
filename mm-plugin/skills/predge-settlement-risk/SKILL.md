---
name: predge-settlement-risk
description: Before any Polymarket order through the MetaMask Agent Wallet (mm predict place), check UMA settlement risk with mm predge check or mm predge guard. Use when buying, selling or redeeming prediction-market outcomes, when a market is near resolution, or when asked whether a market is disputed, proposed, or final.
---

# Predge settlement risk for mm predict

Polymarket markets settle through UMA's optimistic oracle. A proposed outcome can be disputed, reset,
or sent to a UMA token-holder vote, and about a third of disputed markets in 2026 settled differently
from the disputed proposal. `mm predict` does not check this. The `mm predge` commands do, from a
Predge record signed with ed25519 (pinned key `13fa3d18a369e6c7`) and, for disputed markets, Predge's
verdict on Monad. All three commands are read-only: they never sign, send, or pay.

## Rules

1. **Always run `mm predge check <market> --json` before `mm predict place`.** `<market>` can be the
   Polymarket market id, slug, condition id, or a polymarket.com URL.
2. Place the order only if `data.safeToAct` is `true`. If it is `false`, do not place the order;
   tell the user `data.reason` (one line: "Safe to act: no, because ...").
3. Prefer `mm predge guard <market> --side YES|NO|<outcome> --size <shares> --json`. It runs the same
   check and, only if safe, returns `data.commands.quote` and `data.commands.place`. Run the quote
   first, show it to the user, then run the place command exactly as returned (same token id, side,
   size, price). If guard exits non-zero with `PREDGE_GUARD_REFUSED`, do not place the order.
4. Treat any failure (`PREDGE_CHECK_FAILED`, `PREDGE_GUARD_FAILED`, network errors, HTTP 5xx) as
   **not safe**. Unknown settlement risk is not low settlement risk. Retry later; do not fall back to
   placing the order unchecked.
5. Do not raise `--max-risk` above `ok` unless the user explicitly asks for it and understands that
   `watch` means an outcome is proposed but still inside its challenge window and `caution` means a
   dispute or a UMA vote.
6. For a portfolio, run `mm predge scan --address <polymarket proxy wallet> --json` and report every
   entry in `data.flagged` (disputed, or proposed but not final) and every entry in `data.unchecked`
   (no signed record could be fetched, so the risk is unknown).

## Risk levels

| level | meaning | default action |
|---|---|---|
| `resolved` | the on-chain resolution is final | safe; buying the losing outcome is refused by guard |
| `ok` | no proposal, no dispute, no recent clarification | safe |
| `watch` | an outcome is proposed and its challenge window is open | wait |
| `caution` | disputed, reset for a new proposal, or at a UMA vote | do not trade |

## Reading the result

- `data.disputeCount`, `data.timeline`: each dispute with its Polygon transaction.
- `data.proposalVsOutcome`: the disputed proposal against the current proposal or final outcome.
- `data.record`: signature, pinned key and content hash checks, and whether the signed condition id
  matches the market that was asked for. All risk fields come from the signed bytes only.
- `data.verdicts[]`: Predge's verdict on Monad (testnet `PredgeAgentValidator`, and Monad mainnet's
  ERC-8004 ValidationRegistry where one exists), with `bound: true` only when the on-chain
  `responseHash` equals keccak256 of a signed record that verifies. An unbound verdict makes the
  check unsafe.

## Example

```bash
mm predge guard will-trump-say-ammunition-this-week-20261011 --side YES --size 10 --json
# ok: false, PREDGE_GUARD_REFUSED: disputed twice, the outcome goes to a UMA token-holder vote ...

mm predge guard nfl-buf-la-2026-10-13-spread-home-3pt5 --side YES --size 10 --json
# ok: true, data.commands.quote / data.commands.place: run quote, confirm, then place
```
