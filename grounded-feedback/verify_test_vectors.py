#!/usr/bin/env python3
"""Second, independent verifier for the x402-grounded-feedback-v0 and oracle-outcome-validation-v0 test vectors, in Python.

    pip install cryptography pycryptodome
    python3 grounded-feedback/verify_test_vectors.py

Shares no code with the Node scripts: canonical JSON comes from json.dumps, ed25519 from
`cryptography`, keccak256 from `pycryptodome`, the validationResponse calldata is decoded by
hand, and the field rules are its own reading of README.md and oracle-outcome.md. Exit 0 when every check in every
vector comes out as its `expect` block says.

Offline only: for oracle-outcome vectors whose verdict also depends on chain state (`onchainStateMatches` in
`expect`), it checks `acceptOffline`; the on-chain re-read is `node grounded-feedback/verify-test-vectors.mjs --onchain`.
One on-chain rule it does check, against the read committed in the vector's evidence file rather than a chain call:
a record read where the oracle request is SETTLED or RESOLVED and payoutDenominator is still 0 gets reason settled_not_resolved
(`onchainReason` in `expect`).
"""
import glob
import hashlib
import json
import os
import re
import sys

from Crypto.Hash import keccak
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

HERE = os.path.dirname(os.path.abspath(__file__))
SELECTOR = "3d659a96"  # validationResponse(bytes32,uint8,string,bytes32,string)
CAIP19 = re.compile(r"^eip155:([1-9][0-9]*)/erc20:(0x[0-9a-f]{40})$")
ADDR = re.compile(r"^0x[0-9a-f]{40}$")
H32 = re.compile(r"^0x[0-9a-f]{64}$")
DEC = re.compile(r"^(0|[1-9][0-9]{0,77})$")
REGISTRY = re.compile(r"^eip155:[1-9][0-9]*:0x[0-9a-f]{40}$")
ISSUED_AT = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$")
REQUIRED = ["scheme", "grounding", "payer", "payee", "ratee", "amount", "asset", "resource", "nonce", "settlementTx"]
OPTIONAL = ["requirementsHash", "issuedAt", "assetType", "measured"]
# capacity-attest's unit table: which measured.unit each assetType allows
UNITS = {"gpu-hours": {"gpu-second"}, "storage": {"byte", "byte-second"}, "bandwidth": {"byte"}, "api-credits": {"call", "token", "credit"}}


def canonical(value):
    # Keys in this schema are ASCII, so code-point order (Python) equals UTF-16 order (RFC 8785).
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def schema_problems(r):
    """Field rules from README.md "Record fields" and the measured mapping. Returns a list of problems."""
    p = []
    extra = ["escrow"] if r.get("grounding") == "escrow-release" else []
    p += [f"unknown key {k}" for k in r if k not in REQUIRED + OPTIONAL + extra]
    p += [f"missing {k}" for k in REQUIRED + extra if k not in r]
    if r.get("scheme") != "x402-grounded-feedback-v0":
        p.append("scheme")
    if r.get("grounding") not in ("x402-settlement", "escrow-release", "settlement-contract"):
        p.append("grounding")
    p += [f"{k} not a lower-case address" for k in ("payer", "payee", "escrow") if k in r and not ADDR.match(str(r[k]))]
    p += [f"{k} not 0x + 64 lower-case hex" for k in ("nonce", "settlementTx", "requirementsHash") if k in r and not H32.match(str(r[k]))]
    if not DEC.match(str(r.get("amount", ""))):
        p.append("amount")
    if not CAIP19.match(str(r.get("asset", ""))):
        p.append("asset")
    if not isinstance(r.get("resource"), str) or not r["resource"]:
        p.append("resource")
    rt = r.get("ratee")
    if not isinstance(rt, dict) or sorted(rt) != ["agentId", "agentRegistry"] \
            or not REGISTRY.match(str(rt["agentRegistry"])) or not DEC.match(str(rt["agentId"])):
        p.append("ratee")
    if "issuedAt" in r and not ISSUED_AT.match(str(r["issuedAt"])):
        p.append("issuedAt not YYYY-MM-DDTHH:MM:SS.sssZ")
    if ("assetType" in r) != ("measured" in r):
        p.append("assetType and measured come together")
    m = r.get("measured")
    if m is not None:
        if "issuedAt" not in r:
            p.append("measured needs issuedAt")
        unit = m.get("unit") if isinstance(m, dict) else None
        if "assetType" in r and unit not in UNITS.get(r["assetType"], set()):
            p.append(f"measured.unit {unit} not allowed for assetType {r['assetType']}")
        end = (m.get("period") or {}).get("end") if isinstance(m, dict) else None
        if not isinstance(end, str) or not isinstance(r.get("issuedAt"), str) or end[:19] > r["issuedAt"][:19]:
            p.append("measured.period.end later than issuedAt")

    def leaves(v, path):
        if isinstance(v, dict):
            for k, x in v.items():
                leaves(x, f"{path}.{k}")
        elif not isinstance(v, str):
            p.append(f"{path} is not a string")
    leaves(r, "record")
    return p


