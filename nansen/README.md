# Nansen dispute exposure

When a Polymarket market's UMA resolution is disputed, the question a holder has is not "is it
disputed" but "who is on the contested side, how much money is there, and should I hedge". Predge
knows the first half (which proposed outcome was disputed, whether it went to a UMA vote, a signed
reference rate that the market settles differently from the disputed proposal). Nansen knows the
second half (who holds each side, at what cost, and how good those wallets are). Nansen has no
dispute or resolution data, and Predge has no holder data. This joins them into one decision.

```
node nansen/exposure.mjs <market_id>            # pays Nansen about 0.13 USDC on Monad, then caches
node nansen/exposure.mjs <market_id> --no-pay   # cache only, never pays
```

Output: JSON on stdout, a readable summary on stderr, and the result in
`nansen/cache/exposure-<id>.json` and `nansen/examples/<id>.json` (+ `.txt`). The MCP server serves
the cached result as the `dispute_exposure` tool and never pays.

## What Nansen data is used

All three are Nansen Prediction Market API endpoints (Polymarket), paid per call over x402 in USDC on
Monad mainnet (`eip155:143`), no account and no API key.

| Endpoint | Price (from the 402 challenge) | Used for |
|---|---|---|
| `POST /api/v1/prediction-market/top-holders` | 0.05 USDC | top 50 holders by shares: side, share count, entry price, current price, unrealized PnL |
| `POST /api/v1/prediction-market/position-detail` | 0.05 USDC | first 50 positions: outcome label, buy cost, unrealized value, redemption value |
| `POST /api/v1/prediction-market/address-summary` | 0.01 USDC x3 | top 3 holders: win rate, markets traded, total PnL, wallet age |

Nansen's `market_id` is the Polymarket market id, the same id Predge signs as `market_id`; the
signed `condition_id` is kept in the output for cross-checking. The Predge record comes from
`https://api.predge.io/v1/settlement-risk/<market_id>` and is verified with the SDK
(`parseSettlementRisk`: ed25519 against the pinned key, sha256 content hash) on every run, cached or
not.

## What it computes

- dollars on the contested outcome (the last disputed proposal) vs the other side: Nansen
  `buy_cost_usd`, `unrealized_value_usd`, `redemption_value_usd` summed per side, plus share counts
  and current price per side from `top-holders`
- share of the top 3 holders within Nansen's top 50 by shares
- whether high-win-rate wallets (Nansen `win_rate >= 0.6` over `markets_traded >= 20`) sit on the
  contested side or against it, with their buy cost
- one decision for someone holding, or about to buy, the contested outcome:

| Decision | When |
|---|---|
| `fine` | resolved on chain (the output adds a retrospective of cost on each side), or no dispute and Predge risk `ok` |
| `hedge` | disputed, and either the other side trades at least 5 points below Predge's signed `settles_differently_probability` (the hedge is cheap relative to the reference rate), or high-win-rate buy cost against the contested outcome exceeds the cost for it |
| `size down` | disputed, and the top 3 hold more than half of the top-50 shares, or high-win-rate money sits on both sides |
| `wait` | disputed, none of the above |

Every dollar figure about holders is a Nansen field or a sum of Nansen fields, labeled with the time
Nansen returned it (`exposure.asOf`, `nansen.calls[].fetchedAt`). The Predge probability is a
reference rate from settled 2026 disputes, not a forecast for the market.

## Examples (12 to 13 Oct 2026)

| Market | Predge | Nansen, as of | Decision |
|---|---|---|---|
| [5219930](examples/5219930.txt) Will Trump say "Ammunition" this week? | `caution`, disputed twice (proposal No), in a UMA vote, reference rate 21.66% | 2026-10-12T21:10:06Z: No holders' cost $91,170, Yes $36,208 (top 50 positions); Yes trades at 0.0135; top 3 hold 23.9% of top-50 shares; 0x134a63 (win rate 76.2% of 3,882 markets) on No, 0x44c1df (63.6% of 3,252) on Yes | **hedge** |
| [1137824](examples/1137824.txt) Montana vs Idaho O/U 151.5 | resolved Over, disputed proposal Under | 2026-10-12T21:12:26Z: cost $6,625 on Under vs $6,141 on Over | fine |
| [1112268](examples/1112268.txt) Torino vs Roma O/U 2.5 | resolved Under, disputed proposal Over | 2026-10-12T21:12:52Z: cost $1,023 on Over vs $2,138 on Under | fine |
| [5532382](examples/5532382.txt) Ravens vs Falcons "Offside" | resolved Yes, disputed proposal No | 2026-10-12T21:13:18Z: cost $302 on No vs $266 on Yes; top No holder 0x6510c9 has a 98.8% win rate over 678 markets | fine |
| [4838803](examples/4838803.txt) Gemini Pro by 9 Oct | resolved No, disputed proposal No (stood) | 2026-10-12T21:13:39Z: cost $11,741 on No vs $3,198 on Yes | fine |

