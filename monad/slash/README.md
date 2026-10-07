# Slash demo on Monad testnet

A dishonest bonded verdict from a separate validator key, challenged by a third party, slashed on
chain. Run on 2026-10-07; receipts in [`slash-2026-10-07T11-29-42-252Z.json`](slash-2026-10-07T11-29-42-252Z.json).

**Story.** The acceptance test is "deliver Predge's signed Settlement Risk record for Polymarket
market 2169995 (MicroStrategy sells any Bitcoin by May 31, 2026?) byte for byte". The validator
commits `expected = sha256(signed record)` and bonds 0.01 MON behind it. The provider delivers a
tampered copy in which the on-chain outcome reads Yes instead of No. The validator records verdict
100 anyway. Both commitments are now on chain, written by two different keys, so a third party calls
`challenge()` with no arguments, the contract compares them, and the bond goes to the challenger.

Four separate keys: owner/client `0x9F0A…9Fc9`, dishonest validator `0xe85a…b696`, provider
`0x7FE8…C55e`, challenger `0x2A9d…25A4`. The demo uses its own instance of `PredgeValidatorBond`
(same source as `monad/contracts/`, Sourcify exact match on Monad testnet), bound to the live
`AgentJob`, so the main bond and its validator are not touched.

Bond instance: [`0x95652b86c10Eb0E012b22E08dBC98481d4a19Bc2`](https://testnet.monadvision.com/address/0x95652b86c10Eb0E012b22E08dBC98481d4a19Bc2), dispute window 86,400 s counted from the verdict.

| Step | Key | Tx | Block |
|---|---|---|---|
| 0 deploy bond instance (validator = dishonest key) | owner | [`0xd58cc5cd…`](https://testnet.monadvision.com/tx/0xd58cc5cdd582bea67ef33cf547e594fa72316f50b0215811454734d534574888) | 68958546 |
| 1 createJob, escrow, evaluator = validator | client | [`0xec4c2fdd…`](https://testnet.monadvision.com/tx/0xec4c2fdde44328de0ab6a5ba5489cb9f253687b24f1eaf949bab5377202cd164) | 68958573 |
| 2 stakeAndCommit, 0.01 MON behind `expected` | validator | [`0xe44b1d1e…`](https://testnet.monadvision.com/tx/0xe44b1d1e4537e7788834545c3616ec4715d262912296695017625d2f2274d66d) | 68958576 |
| 3 submit the tampered record | provider | [`0x8ff4c243…`](https://testnet.monadvision.com/tx/0x8ff4c2430a49c961c633aeed517a753382b0c32144836f9bff91e98a8828c2b5) | 68958579 |
| 4 recordScore 100 (dishonest verdict) | validator | [`0xb46e399a…`](https://testnet.monadvision.com/tx/0xb46e399a74ebd9a9ed1d79a6d65dbedcdce885091ab5115f825836424be27faa) | 68958582 |
| 5 challenge, `Slashed` event, 0.01 MON to the challenger | challenger | [`0x96f861d0…`](https://testnet.monadvision.com/tx/0x96f861d0c7810e5687d6694899ce70994e90e86233c12362b19fad118b0184ab) | 68958599 |

Result: `wouldSlash` was true before the challenge; after it the stake is closed, `slashCount` is 1,
and a `reclaim()` by the validator reverts `Closed()`. The challenge landed 17 blocks after the
dishonest verdict, well inside the dispute window counted from the verdict.

What this shows on Monad: the challenge cost about 0.0096 MON in gas (Monad charges the gas limit),
so the 0.01 MON demo bond only just covers it. A real validator has to size its bond well above the
cost of a challenge, or nobody will bother to send one.

Reproduce (needs four funded testnet keys, see the header of the script):

```bash
node monad/slash/slash-demo.mjs                                # preflight, nothing sent
CONFIRM_TESTNET=yes node monad/slash/slash-demo.mjs --send
```