def keccak256(data):
    return "0x" + keccak.new(digest_bits=256, data=data).hexdigest()


def ed25519_ok(message, public_key_hex, signature_hex):
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex)).verify(bytes.fromhex(signature_hex), message)
        return True
    except InvalidSignature:
        return False


def decode_validation_response(calldata):
    data = bytes.fromhex(calldata[2:])
    if data[:4].hex() != SELECTOR:
        raise ValueError("not validationResponse")
    body = data[4:]
    word = lambda i: body[32 * i: 32 * i + 32]

    def string_at(offset):
        n = int.from_bytes(body[offset: offset + 32], "big")
        return body[offset + 32: offset + 32 + n].decode("utf-8")

    return {
        "requestHash": "0x" + word(0).hex(),
        "response": int.from_bytes(word(1), "big"),
        "responseURI": string_at(int.from_bytes(word(2), "big")),
        "responseHash": "0x" + word(3).hex(),
        "tag": string_at(int.from_bytes(word(4), "big")),
    }


ORACLE_KEYS = ["scheme", "requestHash", "ratee", "subject", "claimedOutcome", "observedOutcome", "score", "outcomeState", "oracle", "issuedAt"]
ORACLE_REF_KEYS = ["kind", "chainId", "oracle", "requester", "conditionalTokens", "questionId", "identifier", "requestTimestamp",
                   "price", "readBlock", "readBlockHash", "stateTx"]
# UMA YES_OR_NO_QUERY prices under Polymarket's res_data (p1 = No, p2 = Yes, p3 = unknown/50-50)
PRICE_LABEL = {"0": "No", "1000000000000000000": "Yes", "500000000000000000": "Unknown"}
RES_DATA = "res_data: p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to No, p2 to Yes, p3 to unknown/50-50."
INT = re.compile(r"^(0|-?[1-9][0-9]{0,77})$")


def oracle_schema_problems(r, ancillary_hex):
    """Field rules from oracle-outcome.md "Record fields". Returns a list of problems."""
    p = [f"unknown key {k}" for k in r if k not in ORACLE_KEYS + ["supersedes"]]
    p += [f"missing {k}" for k in ORACLE_KEYS if k not in r]
    if r.get("scheme") != "oracle-outcome-validation-v0":
        p.append("scheme")
    if not H32.match(str(r.get("requestHash", ""))):
        p.append("requestHash")
    if "supersedes" in r and not H32.match(str(r["supersedes"])):
        p.append("supersedes")
    rt = r.get("ratee")
    if not isinstance(rt, dict) or sorted(rt) != ["agentId", "agentRegistry"] \
            or not REGISTRY.match(str(rt["agentRegistry"])) or not DEC.match(str(rt["agentId"])):
        p.append("ratee")
    s = r.get("subject")
    if not isinstance(s, dict) or sorted(s) != ["conditionId", "marketId", "venue"] or s["venue"] != "polymarket" \
            or not DEC.match(str(s["marketId"])) or not H32.match(str(s["conditionId"])):
        p.append("subject")
        s = None
    if r.get("outcomeState") not in ("proposed", "disputed", "final"):
        p.append("outcomeState")
    if not ISSUED_AT.match(str(r.get("issuedAt", ""))):
        p.append("issuedAt not YYYY-MM-DDTHH:MM:SS.sssZ")
    o = r.get("oracle")
    if not isinstance(o, dict) or sorted(o) != sorted(ORACLE_REF_KEYS):
        p.append("oracle must have exactly the oracle reference keys")
    else:
        if o["kind"] != "uma-ctf-adapter" or o["identifier"] != "YES_OR_NO_QUERY":
            p.append("oracle.kind / oracle.identifier")
        p += [f"oracle.{k}" for k in ("oracle", "requester", "conditionalTokens") if not ADDR.match(str(o[k]))]
        p += [f"oracle.{k}" for k in ("questionId", "readBlockHash", "stateTx") if not H32.match(str(o[k]))]
        p += [f"oracle.{k}" for k in ("chainId", "requestTimestamp", "readBlock") if not DEC.match(str(o[k]))]
        if not INT.match(str(o["price"])):
            p.append("oracle.price")
        if PRICE_LABEL.get(o["price"]) != r.get("observedOutcome"):
            p.append("observedOutcome is not the label of oracle.price")
        if s and ADDR.match(str(o["requester"])) and H32.match(str(o["questionId"])):
            packed = bytes.fromhex(o["requester"][2:]) + bytes.fromhex(o["questionId"][2:]) + (2).to_bytes(32, "big")
            if keccak256(packed) != s["conditionId"]:
                p.append("subject.conditionId != keccak256(requester ++ questionId ++ uint256(2))")
        if ancillary_hex is not None:
            data = bytes.fromhex(ancillary_hex[2:])
            if keccak256(data) != o["questionId"]:
                p.append("keccak256(ancillaryData) != oracle.questionId")
            elif RES_DATA not in data.decode("utf-8"):
                p.append("ancillaryData does not carry the YES_OR_NO res_data mapping")
    if not isinstance(r.get("claimedOutcome"), str) or not r["claimedOutcome"]:
        p.append("claimedOutcome")
    if r.get("score") != ("100" if r.get("claimedOutcome") == r.get("observedOutcome") else "0"):
        p.append("score must be 100 on a match, else 0")

    def leaves(v, path):
        if isinstance(v, dict):
            for k, x in v.items():
                leaves(x, f"{path}.{k}")
        elif not isinstance(v, str):
            p.append(f"{path} is not a string")
    leaves(r, "record")
    return p


