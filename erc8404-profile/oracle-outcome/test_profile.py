import json
import subprocess
import sys
import unittest
from pathlib import Path

ADAPTER = Path(__file__).with_name("adapter.py")
P = "rvr.oracle-outcome.v0."


def run_check() -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(ADAPTER), "--check"], capture_output=True, text=True)


class OracleOutcomeProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.done = run_check()
        cls.report = json.loads(cls.done.stdout)
        cls.cases = cls.report["cases"]

    def test_exact_gate(self) -> None:
        self.assertEqual(self.done.returncode, 0, self.done.stdout + self.done.stderr)
        cases = self.cases
        self.assertEqual(self.report["gate"], "RVR_ORACLE_OUTCOME_UMA_CTF_PASS")
        self.assertEqual(self.report["mismatches"], [])
        # The conformance pair.
        neg = cases["NEGATIVE_FINAL_CLAIM_ON_PROPOSED_SNAPSHOT"]
        self.assertEqual((neg["verificationOutcome"], neg["recomputationStatus"]), ("UNVERIFIABLE", "REPRODUCED"))
        pos = cases["POSITIVE_CONTROL_FINAL_SNAPSHOT"]
        self.assertEqual((pos["verificationOutcome"], pos["recomputationStatus"]), ("VERIFIED", "REPRODUCED"))
        self.assertTrue(pos["resolutionEvidence"])
        self.assertEqual(cases["DIVERGED"]["recomputationStatus"], "DIVERGED")
        self.assertFalse(cases["TAMPERED_PROFILE_CONSTRAINTS_PIN"]["constraintsApplied"])
        self.assertFalse(cases["SNAPSHOT_UNRESOLVED"]["evaluationPerformed"])

    def test_repeated_runs_byte_identical(self) -> None:
        self.assertEqual(run_check().stdout, self.done.stdout)
        self.assertEqual(run_check().stdout, self.done.stdout)

    # Review regressions, Ethereum Magicians thread 29521 post 33.

    def assert_no_resolution_evidence(self, case_id: str) -> None:
        c = self.cases[case_id]
        self.assertEqual(c["recomputationStatus"], "DIVERGED")
        self.assertEqual((c["verificationOutcome"], c["verificationReasonCode"]),
                         ("UNVERIFIABLE", P + "resolution_evidence_incomplete"))
        self.assertFalse(c["resolutionEvidence"])

    def test_question_resolved_payouts_conflict(self) -> None:
        self.assert_no_resolution_evidence("QUESTION_RESOLVED_PAYOUTS_CONFLICT")

    def test_question_resolved_empty_data(self) -> None:
        self.assert_no_resolution_evidence("QUESTION_RESOLVED_EMPTY_DATA")

    def test_question_resolved_settled_price_conflict(self) -> None:
        self.assert_no_resolution_evidence("QUESTION_RESOLVED_SETTLED_PRICE_CONFLICT")

    def assert_gate_rejected(self, case_id: str, reason: str) -> None:
        c = self.cases[case_id]
        self.assertEqual((c["gateStatus"], c["reasonCode"]), ("REJECTED", reason))
        self.assertFalse(c["evaluationPerformed"])

    def test_resolution_receipt_after_snapshot_block(self) -> None:
        self.assert_gate_rejected("RESOLUTION_RECEIPT_AFTER_SNAPSHOT_BLOCK", "rvr.gate.schema_invalid")


if __name__ == "__main__":
    unittest.main()
