import { MEASURED as M } from "../lib/flow";
import { REPO } from "../lib/constants";
import { Ext } from "./ui";

/** "Only possible on Monad", argued with Predge's own measured runs (guard/scripts/measure-monad.mjs). */
export function OnlyMonad() {
  const usdPer = M.monUsd ? M.monPerVerdict * M.monUsd : null;
  const priceDay = M.monUsdAt ? new Date(M.monUsdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
  return (
    <section className="section only-monad" id="why-monad" data-testid="only-monad">
      <div className="section-head">
        <span className="eyebrow">Only possible on Monad</span>
        <h2>A check before every agent trade only works if writing the verdict takes about a second and costs a fraction of a cent.</h2>
      </div>
      <div className="om-grid">
        <div className="om-tile"><div className="om-big">{M.blockIntervalS.toFixed(2)} s</div><div className="om-l">per block</div><div className="om-s">average over 100,000 Monad mainnet blocks from our first verdict</div></div>
        <div className="om-tile"><div className="om-big">{M.run2.seconds[0]}–{M.run2.seconds[1]} s</div><div className="om-l">from request to verdict, both confirmed</div><div className="om-s">{M.run2.pairs} markets on 13 Oct, {M.run2.blocks[0]}–{M.run2.blocks[1]} blocks apart, sent from a laptop over the public endpoint</div></div>
        <div className="om-tile"><div className="om-big">{M.run1.txs} tx in {M.run1.seconds} s</div><div className="om-l">one run, all confirmed</div><div className="om-s">34 markets on 12 Oct (22 verdicts, 12 open requests) landed in {M.run1.blocks} blocks</div></div>
        <div className="om-tile"><div className="om-big">{usdPer !== null ? `$${usdPer.toFixed(4)}` : `${M.monPerVerdict.toFixed(3)} MON`}</div><div className="om-l">per verdict, request included</div><div className="om-s">{M.monPerVerdict.toFixed(4)} MON at {M.gasPriceGwei} gwei{usdPer !== null && <> × MON ${M.monUsd!.toFixed(4)} (<Ext href={M.monUsdSource}>CoinGecko</Ext>, {priceDay})</>}</div></div>
      </div>
      <p className="om-foot muted sm">
        Measured, not quoted: {M.txs} transactions for {M.markets} markets ({M.verdicts} verdicts) in the 12 and 13 Oct mainnet runs, all succeeded, {M.totalMON.toFixed(3)} MON in total.
        Times are block timestamps, costs are gas used × effective gas price from the receipts, read from {M.rpc.replace("https://", "")}.{" "}
        <Ext href={`${REPO}/blob/main/guard/scripts/measure-monad.mjs`}>Script ↗</Ext> · <Ext href={`${REPO}/tree/main/monad/mainnet/runs`}>Runs ↗</Ext>
      </p>
    </section>
  );
}