SETTLED_NOT_RESOLVED = "settled_not_resolved"


def committed_read(v, r):
    """The read in the vector's evidence file at the record's readBlock and readBlockHash, or None."""
    ev = v.get("evidence") or {}
    o = r.get("oracle") if isinstance(r.get("oracle"), dict) else {}
    if not ev.get("file") or not o:
        return None
    reads = json.load(open(os.path.join(HERE, "..", ev["file"]), encoding="utf-8")).get("reads", {})
    return next((x for x in reads.values() if x.get("blockNumber") == o.get("readBlock") and x.get("blockHash") == o.get("readBlockHash")), None)


def window_reason(r, read):
    """oracle-outcome.md rule 2, settled but not resolved: no record is valid there, whatever its outcomeState."""
    state = read["oracleStates"].get(r["oracle"]["requestTimestamp"])
    return SETTLED_NOT_RESOLVED if state in ("SETTLED", "RESOLVED") and read["payoutDenominator"] == "0" else None


def self_consistent(v):
    env = v["envelope"]
    data = canonical(env["payload"]).encode("utf-8")
    return data.decode("utf-8") == env["canonical"] and ed25519_ok(data, env["public_key"], env["signature"]) and keccak256(data) == v["responseHash"]


def supersede_problems(r, own_hash, known):
    """supersedes rules from oracle-outcome.md "Superseding"."""
    p = []

    def same_request(x):
        return all(x.get(k) == r.get(k) for k in ("scheme", "requestHash", "ratee", "subject", "claimedOutcome"))
    if "supersedes" in r:
        prior = known.get(r["supersedes"])
        if r["supersedes"] == own_hash:
            p.append("supersedes names the record itself")
        elif prior is None:
            p.append("supersedes names no known record")
        else:
            if not same_request(prior):
                p.append("superseded record is for a different request")
            if prior.get("outcomeState") == "final":
                p.append("a final record is never superseded")
            if "oracle" in prior and int(prior["oracle"]["readBlock"]) >= int(r["oracle"]["readBlock"]):
                p.append("superseded record was not read at an earlier block")
            if not str(prior.get("issuedAt", "")) or not prior.get("issuedAt", "") < r["issuedAt"]:
                p.append("superseded record was not issued earlier")
    elif r.get("outcomeState") == "final":
        for h, x in known.items():
            if h != own_hash and same_request(x) and x.get("issuedAt", "") < r["issuedAt"]:
                p.append(f"final record leaves earlier record {h} unsuperseded")
                break
    return p


rfc_ok = ed25519_ok(
    b"",
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
)
print(("ok  " if rfc_ok else "FAIL") + " RFC 8032 TEST 1 signature verifies")
failed = not rfc_ok

dir_files = sorted(glob.glob(os.path.join(HERE, "test-vectors", "*.json")))
files = sys.argv[1:] or dir_files
known = {}
for path in sorted(set(dir_files) | set(files)):
    vv = json.load(open(path, encoding="utf-8"))
    if self_consistent(vv):
        known[vv["responseHash"]] = vv["envelope"]["payload"]

