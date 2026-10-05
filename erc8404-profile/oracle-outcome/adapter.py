#!/usr/bin/env python3
"""Executable gate for the RVR (ERC-8404) oracle-outcome profile, UMA CTF adapter v0.

    python3 erc8404-profile/oracle-outcome/adapter.py --check    # recompute everything, compare with expected.json
    python3 erc8404-profile/oracle-outcome/adapter.py --write    # rebuild vectors, profile pins, receipts, manifest

The pinned profile (verification-profile.json and the files it pins) is the authority. This
standard-library-only adapter is conformance evidence for it, written by Predge from SPEC.md. It
imports no RVR reference adapter and no Ethereum library, and --check makes no network call:
evaluation reads only the committed claim, evidence set and snapshot bytes.

--write builds the two snapshots from grounded-feedback/evidence/polymarket-1992979.json, which
tools/collect-uma-ctf.mjs reads from Polygon. That build step is not part of recomputation.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

PACKAGE_ROOT = Path(__file__).resolve().parents[1]  # erc8404-profile/
PROFILE_DIR = "oracle-outcome"
PROFILE_PATH = PACKAGE_ROOT / PROFILE_DIR / "verification-profile.json"
GENERIC_SCHEMA_PATH = PACKAGE_ROOT / "conformance/rvr-v0/verification-profile-manifest.schema.json"
GENERIC_SCHEMA_SHA256 = "148afeb484d3866c1caae82e574182c1b748dd461dfaeb1d8095ecf4905690c1"
EVIDENCE_PATH = PACKAGE_ROOT.parent / "grounded-feedback/evidence/polymarket-1992979.json"

FINAL = "rvr.oracle-outcome.v0.final_outcome_under_committed_rules"
PROPOSED = "rvr.oracle-outcome.v0.proposed_outcome_at_committed_snapshot"
RES_DATA = "res_data: p1: 0, p2: 1, p3: 0.5. Where p1 corresponds to No, p2 to Yes, p3 to unknown/50-50."
PRICE_LABEL = {"0": "No", "1000000000000000000": "Yes", "500000000000000000": "Unknown"}
PAYOUT_LABEL = {("1", "0"): "Yes", ("0", "1"): "No", ("1", "1"): "Unknown"}
PACKAGE_MEMBERS = (
    "conformance/rvr-v0/LICENSE",
    "conformance/rvr-v0/NOTICE",
    "conformance/rvr-v0/verification-profile-manifest.schema.json",
    "oracle-outcome/README.md",
    "oracle-outcome/SPEC.md",
    "oracle-outcome/adapter.py",
    "oracle-outcome/expected.json",
    "oracle-outcome/profile.schema.json",
    "oracle-outcome/receipts.json",
    "oracle-outcome/rvr.schema.json",
    "oracle-outcome/test_profile.py",
    "oracle-outcome/vectors.json",
    "oracle-outcome/verification-profile.json",
)


class GateRejected(Exception):
    def __init__(self, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


class SchemaError(Exception):
    pass


# ---- bytes, hashes ------------------------------------------------------------------------------

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000, 0x000000000000808B,
    0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008A, 0x0000000000000088,
    0x0000000080008009, 0x000000008000000A, 0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_M = (1 << 64) - 1


def _keccak_f(a: list[list[int]]) -> None:
    for rc in _RC:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ (((c[(x + 1) % 5] << 1) | (c[(x + 1) % 5] >> 63)) & _M) for x in range(5)]
        for x in range(5):
            for y in range(5):
                a[x][y] ^= d[x]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                r = _ROT[x][y]
                b[y][(2 * x + 3 * y) % 5] = ((a[x][y] << r) | (a[x][y] >> (64 - r))) & _M if r else a[x][y]
        for x in range(5):
            for y in range(5):
                a[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y])
        a[0][0] ^= rc


def keccak256(data: bytes) -> str:
    """Ethereum's keccak256 (original Keccak padding 0x01, not NIST SHA3-256). Lowercase 0x hex."""
    rate = 136
    msg = bytearray(data) + b"\x01" + b"\x00" * ((rate - (len(data) + 1) % rate) % rate)
    msg[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off:off + rate]
        for i in range(rate // 8):
            a[i % 5][i // 5] ^= int.from_bytes(block[8 * i:8 * i + 8], "little")
        _keccak_f(a)
    out = b"".join(a[i % 5][i // 5].to_bytes(8, "little") for i in range(4))
    return "0x" + out.hex()


assert keccak256(b"") == "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"

TOPIC_CONDITION_RESOLUTION = keccak256(b"ConditionResolution(bytes32,address,bytes32,uint256,uint256[])")
TOPIC_QUESTION_RESOLVED = keccak256(b"QuestionResolved(bytes32,int256,uint256[])")


# ---- rvr-canonical-json-v0 ------------------------------------------------------------------------

def _reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in pairs:
        if k in out:
            raise GateRejected("rvr.gate.schema_invalid", f"duplicate key {k!r}")
        out[k] = v
    return out


def _no_number(_: str) -> Any:
    raise GateRejected("rvr.gate.schema_invalid", "JSON numbers are forbidden")


def parse_json(data: bytes, label: str, numbers: bool = False) -> Any:
    """Strict parse: duplicate keys and lone surrogates rejected; JSON numbers rejected unless the
    file is a JSON Schema (`numbers=True`), which is not an identity-bearing object."""
    no = {} if numbers else {"parse_int": _no_number, "parse_float": _no_number, "parse_constant": _no_number}
    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=_reject_duplicates, **no)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GateRejected("rvr.gate.schema_invalid", f"{label}: {error}") from error
    _reject_surrogates(value)
    return value


def _reject_surrogates(v: Any) -> None:
    if isinstance(v, str):
        if any(0xD800 <= ord(ch) <= 0xDFFF for ch in v):
            raise GateRejected("rvr.gate.schema_invalid", "lone surrogate")
    elif isinstance(v, list):
        for x in v:
            _reject_surrogates(x)
    elif isinstance(v, dict):
        for k, x in v.items():
            _reject_surrogates(k)
            _reject_surrogates(x)


_ESC = {0x22: '\\"', 0x5C: "\\\\", 0x08: "\\b", 0x09: "\\t", 0x0A: "\\n", 0x0C: "\\f", 0x0D: "\\r"}


def _string(s: str) -> str:
    out = ['"']
    for ch in s:
        o = ord(ch)
        if o in _ESC:
            out.append(_ESC[o])
        elif o < 0x20:
            out.append("\\u00%02x" % o)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def canonical_json(v: Any) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, str):
        return _string(v)
    if isinstance(v, list):
        return "[" + ",".join(canonical_json(x) for x in v) + "]"
    if isinstance(v, dict):
        # Python str comparison is by code point, which is Unicode scalar-value order.
        return "{" + ",".join(_string(k) + ":" + canonical_json(v[k]) for k in sorted(v)) + "}"
    raise GateRejected("rvr.gate.schema_invalid", f"value outside the canonical domain: {type(v).__name__}")


def canonical_bytes(v: Any) -> bytes:
    return canonical_json(v).encode("utf-8")


def canonical_digest(v: Any) -> str:
    return sha256(canonical_bytes(v))


# ---- a small JSON Schema subset (the keywords the pinned schemas use) ----------------------------

def resolve_pointer(root: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#"):
        raise SchemaError(f"non-local $ref {ref}")
    node: Any = root
    for part in [p for p in ref[1:].split("/") if p]:
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return node


def _type_ok(v: Any, t: str) -> bool:
    return {"object": isinstance(v, dict), "array": isinstance(v, list), "string": isinstance(v, str),
            "boolean": isinstance(v, bool), "null": v is None}.get(t, False)


def validate(v: Any, schema: dict[str, Any], root: dict[str, Any], path: str = "$") -> None:
    import re
    if "$ref" in schema:
        validate(v, resolve_pointer(root, schema["$ref"]), root, path)
    if "oneOf" in schema:
        hits = 0
        for alt in schema["oneOf"]:
            try:
                validate(v, alt, root, path)
                hits += 1
            except SchemaError:
                pass
        if hits != 1:
            raise SchemaError(f"{path}: matches {hits} oneOf branches")
    if "type" in schema and not _type_ok(v, schema["type"]):
        raise SchemaError(f"{path}: not {schema['type']}")
    if "const" in schema and v != schema["const"]:
        raise SchemaError(f"{path}: not the constant")
    if "enum" in schema and v not in schema["enum"]:
        raise SchemaError(f"{path}: not in enum")
    if "pattern" in schema and (not isinstance(v, str) or not re.search(schema["pattern"], v)):
        raise SchemaError(f"{path}: pattern")
    if isinstance(v, dict):
        for k in schema.get("required", []):
            if k not in v:
                raise SchemaError(f"{path}: missing {k}")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            extra = set(v) - set(props)
            if extra:
                raise SchemaError(f"{path}: unknown keys {sorted(extra)}")
        for k, sub in props.items():
            if k in v:
                validate(v[k], sub, root, f"{path}.{k}")
    if isinstance(v, list):
        if "minItems" in schema and len(v) < schema["minItems"]:
            raise SchemaError(f"{path}: too few items")
        if "maxItems" in schema and len(v) > schema["maxItems"]:
            raise SchemaError(f"{path}: too many items")
        if "items" in schema:
            for i, x in enumerate(v):
                validate(x, schema["items"], root, f"{path}[{i}]")


def check(v: Any, schema: dict[str, Any], pointer: str) -> None:
    try:
        validate(v, resolve_pointer(schema, pointer) if pointer != "#" else schema, schema)
    except SchemaError as error:
        raise GateRejected("rvr.gate.schema_invalid", str(error)) from error


# ---- profile bootstrap and dependency resolution -------------------------------------------------

def safe_path(raw: str) -> Path:
    parts = raw.split("/")
    if raw.startswith("/") or "\\" in raw or ":" in raw or any(p in ("", ".", "..") for p in parts):
        raise GateRejected("rvr.gate.schema_invalid", f"bad dependency path {raw!r}")
    path = (PACKAGE_ROOT / raw).resolve()
    if PACKAGE_ROOT.resolve() not in path.parents:
        raise GateRejected("rvr.gate.schema_invalid", f"dependency escapes the package root: {raw!r}")
    return path


def dependencies(profile: dict[str, Any]) -> list[dict[str, Any]]:
    deps = [profile["profileSchemaContract"]["manifest"], profile["profileSchemaContract"]["constraints"],
            profile["verificationSpecification"], *profile["conformanceVectorSet"]["members"], *profile["schemaContracts"]]
    return deps


def vector_set_digest(members: list[dict[str, Any]]) -> str:
    rows = "".join(f"{m['path']}\t{m['sha256']}\n" for m in sorted(members, key=lambda m: m["path"]))
    return sha256(rows.encode("utf-8"))


class Profile:
    def __init__(self, overrides: dict[str, bytes | None] | None = None) -> None:
        """Bootstrap: generic schema, profile envelope, each pinned dependency (resolve, read, sha256, use),
        and only then the profile-specific constraints. `overrides` substitutes dependency bytes by id
        (None = unavailable) for the negative controls."""
        overrides = overrides or {}
        generic_bytes = GENERIC_SCHEMA_PATH.read_bytes()
        if sha256(generic_bytes) != GENERIC_SCHEMA_SHA256:
            raise GateRejected("rvr.gate.identity_mismatch", "generic bootstrap schema is not the RVR v0 schema")
        generic = parse_json(generic_bytes, "generic schema", numbers=True)
        self.profile = parse_json(PROFILE_PATH.read_bytes(), "verification-profile.json")
        check(self.profile, generic, "#")
        self.bytes: dict[str, bytes] = {}
        self.missing: list[str] = []
        self.mismatched: list[str] = []
        for dep in dependencies(self.profile):
            if dep["id"] in overrides:
                data = overrides[dep["id"]]
            else:
                try:
                    data = safe_path(dep["path"]).read_bytes()
                except OSError:
                    data = None
            if data is None:
                self.missing.append(dep["id"])
                continue
            if sha256(data) != dep["sha256"]:
                self.mismatched.append(dep["id"])
                continue
            self.bytes[dep["id"]] = data
        manifest_dep = self.profile["profileSchemaContract"]["manifest"]
        if self.bytes.get(manifest_dep["id"]) != generic_bytes:
            raise GateRejected("rvr.gate.identity_mismatch", "profile does not pin the bootstrap schema it was validated with")
        constraints_dep = self.profile["profileSchemaContract"]["constraints"]
        if constraints_dep["id"] not in self.bytes:
            # Never parsed or applied unless its bytes match the pin.
            self.constraints_applied = False
            raise GateRejected("rvr.gate.identity_mismatch", "profile constraints schema unavailable or not its pinned bytes")
        check(self.profile, parse_json(self.bytes[constraints_dep["id"]], "profile.schema.json", numbers=True), "#")
        self.constraints_applied = True
        if vector_set_digest(self.profile["conformanceVectorSet"]["members"]) != self.profile["conformanceVectorSet"]["digest"]:
            raise GateRejected("rvr.gate.identity_mismatch", "conformance vector-set digest")
        rvr_dep = next(d for d in self.profile["schemaContracts"] if d["id"] == "oracle-outcome-rvr-schema")
        for contract in ("evidenceSetContract", "canonicalResultContract"):
            if self.profile[contract]["schemaSha256"] != rvr_dep["sha256"] or self.profile[contract]["schemaPath"] != rvr_dep["path"]:
                raise GateRejected("rvr.gate.identity_mismatch", f"{contract} does not bind the pinned rvr schema")
        self.rvr = parse_json(self.bytes[rvr_dep["id"]], "rvr.schema.json", numbers=True) if rvr_dep["id"] in self.bytes else None
        self.digest = canonical_digest(self.profile)

    def required_status(self) -> dict[str, Any] | None:
        required = {d["id"] for d in dependencies(self.profile) if d["requiredForRecomputation"]}
        if required & set(self.missing):
            return {"recomputationStatus": "CANNOT_RECOMPUTE", "reasonCode": "rvr.recompute.normative_dependency_unavailable", "evaluationPerformed": False}
        if required & set(self.mismatched):
            return {"recomputationStatus": "CANNOT_RECOMPUTE", "reasonCode": "rvr.recompute.normative_dependency_identity_mismatch", "evaluationPerformed": False}
        return None


# ---- evidence -----------------------------------------------------------------------------------

def evidence_for(snapshot_bytes: bytes | None) -> dict[str, Any]:
    if snapshot_bytes is None:
        member = {"id": "chain-snapshot", "status": "UNAVAILABLE", "reasonCode": "rvr.oracle-outcome.v0.evidence_unavailable"}
    else:
        member = {"id": "chain-snapshot", "status": "PRESENT", "mediaType": "application/json",
                  "byteLength": str(len(snapshot_bytes)), "digest": sha256(snapshot_bytes)}
    return {"schema": "rvr.evidence-set.v0", "members": [member]}


def evidence_digest(evidence_set: dict[str, Any]) -> str:
    normalized = copy.deepcopy(evidence_set)
    normalized["members"].sort(key=lambda m: m["id"])
    return canonical_digest(normalized)


def validate_evidence(evidence_set: dict[str, Any], payloads: dict[str, bytes], rvr: dict[str, Any]) -> None:
    check(evidence_set, rvr, "#/$defs/evidenceSet")
    ids = [m["id"] for m in evidence_set["members"]]
    if len(set(ids)) != len(ids):
        raise GateRejected("rvr.gate.schema_invalid", "duplicate evidence member id")
    present = {m["id"]: m for m in evidence_set["members"] if m["status"] == "PRESENT"}
    if set(payloads) - set(present):
        raise GateRejected("rvr.gate.evidence_closure_incomplete", "payload not committed by the evidence set")
    for mid, payload in payloads.items():
        if present[mid]["byteLength"] != str(len(payload)) or present[mid]["digest"] != sha256(payload):
            raise GateRejected("rvr.gate.identity_mismatch", f"payload identity mismatch: {mid}")


# ---- semantic evaluation (SPEC.md section 6) -------------------------------------------------------

def label_of_price(price: str | None) -> str | None:
    return PRICE_LABEL.get(price) if price is not None else None


def decode_payouts(data_hex: str) -> list[str] | None:
    """ConditionResolution data = abi.encode(uint256 outcomeSlotCount, uint256[] payoutNumerators)."""
    data = bytes.fromhex(data_hex[2:])
    if len(data) < 96:
        return None
    count = int.from_bytes(data[0:32], "big")
    offset = int.from_bytes(data[32:64], "big")
    if offset + 32 > len(data):
        return None
    n = int.from_bytes(data[offset:offset + 32], "big")
    if n != count or offset + 32 + 32 * n > len(data):
        return None
    return [str(int.from_bytes(data[offset + 32 + 32 * i: offset + 64 + 32 * i], "big")) for i in range(n)]


def pad_address(address: str) -> str:
    return "0x" + "0" * 24 + address[2:]


def lifecycle(s: dict[str, Any]) -> tuple[str, bool, str | None, str | None, str | None]:
    """Returns (lifecycleState, resolutionEvidence, currentRequestTimestamp, proposedOutcome, finalOutcome)."""
    current = max(s["oracleRequests"], key=lambda r: int(r["requestTimestamp"]))
    proposals = [e for e in current["events"] if e["event"] == "ProposePrice"]
    proposed = label_of_price(proposals[-1]["price"]) if proposals else None
    receipt = s["resolutionReceipt"]
    evidence = False
    final_outcome = None
    if receipt is not None and receipt["status"] == "SUCCESS" and int(receipt["blockNumber"]) <= int(s["blockNumber"]):
        cr = [lg for lg in receipt["logs"] if lg["address"] == s["contracts"]["conditionalTokens"] and lg["topics"] == [
            TOPIC_CONDITION_RESOLUTION, s["conditionId"], pad_address(s["contracts"]["adapter"]), s["questionId"]]]
        qr = [lg for lg in receipt["logs"] if lg["address"] == s["contracts"]["adapter"] and len(lg["topics"]) == 3
              and lg["topics"][0] == TOPIC_QUESTION_RESOLVED and lg["topics"][1] == s["questionId"]]
        payouts = decode_payouts(cr[0]["data"]) if len(cr) == 1 else None
        evidence = len(qr) == 1 and payouts is not None and payouts == s["conditionResolution"]["payoutNumerators"]
        if evidence:
            final_outcome = PAYOUT_LABEL.get(tuple(payouts))
            evidence = final_outcome is not None
    if s["conditionResolution"]["payoutDenominator"] != "0":
        state = "FINAL" if evidence else "RESOLVED_WITHOUT_EVIDENCE"
        return state, evidence, current["requestTimestamp"], proposed, final_outcome if evidence else None
    state = {"REQUESTED": "REQUESTED", "PROPOSED": "PROPOSED", "DISPUTED": "DISPUTED", "EXPIRED": "EXPIRED_UNRESOLVED",
             "RESOLVED": "SETTLED_UNRESOLVED", "SETTLED": "SETTLED_UNRESOLVED"}[current["stateAtBlock"]]
    return state, False, current["requestTimestamp"], proposed, None


def snapshot_gate(s: dict[str, Any]) -> None:
    """A snapshot must describe one chain state: nothing in it may be later than its block."""
    b = int(s["blockNumber"])
    later = [e for r in s["oracleRequests"] for e in r["events"] if int(e["blockNumber"]) > b]
    later += [u for u in s["bulletinUpdates"] if int(u["blockNumber"]) > b]
    if later:
        raise GateRejected("rvr.gate.schema_invalid", "snapshot holds events later than its block")
    if s["resolutionReceipt"] is not None and s["conditionResolution"]["payoutDenominator"] == "0" \
            and s["resolutionReceipt"]["status"] == "SUCCESS" and int(s["resolutionReceipt"]["blockNumber"]) <= b:
        raise GateRejected("rvr.gate.schema_invalid", "snapshot holds a resolution receipt for an unresolved condition")


def result(claim: dict[str, Any], outcome: str, reason: str, ev: dict[str, Any]) -> dict[str, Any]:
    return {"schema": "rvr.canonical-result.oracle-outcome-uma-ctf.v0", "proposition": claim["proposition"],
            "outcome": outcome, "reasonCode": reason, "evaluation": ev}


def evaluate(claim: dict[str, Any], evidence_set: dict[str, Any], payloads: dict[str, bytes], rvr: dict[str, Any]) -> dict[str, Any]:
    check(claim, rvr, "#/$defs/claim")
    validate_evidence(evidence_set, payloads, rvr)
    member = evidence_set["members"][0]
    ev: dict[str, Any] = {
        "procedure": "UMA_CTF_LIFECYCLE_FROM_COMMITTED_CHAIN_READ", "snapshotAssurance": "COMMITTED_CHAIN_READ_SNAPSHOT",
        "snapshotDigest": None, "chainId": None, "blockNumber": None, "blockHash": None, "lifecycleState": None,
        "finality": {"lifecycleFinal": False, "rulesBound": False, "resolutionEvidence": False},
        "currentRequestTimestamp": None, "proposedOutcome": None, "finalOutcome": None, "claimedOutcome": claim["outcome"],
    }
    if member["status"] == "UNAVAILABLE":
        return result(claim, "UNVERIFIABLE", "rvr.oracle-outcome.v0.required_snapshot_unavailable", ev)
    raw = payloads["chain-snapshot"]
    s = parse_json(raw, "chain-snapshot")
    check(s, rvr, "#/$defs/chainSnapshot")
    if canonical_bytes(s) != raw:
        raise GateRejected("rvr.gate.identity_mismatch", "snapshot is not exact canonical JSON")
    snapshot_gate(s)
    ev.update(snapshotDigest=sha256(raw), chainId=s["chainId"], blockNumber=s["blockNumber"], blockHash=s["blockHash"])
    m = claim["market"]
    if (m["chainId"], m["adapter"], m["optimisticOracle"], m["conditionalTokens"], m["identifier"], m["questionId"], m["conditionId"]) != (
            s["chainId"], s["contracts"]["adapter"], s["contracts"]["optimisticOracle"], s["contracts"]["conditionalTokens"],
            s["identifier"], s["questionId"], s["conditionId"]):
        return result(claim, "REFUTED", "rvr.oracle-outcome.v0.market_mismatch", ev)
    packed = bytes.fromhex(s["contracts"]["adapter"][2:]) + bytes.fromhex(s["questionId"][2:]) + (2).to_bytes(32, "big")
    ancillary = bytes.fromhex(s["ancillaryData"][2:])
    if keccak256(ancillary) != s["questionId"] or keccak256(packed) != s["conditionId"]:
        return result(claim, "REFUTED", "rvr.oracle-outcome.v0.snapshot_identity_inconsistent", ev)
    if claim["rules"]["ancillaryDataKeccak256"] != s["questionId"] or claim["rules"]["bulletinUpdatesDigest"] != canonical_digest(s["bulletinUpdates"]):
        return result(claim, "REFUTED", "rvr.oracle-outcome.v0.rules_version_mismatch", ev)
    ev["finality"]["rulesBound"] = True
    try:
        text = ancillary.decode("utf-8")
    except UnicodeDecodeError:
        text = ""
    if RES_DATA not in text:
        return result(claim, "UNVERIFIABLE", "rvr.oracle-outcome.v0.rules_labels_unrecognized", ev)
    state, evidence, current_ts, proposed, final_outcome = lifecycle(s)
    ev.update(lifecycleState=state, currentRequestTimestamp=current_ts, proposedOutcome=proposed, finalOutcome=final_outcome)
    ev["finality"]["lifecycleFinal"] = state == "FINAL"
    ev["finality"]["resolutionEvidence"] = evidence
    if claim["proposition"] == FINAL:
        if state == "RESOLVED_WITHOUT_EVIDENCE":
            return result(claim, "UNVERIFIABLE", "rvr.oracle-outcome.v0.resolution_evidence_incomplete", ev)
        if state != "FINAL":
            return result(claim, "UNVERIFIABLE", "rvr.oracle-outcome.v0.lifecycle_not_final", ev)
        if final_outcome == claim["outcome"]:
            return result(claim, "VERIFIED", "rvr.oracle-outcome.v0.final_outcome_verified", ev)
        return result(claim, "REFUTED", "rvr.oracle-outcome.v0.final_outcome_mismatch", ev)
    if state != "PROPOSED":
        return result(claim, "REFUTED", "rvr.oracle-outcome.v0.lifecycle_state_mismatch", ev)
    if proposed == claim["outcome"]:
        return result(claim, "VERIFIED", "rvr.oracle-outcome.v0.proposal_verified", ev)
    return result(claim, "REFUTED", "rvr.oracle-outcome.v0.proposed_outcome_mismatch", ev)


# ---- receipts and recomputation (ERC-8404 recomputation procedure) --------------------------------

def make_bundle(p: Profile, claim: dict[str, Any], snapshot_bytes: bytes | None) -> dict[str, Any]:
    evidence_set = evidence_for(snapshot_bytes)
    payloads = {} if snapshot_bytes is None else {"chain-snapshot": snapshot_bytes}
    res = evaluate(claim, evidence_set, payloads, p.rvr)
    receipt = {"claimDigest": canonical_digest(claim), "evidenceSetDigest": evidence_digest(evidence_set),
               "verificationProfileDigest": p.digest, "outcome": res["outcome"], "reasonCode": res["reasonCode"],
               "resultDigest": canonical_digest(res)}
    return {"receipt": receipt, "claim": claim, "evidenceSet": evidence_set, "canonicalResult": res}


def validate_stored(p: Profile, stored: dict[str, Any]) -> None:
    check(stored["receipt"], p.rvr, "#")
    check(stored["canonicalResult"], p.rvr, "#/$defs/canonicalResult")
    check(stored["claim"], p.rvr, "#/$defs/claim")
    check(stored["evidenceSet"], p.rvr, "#/$defs/evidenceSet")
    r = stored["receipt"]
    if r["verificationProfileDigest"] != p.digest:
        raise GateRejected("rvr.gate.identity_mismatch", "receipt names a different Verification Profile")
    if r["claimDigest"] != canonical_digest(stored["claim"]) or r["evidenceSetDigest"] != evidence_digest(stored["evidenceSet"]) \
            or r["resultDigest"] != canonical_digest(stored["canonicalResult"]):
        raise GateRejected("rvr.gate.identity_mismatch", "stored identities do not match the accompanying objects")
    if r["outcome"] != stored["canonicalResult"]["outcome"] or r["reasonCode"] != stored["canonicalResult"]["reasonCode"]:
        raise GateRejected("rvr.gate.result_projection_mismatch", "receipt outcome/reasonCode contradict the canonical result")


def recompute(p: Profile, stored: dict[str, Any], claim: dict[str, Any], evidence_set: dict[str, Any],
              payloads: dict[str, bytes], hidden_inputs: dict[str, Any] | None = None) -> dict[str, Any]:
    validate_stored(p, stored)
    status = p.required_status()
    if status:
        return status
    if hidden_inputs:
        raise GateRejected("rvr.gate.evidence_closure_incomplete", "outcome-relevant input outside the committed closure")
    present = [m for m in evidence_set["members"] if m["status"] == "PRESENT"]
    if any(m["id"] not in payloads for m in present):
        return {"recomputationStatus": "CANNOT_RECOMPUTE", "reasonCode": "rvr.recompute.committed_evidence_unavailable", "evaluationPerformed": False}
    res = evaluate(claim, evidence_set, payloads, p.rvr)
    same = (canonical_digest(claim) == stored["receipt"]["claimDigest"] and evidence_digest(evidence_set) == stored["receipt"]["evidenceSetDigest"]
            and canonical_digest(res) == stored["receipt"]["resultDigest"])
    return {"recomputationStatus": "REPRODUCED" if same else "DIVERGED",
            "reasonCode": "rvr.recompute.identical" if same else "rvr.recompute.canonical_result_diverged",
            "evaluationPerformed": True, "verificationOutcome": res["outcome"], "verificationReasonCode": res["reasonCode"],
            "lifecycleState": res["evaluation"]["lifecycleState"]}


# ---- vectors ------------------------------------------------------------------------------------

def load_vectors(p: Profile) -> dict[str, Any]:
    vid = next(m["id"] for m in p.profile["conformanceVectorSet"]["members"] if m["path"].endswith("vectors.json"))
    return parse_json(p.bytes[vid], "vectors.json")


def snapshot_bytes(vectors: dict[str, Any], name: str) -> bytes:
    return canonical_bytes(vectors["snapshots"][name])


def mutate_payouts(s: dict[str, Any]) -> dict[str, Any]:
    """Semantic mutation: the same resolution, but paying Yes. Read and log are changed together, so the
    snapshot stays internally consistent and evaluation completes."""
    s = copy.deepcopy(s)
    s["conditionResolution"]["payoutNumerators"] = ["1", "0"]
    for lg in s["resolutionReceipt"]["logs"]:
        if lg["topics"][:2] == [TOPIC_CONDITION_RESOLUTION, s["conditionId"]]:
            data = bytes.fromhex(lg["data"][2:])
            n_off = int.from_bytes(data[32:64], "big") + 32
            data = data[:n_off] + (1).to_bytes(32, "big") + (0).to_bytes(32, "big") + data[n_off + 64:]
            lg["data"] = "0x" + data.hex()
    return s


def run_check() -> dict[str, Any]:
    p = Profile()
    if p.required_status():
        raise GateRejected("rvr.gate.identity_mismatch", f"package dependencies: missing {p.missing}, mismatched {p.mismatched}")
    vectors = load_vectors(p)
    stored_all = parse_json((PACKAGE_ROOT / PROFILE_DIR / "receipts.json").read_bytes(), "receipts.json")["receipts"]
    cases: dict[str, Any] = {}

    def run(case_id: str, claim_name: str, snap_name: str | None, stored_id: str | None = None, **kw: Any) -> dict[str, Any]:
        claim = vectors["claims"][claim_name]
        sb = snapshot_bytes(vectors, snap_name) if snap_name else None
        stored = stored_all[stored_id or case_id]
        evidence = evidence_for(sb)
        payloads = {"chain-snapshot": sb} if sb is not None else {}
        return recompute(kw.get("profile", p), stored, claim, evidence, payloads, kw.get("hidden"))

    # The conformance pair and its two neighbours: each original receipt is recomputed from committed bytes.
    for case in vectors["cases"]:
        cases[case["id"]] = run(case["id"], case["claim"], case["snapshot"])
        if cases[case["id"]]["recomputationStatus"] == "REPRODUCED":
            cases[case["id"]]["receiptMatchesStored"] = True

    # DIVERGED: the positive control's receipt against a snapshot whose payouts were changed to Yes.
    claim = vectors["claims"]["final-no"]
    mutated = canonical_bytes(mutate_payouts(vectors["snapshots"]["final"]))
    cases["DIVERGED"] = recompute(p, stored_all["POSITIVE_CONTROL_FINAL_SNAPSHOT"], claim, evidence_for(mutated), {"chain-snapshot": mutated})

    # CANNOT_RECOMPUTE: the committed PRESENT snapshot cannot be resolved by the recomputer.
    sb = snapshot_bytes(vectors, "final")
    cases["SNAPSHOT_UNRESOLVED"] = recompute(p, stored_all["POSITIVE_CONTROL_FINAL_SNAPSHOT"], claim, evidence_for(sb), {})

    # UNAVAILABLE committed as such: evaluated, UNVERIFIABLE, and reproducible.
    cases["SNAPSHOT_COMMITTED_UNAVAILABLE"] = run("SNAPSHOT_COMMITTED_UNAVAILABLE", "final-no", None)

    # Normative dependency unavailable / wrong bytes: no evaluation.
    spec_id = p.profile["verificationSpecification"]["id"]
    cases["NORMATIVE_DEPENDENCY_UNAVAILABLE"] = recompute(Profile({spec_id: None}), stored_all["POSITIVE_CONTROL_FINAL_SNAPSHOT"], claim, evidence_for(sb), {"chain-snapshot": sb})
    cases["NORMATIVE_DEPENDENCY_IDENTITY_MISMATCH"] = recompute(Profile({spec_id: p.bytes[spec_id] + b"\n"}), stored_all["POSITIVE_CONTROL_FINAL_SNAPSHOT"], claim, evidence_for(sb), {"chain-snapshot": sb})

    # Gate rejections.
    def gate(fn) -> dict[str, Any]:
        try:
            out = fn()
            return {"gateStatus": "ACCEPTED", "unexpected": out}
        except GateRejected as e:
            return {"gateStatus": "REJECTED", "reasonCode": e.reason_code}

    constraints_id = p.profile["profileSchemaContract"]["constraints"]["id"]
    tampered = gate(lambda: Profile({constraints_id: p.bytes[constraints_id].replace(b"COMMITTED_SNAPSHOTS_ONLY", b"FORBIDDEN_UNLESS_COMMITTED")}))
    tampered["constraintsApplied"] = False
    cases["TAMPERED_PROFILE_CONSTRAINTS_PIN"] = tampered

    def projection():
        stored = copy.deepcopy(stored_all["NEGATIVE_FINAL_CLAIM_ON_PROPOSED_SNAPSHOT"])
        stored["receipt"]["outcome"] = "VERIFIED"  # resultDigest still right; the summary field lies
        psb = snapshot_bytes(vectors, "proposed")
        return recompute(p, stored, vectors["claims"]["final-yes"], evidence_for(psb), {"chain-snapshot": psb})
    cases["PROJECTION_NEGATIVE_CONTROL"] = gate(projection)

    live = {"liveRpc": {"blockTag": "latest", "payoutDenominator": "1", "payoutNumerators": ["0", "1"]}}
    psb = snapshot_bytes(vectors, "proposed")
    hidden = gate(lambda: recompute(p, stored_all["NEGATIVE_FINAL_CLAIM_ON_PROPOSED_SNAPSHOT"], vectors["claims"]["final-yes"], evidence_for(psb), {"chain-snapshot": psb}, live))
    # Counterfactual: had the live read been allowed into the snapshot, the proposed-state outcome would change.
    leak = copy.deepcopy(vectors["snapshots"]["proposed"])
    leak["conditionResolution"] = {"payoutDenominator": "1", "payoutNumerators": ["0", "1"]}
    leak["resolutionReceipt"] = vectors["snapshots"]["final"]["resolutionReceipt"]
    leak["blockNumber"] = vectors["snapshots"]["final"]["blockNumber"]
    lb = canonical_bytes(leak)
    hidden["counterfactualOutcome"] = evaluate(vectors["claims"]["final-yes"], evidence_for(lb), {"chain-snapshot": lb}, p.rvr)["reasonCode"]
    hidden["evaluationPerformed"] = False
    cases["HIDDEN_STATE_NEGATIVE_CONTROL"] = hidden

    def non_canonical():
        pretty = json.dumps(vectors["snapshots"]["final"], indent=1, sort_keys=True).encode("utf-8")
        return recompute(p, stored_all["POSITIVE_CONTROL_FINAL_SNAPSHOT"], claim, evidence_for(pretty), {"chain-snapshot": pretty})
    cases["NON_CANONICAL_SNAPSHOT"] = gate(non_canonical)

    # Semantic failures: well-formed inputs that evaluate to a specific non-VERIFIED reason.
    semantic = {}
    fs = vectors["snapshots"]["final"]
    for sid, mutate, claim_name in [
        ("market-mismatch", None, "final-no-other-question"),
        ("rules-version-mismatch", None, "final-no-other-rules"),
        ("resolution-evidence-incomplete", lambda s: s.update(resolutionReceipt=None), "final-no"),
        ("snapshot-identity-inconsistent", lambda s: s.update(ancillaryData=s["ancillaryData"] + "20"), "final-no"),
    ]:
        s = copy.deepcopy(fs)
        if mutate:
            mutate(s)
        b = canonical_bytes(s)
        semantic[sid] = evaluate(vectors["claims"][claim_name], evidence_for(b), {"chain-snapshot": b}, p.rvr)["reasonCode"]
    cases["SEMANTIC_FAILURES"] = semantic
    return {"gate": "RVR_ORACLE_OUTCOME_UMA_CTF_PASS", "profileId": p.profile["profileId"], "verificationProfileDigest": p.digest,
            "snapshotAssurance": "COMMITTED_CHAIN_READ_SNAPSHOT", "cases": cases}


def compare(report: dict[str, Any], expected: dict[str, Any]) -> list[str]:
    bad = []
    for case_id, want in expected["cases"].items():
        got = report["cases"].get(case_id)
        if got is None:
            bad.append(f"{case_id}: not run")
            continue
        for k, v in want.items():
            if got.get(k) != v:
                bad.append(f"{case_id}.{k}: got {got.get(k)!r}, expected {v!r}")
    return bad


# ---- --write: build vectors, pins, receipts, manifest ---------------------------------------------

def build_snapshots(ev: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for name in ("proposed", "final"):
        read = ev["reads"][name]
        block = int(read["blockNumber"])
        requests = []
        for ts, state in read["oracleStates"].items():
            events = [{"event": e["event"], "transactionHash": e["transactionHash"], "blockNumber": e["blockNumber"],
                       "logIndex": e["logIndex"], "price": e.get("price")}
                      for e in ev["timeline"] if e["contract"] == "optimisticOracle" and e["requestTimestamp"] == ts and int(e["blockNumber"]) <= block]
            if state == "INVALID" and not events:
                continue
            requests.append({"requestTimestamp": ts, "stateAtBlock": state, "events": events})
        resolution = next((e for e in ev["timeline"] if e["event"] == "QuestionResolved" and int(e["blockNumber"]) <= block), None)
        receipt = None
        if resolution:
            r = ev["receipts"][resolution["transactionHash"]]
            receipt = {"transactionHash": resolution["transactionHash"], "status": r["status"], "blockNumber": r["blockNumber"],
                       "blockHash": r["blockHash"], "logs": r["logs"]}
        bulletins = [{"transactionHash": e["transactionHash"], "blockNumber": e["blockNumber"], "logIndex": e["logIndex"],
                      "owner": e["owner"], "update": e["update"]}
                     for e in ev["timeline"] if e["event"] == "AncillaryDataUpdated" and int(e["blockNumber"]) <= block]
        out[name] = {
            "schema": "rvr.oracle-outcome.uma-ctf-snapshot.v0", "snapshotAssurance": "COMMITTED_CHAIN_READ_SNAPSHOT",
            "chainId": ev["chainId"], "blockNumber": read["blockNumber"], "blockHash": read["blockHash"], "blockTimestamp": read["blockTimestamp"],
            "contracts": dict(ev["contracts"]), "identifier": ev["identifier"], "questionId": ev["market"]["questionId"],
            "conditionId": ev["market"]["conditionId"], "ancillaryData": ev["ancillaryData"], "bulletinUpdates": bulletins,
            "oracleRequests": requests,
            "conditionResolution": {"payoutDenominator": read["payoutDenominator"], "payoutNumerators": read["payoutNumerators"]},
            "resolutionReceipt": receipt,
        }
    return out


def claim_for(ev: dict[str, Any], snapshots: dict[str, Any], proposition: str, outcome: str, **override: Any) -> dict[str, Any]:
    market = {"chainId": ev["chainId"], "adapter": ev["contracts"]["adapter"], "optimisticOracle": ev["contracts"]["optimisticOracle"],
              "conditionalTokens": ev["contracts"]["conditionalTokens"], "identifier": ev["identifier"],
              "questionId": ev["market"]["questionId"], "conditionId": ev["market"]["conditionId"]}
    market.update(override.get("market", {}))
    rules = {"ancillaryDataKeccak256": ev["market"]["questionId"], "bulletinUpdatesDigest": canonical_digest(snapshots["final"]["bulletinUpdates"])}
    rules.update(override.get("rules", {}))
    return {"schema": "rvr.claim.oracle-outcome-uma-ctf.v0", "proposition": proposition, "market": market, "rules": rules,
            "outcome": outcome, "snapshotMember": "chain-snapshot", "snapshotAssurance": "COMMITTED_CHAIN_READ_SNAPSHOT"}


def write_file(rel: str, data: bytes) -> None:
    (PACKAGE_ROOT / rel).write_bytes(data)


def pretty(v: Any) -> bytes:
    return (json.dumps(v, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def run_write() -> None:
    ev = json.loads(EVIDENCE_PATH.read_text("utf-8"))
    snapshots = build_snapshots(ev)
    claims = {
        "final-yes": claim_for(ev, snapshots, FINAL, "Yes"),
        "final-no": claim_for(ev, snapshots, FINAL, "No"),
        "proposed-yes": claim_for(ev, snapshots, PROPOSED, "Yes"),
        "final-no-other-question": claim_for(ev, snapshots, FINAL, "No", market={"questionId": "0x" + "00" * 32}),
        "final-no-other-rules": claim_for(ev, snapshots, FINAL, "No", rules={"bulletinUpdatesDigest": sha256(b"[{}]")}),
    }
    vectors = {
        "schema": "rvr.oracle-outcome.conformance-vectors.v0",
        "source": {
            "market": f"Polymarket market {ev['market']['marketId']}: {ev['market']['title']}",
            "chain": "Polygon, chain id 137",
            "collectedBy": "tools/collect-uma-ctf.mjs (read-only Polygon RPC) into grounded-feedback/evidence/polymarket-1992979.json",
            "note": "Snapshots are committed evidence. Recomputation never reads an RPC; re-collecting them is an out-of-band check of the snapshot's provenance, not part of the proposition.",
        },
        "snapshots": snapshots,
        "claims": claims,
        "cases": [
            {"id": "NEGATIVE_FINAL_CLAIM_ON_PROPOSED_SNAPSHOT", "claim": "final-yes", "snapshot": "proposed"},
            {"id": "POSITIVE_CONTROL_FINAL_SNAPSHOT", "claim": "final-no", "snapshot": "final"},
            {"id": "DISPUTED_PROPOSAL_CLAIMED_FINAL", "claim": "final-yes", "snapshot": "final"},
            {"id": "SCOPED_PROPOSAL_CLAIM_ON_PROPOSED_SNAPSHOT", "claim": "proposed-yes", "snapshot": "proposed"},
        ],
    }
    write_file(f"{PROFILE_DIR}/vectors.json", pretty(vectors))
    profile = json.loads(PROFILE_PATH.read_text("utf-8"))

    def pin(dep: dict[str, Any]) -> None:
        dep["sha256"] = sha256(safe_path(dep["path"]).read_bytes())
    for dep in dependencies(profile):
        pin(dep)
    profile["conformanceVectorSet"]["digest"] = vector_set_digest(profile["conformanceVectorSet"]["members"])
    rvr_dep = next(d for d in profile["schemaContracts"] if d["id"] == "oracle-outcome-rvr-schema")
    for contract in ("evidenceSetContract", "canonicalResultContract"):
        profile[contract]["schemaSha256"] = rvr_dep["sha256"]
    write_file(f"{PROFILE_DIR}/verification-profile.json", pretty(profile))
    p = Profile()
    stored = {}
    for case in vectors["cases"]:
        sb = canonical_bytes(snapshots[case["snapshot"]])
        stored[case["id"]] = make_bundle(p, claims[case["claim"]], sb)
    stored["SNAPSHOT_COMMITTED_UNAVAILABLE"] = make_bundle(p, claims["final-no"], None)
    write_file(f"{PROFILE_DIR}/receipts.json", pretty({
        "_README": "Original receipts, as a producer would publish them, with the claim, evidence-set descriptor and canonical result each one accompanies. Snapshot payloads are in vectors.json. adapter.py --check recomputes each from committed bytes.",
        "verificationProfileDigest": p.digest, "receipts": stored}))
    members = []
    for rel in PACKAGE_MEMBERS:
        if rel.endswith("manifest.json"):
            continue
        members.append({"path": rel, "sha256": sha256((PACKAGE_ROOT / rel).read_bytes())})
    rows = "".join(f"{m['path']}\t{m['sha256']}\n" for m in sorted(members, key=lambda m: m["path"]))
    write_file(f"{PROFILE_DIR}/manifest.json", pretty({
        "schema": "rvr.profile-package-manifest.v0", "hashAlgorithm": "sha256-lowercase-hex", "packageRoot": "erc8404-profile/",
        "memberCount": str(len(members)), "members": members,
        "packageDigestRule": "sha256-utf8-sorted-path-tab-file-sha256-lf-rows-manifest-excluded", "packageDigest": sha256(rows.encode("utf-8"))}))
    print(json.dumps({"verificationProfileDigest": p.digest, "receipts": {k: v["receipt"] for k, v in stored.items()}}, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if a.write:
        run_write()
        return 0
    report = run_check()
    expected = parse_json((PACKAGE_ROOT / PROFILE_DIR / "expected.json").read_bytes(), "expected.json")
    bad = compare(report, expected)
    report["mismatches"] = bad
    if bad:
        report["gate"] = "RVR_ORACLE_OUTCOME_UMA_CTF_FAIL"
    print(json.dumps(report, indent=2))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
