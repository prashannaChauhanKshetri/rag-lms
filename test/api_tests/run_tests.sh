#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RAG-LMS API Integration Test Runner
#
# Usage:
#   ./test/api_tests/run_tests.sh            # run all steps
#   ./test/api_tests/run_tests.sh 01         # run only Step 1 (auth)
#   ./test/api_tests/run_tests.sh 01 02      # run steps 1 and 2
#
# Options forwarded to pytest:
#   -x   stop on first failure
#   -s   show print output (useful for debugging)
# ─────────────────────────────────────────────────────────────────────────────
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENV="$REPO_ROOT/env/bin/python"
TEST_DIR="$REPO_ROOT/test/api_tests"

# Colour helpers
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  RAG-LMS  API  Integration  Tests${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"

# Check API is reachable
if ! curl -sf http://localhost:8000/health > /dev/null; then
  echo "ERROR: API not reachable at http://localhost:8000 — start the server first."
  exit 1
fi

echo -e "${GREEN}API is up.${NC}"

# Build file list
if [ $# -eq 0 ]; then
  FILES="$TEST_DIR"   # run all
else
  FILES=""
  for step in "$@"; do
    FILES="$FILES $TEST_DIR/test_${step}_*.py"
  done
fi

# Run
"$VENV" -m pytest $FILES \
  -v \
  --tb=short \
  --no-header \
  -p no:warnings \
  "$@" 2>&1 | grep -v "^$" || true

echo -e "${GREEN}Done.${NC}"
