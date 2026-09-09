#!/usr/bin/env bash
#
# No affiliation is implied, and no competition is named.
#
# Rule 8 of the product rules: no emblem, no ministry named as endorser, no claim
# of official status, and no mention anywhere of a competition, hackathon,
# problem statement or submission.
#
# A grep is a poor substitute for judgement and a very good substitute for
# memory. This is the check that stops a last-minute line in a README from
# undoing a rule the whole product is built around.
#
#   bash scripts/check-affiliation.sh
#
# Exits non-zero on a hit, printing the file and line.

set -uo pipefail

cd "$(dirname "$0")/.."

COMMON_EXCLUDES=(
  --exclude-dir=.git
  --exclude-dir=node_modules
  --exclude-dir=.venv
  --exclude-dir=dist
  --exclude-dir=__pycache__
  --exclude-dir=.ruff_cache
  # These three state the rule, so they necessarily contain the words it bans.
  --exclude='check-affiliation.sh'
  --exclude='ci.yml'
  --exclude='REVIEW_GATE.md'
  --exclude='AGENTS.md'
  --exclude='PROMPT.md'
)

status=0

# -- competition wording, banned everywhere ----------------------------------
#
# None of these has an innocent reading in this repository.

COMPETITION='\bSIH\b|\bhackathon\b|\bproblem statement\b|\b26045\b'

hits=$(grep -rniE "$COMPETITION" "${COMMON_EXCLUDES[@]}" . || true)
if [ -n "$hits" ]; then
  echo "Rule 8: no competition or problem-statement wording anywhere."
  echo "$hits"
  status=1
fi

# -- endorsement, in what a reader sees ---------------------------------------
#
# Deliberately NOT a grep for "Ayush" or any other authority's name. Naming the
# publisher of a document is attribution, and attribution is required: a source
# card that would not say who published an act is a worse product and a less
# honest one. The rule is about *endorsement*, and the shapes endorsement takes
# are a claim of official status and an emblem — so those are what is checked.
#
# The interface files only. A corpus manifest naming a ministry as the
# organization that published a document is the correct use of that name.

ENDORSEMENT='in (partnership|collaboration) with the (ministry|government)'
ENDORSEMENT="$ENDORSEMENT"'|\b(approved|endorsed|authorised|authorized|certified) by the (ministry|government)'
ENDORSEMENT="$ENDORSEMENT"'|\ban? official (product|portal|service|tool)\b'
ENDORSEMENT="$ENDORSEMENT"'|\bgovernment[- ]backed\b'

hits=$(grep -rniE "$ENDORSEMENT" "${COMMON_EXCLUDES[@]}" \
  frontend/src README.md docs 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "Rule 8: nothing may claim official status or endorsement."
  echo "$hits"
  status=1
fi

# -- emblems ------------------------------------------------------------------
#
# Text names only, never a seal or a logo. Any image asset whose name suggests
# one is a hit: the point is to catch the file arriving, because once it is in
# the tree somebody will render it.

hits=$(find frontend/public frontend/src -type f \
  \( -iname '*emblem*' -o -iname '*ashoka*' -o -iname '*ministry*' -o -iname '*govt*' \
     -o -iname '*seal*' -o -iname '*satyamev*' \) 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "Rule 8: no emblem, seal or ministry logo, including on source cards."
  echo "$hits"
  status=1
fi

# -- no fetcher for a portal-only source --------------------------------------
#
# Not affiliation, but the same kind of rule and the same reason to check it
# mechanically: a portal marked link-only must never acquire a fetcher.

if grep -rn "portal_link_only" backend/app/corpus/fetch.py scripts/ingest.py 2>/dev/null \
  | grep -viE 'skip|refus|never|not fetch|link.only' | grep -q .; then
  echo "A fetcher appears to handle a portal_link_only source. It must not."
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "No affiliation, competition or emblem wording found."
fi
exit "$status"
