# Fund a Predge agent on Monad from any chain (Aurora Intents)

A trading agent that lives on Base, Arbitrum or Solana should not need a bridge, a Monad balance or MON
for gas before it can ask Predge whether a prediction-market outcome will hold. With Aurora Intents
(powered by NEAR Intents) it gets a one-time deposit address on the chain it already uses; solvers deliver
native Circle USDC on Monad mainnet (`0x7547…b603`, the same token Predge's x402 endpoint prices in) to
the agent; the agent then pays 0.001 USDC per check over x402 on Monad mainnet, gasless through Monad's
facilitator. The agent never holds MON.

```
USDC on Base ──deposit──▶ intents deposit address ──solvers──▶ USDC on Monad (agent) ──x402 0.001 USDC──▶ Predge check
                (1 transfer)                       (~37 s)                               (EIP-3009, facilitator pays gas)
```

| File | What |
|---|---|
| `aurora/fund.mjs` | CLI: `tokens`, `quote` (dry), `deposit` (one-time deposit address), `submit`, `status --watch`, optional guarded `send` |
| `guard/src/components/Fund.tsx`, `guard/src/lib/intents.ts` | "Fund from any chain" panel in Predge Guard: quote, deposit address, live status, agent USDC on Monad, then the x402 step |
| `monad/x402/server.mjs`, `agent.mjs` | `MONAD_NETWORK=mainnet` serves and pays the x402 check on Monad mainnet (eip155:143); default stays testnet |
| `aurora/runs/` | every real deposit quote and final status, as JSON evidence |

Backend: with `AURORA_APP_KEY` (CLI) or `VITE_AURORA_APP_KEY` (Guard), a public app key from
[studio.aurora.dev](https://studio.aurora.dev), calls go to the Aurora Intents API
(`https://intents-api.aurora.dev/api/{tokens,quote}/{appKey}`). Without it they go to the NEAR Intents 1Click
API (`https://1click.chaindefuser.com/v0`), the same solver network, keyless with an extra 0.25% fee.
Status is read from 1Click by deposit address in both cases. Both APIs are CORS-open, so the Guard panel
runs entirely in the browser.

## Checked on 2026-10-13 (dry runs, nothing sent)

- Monad (chain 143) is a listed destination: MON (native), USDC `0x754704bc…b603`, USDT0. USDC origins include
  Base, Arbitrum, Ethereum, Optimism, Polygon, Solana, BSC, Avalanche, Gnosis, Sui, Aptos, Stellar, NEAR.
- 2 USDC on Base to USDC on Monad: 1.994915 out, minimum 1.974965 at 1% slippage, about 37 s.
- 2 USDC on Arbitrum to MON on Monad: 79.80 MON, about 29 s. 0.5 USDC quotes fine as well.
- Monad mainnet USDC is EIP-3009 with EIP-712 domain name `USDC`, version `2` (DOMAIN_SEPARATOR checked on
  chain), and `x402-facilitator.molandak.org/supported` lists `exact` on `eip155:143`.
- `MONAD_NETWORK=mainnet node monad/x402/server.mjs` answers an unpaid request with HTTP 402 and one
  `accepts` entry: eip155:143, 1000 atomic units of `0x7547…b603`.

## Live run (owner)

```bash
npm ci
# 1. deposit address for 2 USDC on Base -> USDC on Monad to the x402 payer agent (0x6796…87f5)
node aurora/fund.mjs deposit --from base --amount 2 \
  --to 0x67968e43b94a9F41ce0052A038172e6522C887f5 --refund <your Base address>
# 2. send exactly the printed amount of USDC on Base to the printed deposit address (any wallet)
# 3. follow it to Monad
node aurora/fund.mjs status <depositAddress> --watch
# 4. spend it on Monad: x402 check paid in USDC, gas paid by the facilitator
MONAD_NETWORK=mainnet PAY_TO=<treasury> node monad/x402/server.mjs &
MONAD_NETWORK=mainnet node monad/x402/agent.mjs 5532382
```

The same flow runs in Predge Guard (`#fund`): enter the agent address, Get quote, Get deposit address, send,
and the panel follows the swap to the Monad delivery tx and the agent's USDC balance.
