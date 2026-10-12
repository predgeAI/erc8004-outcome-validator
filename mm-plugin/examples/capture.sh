#!/usr/bin/env bash
# Re-capture the example outputs in this folder by running the installed plugin through mm.
# Needs: mm on PATH with this plugin installed (see README). Read-only: no orders, no transactions.
set -u
cd "$(dirname "$0")"
run() { local out="$1"; shift; { echo "\$ mm $*"; mm "$@" 2>&1; echo "[exit $?]"; } > "$out"; echo "wrote $out"; }

run check-1112268.txt            predge check 1112268 --format text
run check-1137824.txt            predge check 1137824 --format text
run check-1102588.txt            predge check 1102588 --format text
run check-1102588.json           predge check 1102588 --json
run check-disputed-5219930.txt   predge check will-trump-say-ammunition-this-week-20261011 --format text
run check-proposed-5635483.txt  predge check 2026-nlcs-series-spread-dodgers-3pt5 --format text
run check-conditionid.txt        predge check 0xddff7251af9c56b2048edd2513019e55ae104143faa97d5799978f926bfcf1e0 --format text
run scan-wallet.txt              predge scan --address 0x614dc8d3542c12103d2c6a3553fd761e391d1546 --format text
run scan-wallet.json             predge scan --address 0x614dc8d3542c12103d2c6a3553fd761e391d1546 --json
run scan-wallet-small.txt        predge scan --address 0x88b21efc4aa4e08cdc125300ad6b3a520811e1d1 --format text
run guard-allowed.txt            predge guard nfl-buf-la-2026-10-13-spread-home-3pt5 --side YES --size 10 --format text
run guard-refused-disputed.txt   predge guard 5219930 --side YES --size 10 --format text
run guard-refused-disputed.json  predge guard 5219930 --side YES --size 10 --json
run guard-refused-proposed.txt  predge guard 5635483 --side YES --size 10 --format text
run guard-refused-closed.txt     predge guard 1112268 --side Under --size 10 --format text