5219930 was the live case: the question creator's bulletin-board clarification (unsigned Predge
field, 2026-10-12T20:15Z) says the disputed remark does not qualify for Yes, which is consistent with
the market pricing No at 0.9865. The decision says hedge because a 1.35 cent hedge is cheap against a
21.66% reference rate, not because Yes is likely.

Disputed markets were found by scanning `DisputePrice` logs of UMA's Managed Optimistic Oracle V2
(`0x2c0367a9…`) for requester `UmaCtfAdapter` (`0x65070be9…`) on Polygon over the last ~300k blocks
and reading `market_id` from the ancillary data, then checking each in Predge.

## Spend log

Hard cap in code: 2.00 USDC lifetime across all runs (`nansen/runs/spend-ledger.json`), 0.10 USDC
max per call, 0.20 USDC per run by default (`--budget`). Before signing, every call reads the 402
challenge and refuses unless the option is `exact`, `eip155:143`, USDC
`0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, payTo `0x93053f1e7A5eFEDa532Fe69CbbE43cBEc3A0F13f`.
A pending ledger entry is written before the paid request, so an interrupted run still counts. Each
settlement is checked on Monad: the USDC `Transfer` from the payer to Nansen's payTo for the exact
amount (`onchain.matches` in the ledger).

Payer `0x9F0Af03C5695b72903c03852f7Dd4Fe5A0d49Fc9`. Total spent: **0.65 USDC** in 25 payments, all
settled and matched on chain.

| Market | Endpoint | USDC | Settlement tx (Monad mainnet) |
|---|---|---|---|
| 5219930 | top-holders | 0.05 | [0x54ec0cea…](https://monadvision.com/tx/0x54ec0ceac648569729a55af3785f52ed71362b1bcadd37ab17f868a89501d42e) |
| 5219930 | position-detail | 0.05 | [0xd00620a3…](https://monadvision.com/tx/0xd00620a331b54844d2cb012d590f981680d7691b3c914bd946d9471a7f6a26af) |
| 5219930 | address-summary | 0.01 | [0x274555e2…](https://monadvision.com/tx/0x274555e2d5bfbb71a8f260ecf5118481a15339567ce3aa14c82da1b33d72e6e9) |
| 5219930 | address-summary | 0.01 | [0x7c286df2…](https://monadvision.com/tx/0x7c286df2af324a6a935778baba32bce11c2e4077b6216c0ed5bf4f9a32b277b2) |
| 5219930 | address-summary | 0.01 | [0xab8e9146…](https://monadvision.com/tx/0xab8e91462d11f7209222d456c8fe383734bd5ee1a25baf64bd207430b4346c2d) |
| 1137824 | top-holders | 0.05 | [0x846f888e…](https://monadvision.com/tx/0x846f888ef9a534ea319a1d5ae42b8fcb8a880ce47a7adaf8dcb48ce4e4f4882b) |
| 1137824 | position-detail | 0.05 | [0x68917fbc…](https://monadvision.com/tx/0x68917fbcd01721df7bfbda7c5e641887a5c18ae4d51c291abcececd83063a4f4) |
| 1137824 | address-summary | 0.01 | [0xdeb520e2…](https://monadvision.com/tx/0xdeb520e2bb25bb0c1b52ea9039efffecbe2076b6b2be05228d85b421c7ad0668) |
| 1137824 | address-summary | 0.01 | [0x1cc2e5ac…](https://monadvision.com/tx/0x1cc2e5ac504e54e4b110bfd889251c432e83acefdf10f9fa3f3681e3934e1f3b) |
| 1137824 | address-summary | 0.01 | [0xf42bdf09…](https://monadvision.com/tx/0xf42bdf090e7a2ff8f0c78ff2f9bf3189e992e716b5dcbdef993a0dfeb9d35516) |
| 1112268 | top-holders | 0.05 | [0xa1b76209…](https://monadvision.com/tx/0xa1b762093f5b55d0a350f4860c23a0f6bcc020074ce5c0d8f4e5434d76cbf80c) |
| 1112268 | position-detail | 0.05 | [0x8e118439…](https://monadvision.com/tx/0x8e118439f736799bb2e535b8691eba1f9de43c10f7cdf2aa2ccea5976ca3c8fa) |
| 1112268 | address-summary | 0.01 | [0xb9a02e37…](https://monadvision.com/tx/0xb9a02e3750101edb3506e115dfb78b569e05765908f6b71fc76424670cbed341) |
| 1112268 | address-summary | 0.01 | [0x40d97860…](https://monadvision.com/tx/0x40d978605b83826a59d2eb265733b41b244d6da78d305769bb69ed8302e5ffdb) |
| 1112268 | address-summary | 0.01 | [0xc97cb17c…](https://monadvision.com/tx/0xc97cb17c77e75e4797868560310deba39d0e98e72743db337d87e83873ff8cae) |
| 5532382 | top-holders | 0.05 | [0x559f4eb7…](https://monadvision.com/tx/0x559f4eb7777c46da2fa79f727a38d627a4357b7e5b9f166a67c3a3abfaa24f74) |
| 5532382 | position-detail | 0.05 | [0xaa632483…](https://monadvision.com/tx/0xaa63248315b7f96091260f2970eb3054a1ea412c13b0090e0f203538d0168540) |
| 5532382 | address-summary | 0.01 | [0xec463284…](https://monadvision.com/tx/0xec463284faa8751f5e41f6d896d171ac81865357507440385c9f608276900081) |
| 5532382 | address-summary | 0.01 | [0x6bd51ca6…](https://monadvision.com/tx/0x6bd51ca687a2cde7478d3d701361c636931e8ad921f95ff57151950b10f0b948) |
| 5532382 | address-summary | 0.01 | [0xc8398409…](https://monadvision.com/tx/0xc839840975d74082f69419b4e66ad3ae4cfdb675a68d76aad5be560fd96d787c) |
| 4838803 | top-holders | 0.05 | [0xa011be60…](https://monadvision.com/tx/0xa011be60df8ef71bf0e386f4dc9a48461d1863f5250fd0fbb29f385ecfe2a823) |
| 4838803 | position-detail | 0.05 | [0x932c657a…](https://monadvision.com/tx/0x932c657ab3cb1d547905c877b3d646a6c4a856b35801c65dd43d6810ab426e5d) |
| 4838803 | address-summary | 0.01 | [0x2d84a5dc…](https://monadvision.com/tx/0x2d84a5dc47967e917259d83e7bc3bcfdc70e7d8d364e044c0a33f445f3806925) |
| 4838803 | address-summary | 0.01 | [0x180ee6b3…](https://monadvision.com/tx/0x180ee6b3e03fee41da2c22c8e07694a9f525131335a8cd9bdf19eee2cef1d54c) |
| 4838803 | address-summary | 0.01 | [0x55e144e7…](https://monadvision.com/tx/0x55e144e70958adbfdaa59ac1c4c9cb19d3a747f14c577dc40e13b0900ce2637c) |

## Reproduce

```
npm ci                                              # repo root, installs and builds the SDK
node nansen/exposure.mjs 5219930 --no-pay           # from the committed cache, free, re-verifies the Predge signature
node --test nansen/test/cap.test.mjs                # the cap refuses before any key is read (one unpaid 402 read)
npm run test:live -w @predge/settlement-risk-mcp    # includes dispute_exposure over stdio
```

Fresh data for a new market: put `PRIVATE_KEY=0x...` for a wallet holding USDC on Monad mainnet in a
KEY=VALUE file (default `~/.predge-monad/monad-testnet.env`, or `PREDGE_ENV_FILE`) and change
`EXPECTED_PAYER` in `nansen-x402.mjs` to that wallet; the code refuses a key that derives a different
address. The key is read only when a payment is needed and is never printed or written. Nansen's
facilitator submits the settlement and pays gas; the code sends no transaction of its own.

## Limits

- Holder figures cover Nansen's top 50 holders and first 50 positions, not the whole market.
- After resolution, winning positions are mostly redeemed, so `top-holders` shows mainly the losing
  side; the retrospective uses `position-detail` buy cost, which keeps redeemed positions.
- The decision thresholds (5 points, 50%, 60% win rate over 20 markets) are fixed judgment calls,
  not fitted.
- Cached results go stale; `generatedAt`, `exposure.asOf` and `predge.checkedAt` say how stale.
  `--refresh-predge` refetches the Predge record; deleting the matching file in `cache/raw/`
  refetches (and pays for) a Nansen response.
