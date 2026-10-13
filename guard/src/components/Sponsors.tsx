import { useState, type ReactNode } from "react";
import { parseAbi, type Hex } from "viem";
import { client } from "../lib/chain";
import { mtx, REPO } from "../lib/constants";
import { ANDROID_RELEASE, EXPOSURE, KURU, LIVE_DISPUTE, X402_LAST } from "../lib/flow";
import type { useWalletState } from "./Wallet";
import { Ext } from "./ui";
import { quoteNow } from "./Fund";

const TESTNET_TX = (h: string) => `https://testnet.monadvision.com/tx/${h}`;
const TESTNET_ADDR = (a: string) => `https://testnet.monadvision.com/address/${a}`;
const tree = (p: string) => `${REPO}/tree/main/${p}`;

/** Chainlink CRE: the workflow wrote its report for 1112268 to this consumer on Monad testnet (cre/README.md). */
const CRE = {
  watch: "0x1518ad21cF96Ed0429D022b038263e68fD50A90c" as Hex,
  market: "1112268",
  requestHash: "0x9ccefa67ebdc1f3f4ee31d17616a37be2546deca5dd2847523942f1e7e396e4a" as Hex,
  reportTx: "0xfc7af2fc6b0b9ad0f21e55bb0182df3a48f5379183f1f743c32ff466993e7d2a",
};
/** Perpl on Monad testnet, collateral AUSD (6 decimals); the Android app's demo account (sw-monad/src/monad/chain.ts). */
const PERPL = {
  exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc" as Hex,
  wallet: "0x81e663d681fbF86F39070de0037f0708872c0969" as Hex,
  btcPerp: 16n,
  priceDecimals: 1,
};
const PERPL_ABI = [
  { type: "function", name: "getAccountByAddr", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "accountId", type: "uint256" }, { name: "balanceCNS", type: "uint256" }, { name: "lockedBalanceCNS", type: "uint256" }, { name: "frozen", type: "uint8" }, { name: "accountAddr", type: "address" }, { name: "positions", type: "tuple", components: [{ name: "bank1", type: "uint256" }, { name: "bank2", type: "uint256" }, { name: "bank3", type: "uint256" }, { name: "bank4", type: "uint256" }] }] }] },
  { type: "function", name: "getPosition", stateMutability: "view", inputs: [{ name: "perpId", type: "uint256" }, { name: "accountId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "accountId", type: "uint256" }, { name: "nextNodeId", type: "uint256" }, { name: "prevNodeId", type: "uint256" }, { name: "positionType", type: "uint8" }, { name: "depositCNS", type: "uint256" }, { name: "pricePNS", type: "uint256" }, { name: "lotLNS", type: "uint256" }, { name: "entryBlock", type: "uint256" }, { name: "pnlCNS", type: "int256" }, { name: "deltaPnlCNS", type: "int256" }, { name: "premiumPnlCNS", type: "int256" }] }, { name: "markPricePNS", type: "uint256" }, { name: "markPriceValid", type: "bool" }] },
] as const;

type Read = { busy?: boolean; text?: ReactNode; err?: string };
const usd6 = (x: bigint) => (Number(x) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
const px = (x: bigint) => (Number(x) / 10 ** PERPL.priceDecimals).toLocaleString("en-US", { maximumFractionDigits: 1 });

async function readCre(): Promise<ReactNode> {
  const ok = await client.readContract({ address: CRE.watch, abi: parseAbi(["function safeToAct(bytes32) view returns (bool)"]), functionName: "safeToAct", args: [CRE.requestHash] });
  return <>safeToAct for market {CRE.market}: <b>{ok ? "true" : "false"}</b> (read live)</>;
}
async function readPerpl(): Promise<ReactNode> {
  const acct = await client.readContract({ address: PERPL.exchange, abi: PERPL_ABI, functionName: "getAccountByAddr", args: [PERPL.wallet] });
  const [pos, mark, valid] = await client.readContract({ address: PERPL.exchange, abi: PERPL_ABI, functionName: "getPosition", args: [PERPL.btcPerp, acct.accountId] });
  const open = pos.lotLNS > 0n;
  return (
    <>BTC mark <b>${px(mark)}</b>{valid ? "" : " (stale)"} · account {String(acct.accountId)}: <b>{usd6(acct.balanceCNS)} AUSD</b> free
      {open && <>, {pos.positionType === 1 ? "short" : "long"} open from ${px(pos.pricePNS)} with {usd6(pos.depositCNS)} AUSD margin, P&amp;L {Number(pos.pnlCNS) >= 0 ? "+" : ""}{usd6(pos.pnlCNS)} AUSD</>} (read live)</>
  );
}
async function readKuru(): Promise<ReactNode> {
  const [b, a] = await client.readContract({ address: KURU.book, abi: parseAbi(["function bestBidAsk() view returns (uint256, uint256)"]), functionName: "bestBidAsk" });
  return <>Insurance note: bid <b>${(Number(b) / 1e18).toFixed(2)}</b>, offer <b>${(Number(a) / 1e18).toFixed(2)}</b> (read live)</>;
}

const ENVIO = "https://indexer.dev.hyperindex.xyz/ee81664/v1/graphql";
/** Read-only GraphQL on Envio Cloud (predgeai/predge-validator). Verdict ids are "<chainId>_<block>_<log>". */
async function readEnvio(): Promise<ReactNode> {
  const query = `{ _meta { chainId eventsProcessed isReady } VerdictStats(where:{id:{_eq:"global"}}) { totalVerdicts totalRequests bondsCommitted slashedCount }
    main: Verdict(where:{id:{_like:"143_%"}}) { id } latest: Verdict(where:{id:{_like:"143_%"}}, order_by:{timestamp:desc}, limit:1) { score timestamp tx } }`;
  const r = await fetch(ENVIO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(j.errors?.[0]?.message ?? `HTTP ${r.status}`);
  const d = j.data, g = d.VerdictStats[0], l = d.latest[0];
  const ev = (c: number) => d._meta.find((m: { chainId: number }) => m.chainId === c)?.eventsProcessed ?? "?";
  const when = l ? new Date(l.timestamp * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
  return (
    <>From Envio GraphQL: <b>{d.main.length}</b> verdicts on Monad mainnet ({g.totalVerdicts} incl. testnet), {g.totalRequests} requests, {g.bondsCommitted} bonds, {g.slashedCount} slash.
      {l && <> Latest mainnet verdict {l.score}/100 at {when} UTC (<Ext href={mtx(l.tx)}>tx ↗</Ext>).</>} Synced {ev(143)} + {ev(10143)} events.</>
  );
}

export function Sponsors({ onOpen, walletState }: { onOpen: (id: string) => void; walletState: ReturnType<typeof useWalletState> | null }) {
  const [reads, setReads] = useState<Record<string, Read>>({});
  const run = (k: string, f: () => Promise<ReactNode>) => {
    setReads((r) => ({ ...r, [k]: { busy: true } }));
    f().then((text) => setReads((r) => ({ ...r, [k]: { text } }))).catch((e) => setReads((r) => ({ ...r, [k]: { err: `Could not read right now (${String((e as Error).message).split("\n")[0].slice(0, 80)})` } })));
  };
  /** Opens the live dispute and scrolls to a step of the flow. */
  const toStep = (step: string, market = LIVE_DISPUTE) => {
    onOpen(market);
    setTimeout(() => document.querySelector(`[data-testid="${step}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
  };
  const live = (k: string, label: string, f: () => Promise<ReactNode>) => ({ label, onClick: () => run(k, f), k });
  const jump = (label: string, onClick: () => void) => ({ label, onClick });

  const cards: { name: string; what: string; action?: { label: string; onClick: () => void; k?: string }; proof: { href: string; label: string }[]; note?: string }[] = [
    { name: "Chainlink CRE", what: "A workflow re-checks the signed record and the Monad verdict, reaches consensus, and writes one flag an agent can read: safe to act.", action: live("cre", "Read safeToAct", readCre), proof: [{ href: TESTNET_TX(CRE.reportTx), label: "Report tx ↗" }, { href: tree("cre"), label: "cre/ ↗" }] },
    { name: "Agora AUSD + Perpl", what: "For Bitcoin price markets the hedge is a BTC short on Perpl, margined in Agora's AUSD. The Android app sends it after a fingerprint.", action: live("perpl", "Read BTC mark and margin", readPerpl), proof: [{ href: ANDROID_RELEASE, label: "Android release ↗" }, { href: tree("perpl"), label: "perpl/ ↗" }] },
    { name: "Kuru", what: "Insurance notes that pay if a disputed answer flips, traded on Kuru's order book (test dollars).", action: live("kuru", "Read the order book", readKuru), proof: [{ href: TESTNET_ADDR(KURU.book), label: "Order book ↗" }, { href: tree("kuru"), label: "kuru/ ↗" }] },
    { name: "Nansen", what: `Who holds each side of a disputed market: $${EXPOSURE[LIVE_DISPUTE].contestedUsd.toLocaleString("en-US")} on the disputed NO vs $${EXPOSURE[LIVE_DISPUTE].otherUsd.toLocaleString("en-US")} on YES for the Trump market. Nansen, paid live over x402 on Monad, 13 Oct 20:08 UTC.`, action: jump("Show in step 2", () => toStep("step-exposed")), proof: [{ href: mtx(EXPOSURE[LIVE_DISPUTE].paidTx!), label: "Payment tx ↗" }, { href: tree("nansen"), label: "nansen/ ↗" }] },
    { name: "MetaMask", what: "The Predge plugin for the MetaMask agent CLI refuses to place a bet while the answer is disputed.", action: jump("Show in step 3", () => toStep("step-act")), proof: [{ href: tree("mm-plugin"), label: "mm-plugin/ ↗" }] },
    { name: "x402", what: "Agents pay 0.001 USDC per check, settled on Monad mainnet, no account.", action: jump("Show in step 4", () => toStep("step-pay")), proof: [{ href: mtx(X402_LAST.tx), label: "Payment tx ↗" }] },
    { name: "Aurora", what: "Top up USDC on Monad from 20+ chains through Aurora Intents.", action: jump("Get a live quote", quoteNow), proof: [{ href: tree("aurora"), label: "aurora/ ↗" }] },
    { name: "Privy", what: "Sign in with email; an embedded wallet is created if you have none.", action: walletState ? jump("Sign in with Privy", () => walletState.choose("privy")) : undefined, proof: [{ href: `${REPO}/blob/main/guard/src/wallet/PrivyHost.tsx`, label: "Code ↗" }] },
    { name: "Dynamic", what: "Sign in with the wallet you already use.", action: walletState ? jump("Sign in with Dynamic", () => walletState.choose("dynamic")) : undefined, proof: [{ href: `${REPO}/blob/main/guard/src/wallet/DynamicHost.tsx`, label: "Code ↗" }] },
    { name: "Mera", what: "A passkey is the whole account: no seed phrase, no extension. Also the key in the Android app.", action: jump("Open passkey mode", () => { location.href = "mera.html"; }), proof: [{ href: `${REPO}/blob/main/guard/MERA.md`, label: "MERA.md ↗" }] },
    { name: "Envio", what: "Indexes Predge's contracts on Monad mainnet and testnet (Envio Cloud, predgeai/predge-validator). Verification above still reads the chain directly.", action: live("envio", "Read from Envio", readEnvio), proof: [{ href: ENVIO, label: "GraphQL endpoint ↗" }, { href: tree("indexer"), label: "indexer/ ↗" }] },
  ];

  return (
    <section className="section sponsors" id="sponsors" data-testid="sponsors">
      <div className="section-head"><span className="eyebrow">How it works</span><h2>{cards.length} sponsors, each doing one job</h2></div>
      <div className="sp-grid">
        {cards.map((c) => {
          const r = c.action?.k ? reads[c.action.k] : undefined;
          return (
            <article className="sp-card" key={c.name} data-testid={`sp-${c.name.split(" ")[0].toLowerCase()}`}>
              <h3>{c.name}</h3>
              <p className="sp-what">{c.what}</p>
              {r && <p className={`sp-read ${r.err ? "err" : ""}`} data-testid="sp-read">{r.busy ? "Reading…" : r.err ?? r.text}</p>}
              {c.note && <p className="sp-read muted">{c.note}</p>}
              <div className="sp-links">
                {c.action && <button className="btn-ghost sm" onClick={c.action.onClick}>{c.action.label}</button>}
                {c.proof.map((p) => <Ext key={p.href} href={p.href} className="of-small">{p.label}</Ext>)}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
