#!/usr/bin/env node
// Read-only collector for one Polymarket market resolved through the UMA CTF adapter on Polygon.
// Writes every on-chain fact the oracle-outcome test vectors and the ERC-8404 profile snapshots use,
// so each of them can be re-read from any Polygon archive RPC.
//
//   RPC_URL=https://polygon.gateway.tenderly.co node tools/collect-uma-ctf.mjs > grounded-feedback/evidence/polymarket-1992979.json
//
// Only eth_getLogs, eth_getTransactionReceipt, eth_getBlockByNumber and eth_call (at a fixed block).
// No key, no transaction. The market and block numbers are fixed below; the output is deterministic
// for a canonical chain.
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://polygon.gateway.tenderly.co";
const provider = new ethers.JsonRpcProvider(RPC_URL, 137, { staticNetwork: true });

const MARKET = {
  venue: "polymarket",
  marketId: "1992979",
  title: "Will Jon Rahm leave LIV Golf by June 30th?",
  questionId: "0x627ca22bfb2e14b76927ea325fedc7a0bfc72149c2cac5012836a20c0d1b3cc5",
  conditionId: "0xe4de1c9dd575e36eafc75160212e3b99613d03723bf4683fe151e3b353811953",
};
const C = {
  adapter: "0x65070be91477460d8a7aeeb94ef92fe056c2f2a7", // UmaCtfAdapter (Managed OOv2)
  optimisticOracle: "0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1", // UMA Managed Optimistic Oracle V2
  conditionalTokens: "0x4d97dcd97ec945f40cf65f87097ace5ea0476045", // Gnosis ConditionalTokens
};
const INIT_BLOCK = 85616312; // QuestionInitialized
const LAST_BLOCK = 89518530; // QuestionResolved
const READ_BLOCKS = { proposed: 89509500, final: 89518530 };
const IDENTIFIER = ethers.encodeBytes32String("YES_OR_NO_QUERY");

const oo = new ethers.Interface([
  "event RequestPrice(address indexed requester, bytes32 identifier, uint256 timestamp, bytes ancillaryData, address currency, uint256 reward, uint256 finalFee)",
  "event ProposePrice(address indexed requester, address indexed proposer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice, uint256 expirationTimestamp, address currency)",
  "event DisputePrice(address indexed requester, address indexed proposer, address indexed disputer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice)",
  "event Settle(address indexed requester, address indexed proposer, address indexed disputer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 price, uint256 payout)",
  "function getState(address requester, bytes32 identifier, uint256 timestamp, bytes ancillaryData) view returns (uint8)",
]);
const adapter = new ethers.Interface([
  "event QuestionInitialized(bytes32 indexed questionID, uint256 indexed requestTimestamp, address indexed creator, bytes ancillaryData, address rewardToken, uint256 reward, uint256 proposalBond)",
  "event QuestionReset(bytes32 indexed questionID)",
  "event QuestionResolved(bytes32 indexed questionID, int256 indexed settledPrice, uint256[] payouts)",
  "event AncillaryDataUpdated(bytes32 indexed questionID, address indexed owner, bytes update)",
]);
const ctf = new ethers.Interface([
  "event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)",
  "function payoutDenominator(bytes32) view returns (uint256)",
  "function payoutNumerators(bytes32, uint256) view returns (uint256)",
]);
const STATES = ["INVALID", "REQUESTED", "PROPOSED", "EXPIRED", "DISPUTED", "RESOLVED", "SETTLED"];

async function logs(filter, from, to, span = 50000) {
  const out = [];
  for (let a = from; a <= to; ) {
    const b = Math.min(a + span - 1, to);
    try {
      out.push(...(await provider.send("eth_getLogs", [{ ...filter, fromBlock: ethers.toQuantity(a), toBlock: ethers.toQuantity(b) }])));
      a = b + 1;
    } catch (e) {
      if (span <= 500) throw e;
      span = Math.floor(span / 2);
    }
  }
  return out;
}

const pad = (a) => ethers.zeroPadValue(a, 32).toLowerCase();
const num = (x) => BigInt(x).toString();

const adapterLogs = await logs({ address: C.adapter, topics: [null, MARKET.questionId] }, INIT_BLOCK, LAST_BLOCK);
const init = adapterLogs.map((l) => ({ l, p: adapter.parseLog(l) })).find((x) => x.p?.name === "QuestionInitialized");
const ancillaryData = init.p.args.ancillaryData.toLowerCase();
if (ethers.keccak256(ancillaryData) !== MARKET.questionId) throw new Error("questionId != keccak256(ancillaryData)");
const conditionId = ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [C.adapter, MARKET.questionId, 2]);
if (conditionId !== MARKET.conditionId) throw new Error("conditionId mismatch");

