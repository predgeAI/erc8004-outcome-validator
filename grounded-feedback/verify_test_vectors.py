#!/usr/bin/env python3
"""Second, independent verifier for the x402-grounded-feedback-v0 test vectors, in Python.

    pip install cryptography pycryptodome
    python3 grounded-feedback/verify_test_vectors.py

Shares no code with the Node scripts: canonical JSON comes from json.dumps, ed25519 from
`cryptography`, keccak256 from `pycryptodome`, the validationResponse calldata is decoded by
hand, and the field rules are its own reading of README.md. Exit 0 when every check in every vector comes out as its `expect` block says.
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


rfc_ok = ed25519_ok(
    b"",
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
)
print(("ok  " if rfc_ok else "FAIL") + " RFC 8032 TEST 1 signature verifies")
failed = not rfc_ok

for path in sys.argv[1:] or sorted(glob.glob(os.path.join(HERE, "test-vectors", "*.json"))):
    v = json.load(open(path, encoding="utf-8"))
    env, payload = v["envelope"], v["envelope"]["payload"]
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
    problems = schema_problems(payload)
    got["schemaValid"] = not problems
    call = decode_validation_response(v["validationResponse"]["calldata"])
    call_ok = call["requestHash"] == v["validationResponse"]["requestHash"] and call["response"] == v["validationResponse"]["response"] \
        and call["responseURI"] == v["validationResponse"]["responseURI"] and call["responseHash"] == v["responseHash"] and call["tag"] == payload["grounding"]
    got["accept"] = got["canonicalMatches"] and got["signatureValid"] and got["responseHashMatches"] \
        and got.get("requirementsHashMatches", True) and got.get("requirementsConsistent", True) and got["schemaValid"] and call_ok

    name = os.path.basename(path)
    for check, want in v["expect"].items():
        ok = got.get(check) == want
        failed |= not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name} {check} = {got.get(check)} (expected {want})")
    if problems and v["expect"].get("schemaValid") is not False:
        failed = True
        print(f"FAIL {name} schema: {'; '.join(problems)}")
    elif problems:
        print(f"     {name} schema problems, as expected: {'; '.join(problems)}")
    if not call_ok:
        failed = True
        print(f"FAIL {name} validationResponse calldata does not decode to the stated fields")

print("RED" if failed else "GREEN")
sys.exit(1 if failed else 0)