for path in files:
    v = json.load(open(path, encoding="utf-8"))
    env, payload = v["envelope"], v["envelope"]["payload"]
    is_oracle = payload.get("scheme") == "oracle-outcome-validation-v0"
    data = canonical(payload).encode("utf-8")
    got = {
        "canonicalMatches": data.decode("utf-8") == env["canonical"] and len(env["canonical"].encode("utf-8")) == v["canonicalByteLength"],
        "signatureValid": env["algorithm"] == "ed25519" and ed25519_ok(data, env["public_key"], env["signature"]),
        "responseHashMatches": keccak256(data) == v["responseHash"],
    }
    if "requirements" in v:
        q = v["requirements"]
        got["requirementsHashMatches"] = "0x" + hashlib.sha256(canonical(q).encode("utf-8")).hexdigest() == payload.get("requirementsHash")
        m = CAIP19.match(payload["asset"])
        got["requirementsConsistent"] = bool(m) and q["amount"] == payload["amount"] and q["payTo"].lower() == payload["payee"] \
            and q["asset"].lower() == m.group(2) and q["network"] == "eip155:" + m.group(1)
    ancillary = (v.get("evidence") or {}).get("ancillaryData")
    problems = oracle_schema_problems(payload, ancillary) if is_oracle else schema_problems(payload)
    got["schemaValid"] = not problems
    call = decode_validation_response(v["validationResponse"]["calldata"])
    call_ok = call["requestHash"] == v["validationResponse"]["requestHash"] and call["response"] == v["validationResponse"]["response"] \
        and call["responseURI"] == v["validationResponse"]["responseURI"] and call["responseHash"] == v["responseHash"] \
        and call["tag"] == v["validationResponse"]["tag"]
    chain_problems = []
    if is_oracle:
        call_ok = call_ok and call["requestHash"] == payload["requestHash"] and str(call["response"]) == payload["score"] \
            and ("request" not in v or keccak256(canonical(v["request"]["document"]).encode("utf-8")) == payload["requestHash"])
        got["stateTagConsistent"] = call["tag"] == "oracle-outcome:" + str(payload.get("outcomeState"))
        if got["schemaValid"]:
            chain_problems = supersede_problems(payload, keccak256(data), known)
            got["supersedeChainValid"] = not chain_problems
    else:
        call_ok = call_ok and call["tag"] == payload["grounding"]
    got["acceptOffline"] = got["canonicalMatches"] and got["signatureValid"] and got["responseHashMatches"] \
        and got.get("requirementsHashMatches", True) and got.get("requirementsConsistent", True) and got["schemaValid"] \
        and got.get("stateTagConsistent", True) and got.get("supersedeChainValid", True) and call_ok
    needs_chain = "onchainStateMatches" in v["expect"]
    got["accept"] = got["acceptOffline"]
    read = committed_read(v, payload) if is_oracle and got["schemaValid"] and "onchainReason" in v["expect"] else None
    if read is not None:
        got["onchainReason"] = window_reason(payload, read)

    name = os.path.basename(path)
    for check, want in v["expect"].items():
        if needs_chain and check in ("onchainStateMatches", "accept"):
            continue
        if check == "onchainReason" and read is None:
            print(f"     {name} onchainReason not checked: no committed read at its readBlock")
            continue
        if check == "acceptOffline" and not needs_chain:
            continue
        ok = got.get(check) == want
        failed |= not ok
        src = " (from the committed read in evidence/, not a chain call)" if check == "onchainReason" else ""
        print(f"{'ok  ' if ok else 'FAIL'} {name} {check} = {got.get(check)} (expected {want}){src}")
    if needs_chain:
        print(f"     {name} on-chain checks not run here (node grounded-feedback/verify-test-vectors.mjs --onchain)")
    if problems and v["expect"].get("schemaValid") is not False:
        failed = True
        print(f"FAIL {name} schema: {'; '.join(problems)}")
    elif problems:
        print(f"     {name} schema problems, as expected: {'; '.join(problems)}")
    if chain_problems:
        print(f"     {name} supersede problems{', as expected' if v['expect'].get('supersedeChainValid') is False else ''}: {'; '.join(chain_problems)}")
    if not call_ok:
        if v["expect"].get("accept") is not False:
            failed = True
        print(f"{'FAIL' if v['expect'].get('accept') is not False else '    '} {name} validationResponse calldata does not match the record (request, score or tag)")

print("RED" if failed else "GREEN")
sys.exit(1 if failed else 0)