const timeline = [];
for (const l of adapterLogs) {
  const p = adapter.parseLog(l);
  const e = { contract: "adapter", event: p.name, transactionHash: l.transactionHash, blockNumber: num(l.blockNumber), logIndex: num(l.logIndex) };
  if (p.name === "QuestionInitialized") e.requestTimestamp = num(p.args.requestTimestamp);
  if (p.name === "QuestionResolved") { e.settledPrice = p.args.settledPrice.toString(); e.payouts = p.args.payouts.map(String); }
  if (p.name === "AncillaryDataUpdated") { e.update = p.args.update; e.owner = p.args.owner.toLowerCase(); }
  timeline.push(e);
}
// Oracle events for this question: filter by requester (the adapter), keep those whose ancillary data hashes to questionId.
const ooTopics = ["RequestPrice", "ProposePrice", "DisputePrice", "Settle"].map((n) => oo.getEvent(n).topicHash);
const windows = [[INIT_BLOCK, INIT_BLOCK], [89504000, LAST_BLOCK]];
for (const [a, b] of windows) {
  for (const l of await logs({ address: C.optimisticOracle, topics: [ooTopics, pad(C.adapter)] }, a, b, 5000)) {
    const p = oo.parseLog(l);
    if (ethers.keccak256(p.args.ancillaryData) !== MARKET.questionId) continue;
    const e = { contract: "optimisticOracle", event: p.name, transactionHash: l.transactionHash, blockNumber: num(l.blockNumber), logIndex: num(l.logIndex), requestTimestamp: num(p.args.timestamp) };
    if (p.name === "ProposePrice" || p.name === "DisputePrice") e.price = p.args.proposedPrice.toString();
    if (p.name === "ProposePrice") e.expirationTimestamp = num(p.args.expirationTimestamp);
    if (p.name === "Settle") e.price = p.args.price.toString();
    timeline.push(e);
  }
}
for (const l of await logs({ address: C.conditionalTokens, topics: [ctf.getEvent("ConditionResolution").topicHash, MARKET.conditionId, pad(C.adapter), MARKET.questionId] }, INIT_BLOCK, LAST_BLOCK)) {
  const p = ctf.parseLog(l);
  timeline.push({ contract: "conditionalTokens", event: p.name, transactionHash: l.transactionHash, blockNumber: num(l.blockNumber), logIndex: num(l.logIndex), payoutNumerators: p.args.payoutNumerators.map(String) });
}
timeline.sort((x, y) => Number(x.blockNumber) - Number(y.blockNumber) || Number(x.logIndex) - Number(y.logIndex));

const requestTimestamps = [...new Set(timeline.filter((e) => e.event === "RequestPrice").map((e) => e.requestTimestamp))];
const reads = {};
for (const [name, block] of Object.entries(READ_BLOCKS)) {
  const b = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(block), false]);
  const call = async (to, iface, fn, args) => iface.decodeFunctionResult(fn, await provider.call({ to, data: iface.encodeFunctionData(fn, args), blockTag: block }))[0];
  const oracleStates = {};
  for (const ts of requestTimestamps) oracleStates[ts] = STATES[Number(await call(C.optimisticOracle, oo, "getState", [C.adapter, IDENTIFIER, ts, ancillaryData]))];
  reads[name] = {
    blockNumber: String(block),
    blockHash: b.hash,
    blockTimestamp: num(b.timestamp),
    oracleStates,
    payoutDenominator: (await call(C.conditionalTokens, ctf, "payoutDenominator", [MARKET.conditionId])).toString(),
    payoutNumerators: [await call(C.conditionalTokens, ctf, "payoutNumerators", [MARKET.conditionId, 0]), await call(C.conditionalTokens, ctf, "payoutNumerators", [MARKET.conditionId, 1])].map(String),
  };
}

const receipts = {};
for (const e of timeline) {
  if (receipts[e.transactionHash]) continue;
  const r = await provider.send("eth_getTransactionReceipt", [e.transactionHash]);
  receipts[e.transactionHash] = {
    status: r.status === "0x1" ? "SUCCESS" : "REVERTED",
    blockNumber: num(r.blockNumber),
    blockHash: r.blockHash,
    logs: r.logs.map((l) => ({ address: l.address.toLowerCase(), topics: l.topics, data: l.data, logIndex: num(l.logIndex) })),
  };
}

console.log(JSON.stringify({
  _README: "Raw on-chain facts for Polymarket market 1992979, collected read-only from Polygon (chain id 137) by tools/collect-uma-ctf.mjs. Re-run the script against any archive RPC to check them.",
  rpc: RPC_URL,
  chainId: "137",
  market: { ...MARKET, outcomes: ["Yes", "No"] },
  contracts: C,
  identifier: "YES_OR_NO_QUERY",
  ancillaryData,
  ancillaryText: ethers.toUtf8String(ancillaryData),
  timeline,
  reads,
  receipts,
}, null, 2));
