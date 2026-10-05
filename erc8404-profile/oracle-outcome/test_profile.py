import json
import subprocess
import sys
import unittest
from pathlib import Path

ADAPTER = Path(__file__).with_name("adapter.py")


class OracleOutcomeProfileTests(unittest.TestCase):
    def test_exact_gate(self) -> None:
        done = subprocess.run([sys.executable, str(ADAPTER), "--check"], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        report = json.loads(done.stdout)
        cases = report["cases"]
        self.assertEqual(report["gate"], "RVR_ORACLE_OUTCOME_UMA_CTF_PASS")
        self.assertEqual(report["mismatches"], [])
        # The conformance pair.
        neg = cases["NEGATIVE_FINAL_CLAIM_ON_PROPOSED_SNAPSHOT"]
        self.assertEqual((neg["verificationOutcome"], neg["recomputationStatus"]), ("UNVERIFIABLE", "REPRODUCED"))
        pos = cases["POSITIVE_CONTROL_FINAL_SNAPSHOT"]
        self.assertEqual((pos["verificationOutcome"], pos["recomputationStatus"]), ("VERIFIED", "REPRODUCED"))
        self.assertEqual(cases["DIVERGED"]["recomputationStatus"], "DIVERGED")
        self.assertFalse(cases["TAMPERED_PROFILE_CONSTRAINTS_PIN"]["constraintsApplied"])
        self.assertFalse(cases["SNAPSHOT_UNRESOLVED"]["evaluationPerformed"])


if __name__ == "__main__":
    unittest.main()
