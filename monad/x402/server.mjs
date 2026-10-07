// x402 pay-per-call on Monad TESTNET through Monad's x402 facilitator.
//
//   PAY_TO=0x... node monad/x402/server.mjs          listens on http://localhost:4021
//
// GET /v1/settlement-risk/:market costs 0.001 USDC (Monad testnet USDC 0x534b…43A3, x402 v2,
// scheme "exact", network eip155:10143). The facilitator https://x402-facilitator.molandak.org verifies
// the EIP-3009 authorization and settles it on Monad; the payer needs USDC but no MON.
// The handler returns Predge's signed Settlement Risk record for the market (from api.predge.io) and,
// if Predge has written one, the on-chain verdict from PredgeAgentValidator on Monad testnet, so the
// buying agent can check that the verdict's responseHash equals keccak256 of the signed bytes.
// The server holds no key: PAY_TO is a bare address.
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MONAD_TESTNET = "eip155:10143";
export const MONAD_USDC_TESTNET = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
export const FACILITATOR = process.env.FACILITATOR_URL || "https://x402-facilitator.molandak.org";
const PORT = Number(process.env.PORT || 4021);
const PRICE = process.env.PRICE || "$0.001";
const PAY_TO = process.env.PAY_TO && ethers.getAddress(process.env.PAY_TO);
if (!PAY_TO) { console.error("PAY_TO=<address> is required"); process.exit(2); }
const API = process.env.PREDGE_API || "https://api.predge.io";
const RPC = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";

const dep = JSON.parse(readFileSync(path.join(HERE, "..", "deployment.json"), "utf8"));
const chain = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: ethers.Network.from(10143n) });
const validator = new ethers.Contract(dep.contracts.PredgeAgentValidator.address, [
  "event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
  "function getValidationStatus(bytes32) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
], chain);

// Verdicts written by the Monad batch run (monad/batch/results-*.json), indexed by market id.
function loadBatchIndex() {
  const idx = {};
  try {
    const dir = path.join(HERE, "..", "batch");
    for (const f of (readFileSync(path.join(dir, "INDEX"), "utf8").trim().split("\n"))) {
      for (const v of JSON.parse(readFileSync(path.join(dir, f), "utf8")).verdicts) if (v.responseStatus === 1) idx[v.market_id] = v;
    }
  } catch { /* no batch results yet */ }
  return idx;
}
const batch = loadBatchIndex();

const scheme = new ExactEvmScheme();
scheme.registerMoneyParser(async (amount, network) => network === MONAD_TESTNET
  ? { amount: Math.floor(amount * 1_000_000).toString(), asset: MONAD_USDC_TESTNET, extra: { name: "USDC", version: "2" } }
  : null);
const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(MONAD_TESTNET, scheme);

const app = express();
app.use(paymentMiddleware({
  "GET /v1/settlement-risk/:market": {
    accepts: { scheme: "exact", network: MONAD_TESTNET, payTo: PAY_TO, price: PRICE, maxTimeoutSeconds: 120 },
    description: "Predge Settlement Risk record for one Polymarket market (ed25519-signed) plus Predge's on-chain verdict on Monad testnet, if one exists.",
    mimeType: "application/json",
  },
}, server));

app.get("/v1/settlement-risk/:market", async (req, res) => {
  const market = String(req.params.market);
  if (!/^\d{1,12}$/.test(market)) return res.status(400).json({ error: "market must be a Polymarket market id" });
  const r = await fetch(`${API}/v1/settlement-risk/${market}`);
  if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
  const body = await r.json();
  let onchainVerdict = null;
  const v = batch[market];
  if (v) {
    const s = await validator.getValidationStatus(v.requestHash);
    onchainVerdict = { chainId: 10143, contract: await validator.getAddress(), requestHash: v.requestHash, response: Number(s.response), responseHash: s.responseHash, tag: s.tag, lastUpdate: Number(s.lastUpdate), responseTx: v.responseTx,
      // the exact signed record the verdict was bound to when it was written
      boundRecord: JSON.parse(readFileSync(path.join(HERE, "..", "batch", "records", `${market}.json`), "utf8")).attestation };
  }
  res.json({ market, record: body.attestation, onchainVerdict });
});

app.listen(PORT, () => console.log(`x402 on Monad testnet: http://localhost:${PORT}/v1/settlement-risk/<market>  price ${PRICE} USDC  payTo ${PAY_TO}  facilitator ${FACILITATOR}  verdicts indexed ${Object.keys(batch).length}`));
