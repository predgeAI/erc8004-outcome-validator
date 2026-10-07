# Contract sources

These four files are the exact sources of the contracts deployed on Monad testnet (chain 10143).
They are copied byte for byte from Predge's own repositories, so their git blob ids match the
originals and the compiled runtime matches the chain:

```bash
npm ci
node monad/contracts/check-bytecode.mjs   # recompiles with solc 0.8.26 and compares with eth_getCode
```

| File | Copied from | Git blob | First written | Changed during the hackathon |
|---|---|---|---|---|
| `PredgeSettlement.sol` | [predgeAI/predge-robinhood](https://github.com/predgeAI/predge-robinhood) `d7cf885:contracts/PredgeSettlement.sol` | `e388e8e4` | 2026-08-03 in predgeAI/predge-arc | no |
| `PredgeAgentValidator.sol` | predge-robinhood `d7cf885:contracts/PredgeAgentValidator.sol` | `ae5f15a5` | 2026-08-14 in predge-arc | no |
| `AgentJob.sol` | predge-robinhood `d7cf885:contracts/AgentJob.sol` | `58a748b8` | 2026-08-14 in predge-arc | no |
| `PredgeValidatorBond.sol` | predge-robinhood `bc57c52:contracts/PredgeValidatorBond.sol` (same blob as [predgeAI/predge-arc](https://github.com/predgeAI/predge-arc) `c0762ea`) | `ace30c98` | v1 on 2026-08-14 in predge-arc | yes: job-bound challenge on 2026-09-18, dispute window counted from the verdict on 2026-10-03 |

All four are MIT licensed by Predge (SPDX header in each file). No third-party code: no imports,
no libraries. The comments are kept exactly as deployed, because any edit would change the
metadata hash and break the byte-for-byte match with the verified contracts.

Compiler settings: solc 0.8.26, optimizer enabled with 200 runs, evmVersion `cancun`, source unit
name `<Contract>.sol`. The same contracts are Sourcify verified (exact match) on Monad testnet.

`deploy.mjs` in this folder compiles the same sources with the same settings and deploys a fresh
stack (or a single contract) to Monad testnet with your own key.
