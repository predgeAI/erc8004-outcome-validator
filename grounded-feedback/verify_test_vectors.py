#!/usr/bin/env python3
"""Second, independent verifier for the x402-grounded-feedback-v0 test vectors, in Python.

    pip install cryptography pycryptodome
    python3 grounded-feedback/verify_test_vectors.py

Shares no code with the Node scripts: canonical JSON comes from json.dumps, ed25519 from
`cryptography`, keccak256 from `pycryptodome`, and the validationResponse calldata is decoded by
hand. Exit 0 when every check in every vector comes out as its `expect` block says.
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


def canonical(value):
    # Keys in this schema are ASCII, so code-point order (Python) equals UTF-16 order (RFC 8785).
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


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
    call = decode_validation_response(v["validationResponse"]["calldata"])
    call_ok = call["requestHash"] == v["validationResponse"]["requestHash"] and call["response"] == v["validationResponse"]["response"] \
        and call["responseURI"] == v["validationResponse"]["responseURI"] and call["responseHash"] == v["responseHash"] and call["tag"] == payload["grounding"]
    got["accept"] = got["canonicalMatches"] and got["signatureValid"] and got["responseHashMatches"] \
        and got.get("requirementsHashMatches", True) and got.get("requirementsConsistent", True) and call_ok

    name = os.path.basename(path)
    for check, want in v["expect"].items():
        ok = got.get(check) == want
        failed |= not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name} {check} = {got.get(check)} (expected {want})")
    if not call_ok:
        failed = True
        print(f"FAIL {name} validationResponse calldata does not decode to the stated fields")

print("RED" if failed else "GREEN")
sys.exit(1 if failed else 0)
