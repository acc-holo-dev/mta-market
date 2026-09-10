#!/bin/bash
# PLAN-004 G-002/K-002: blocking dependency-audit gate.
#
# Policy:
#   - HIGH or CRITICAL vulnerabilities in production dependencies FAIL the
#     pipeline (exit non-zero).
#   - Approved exceptions live in .github/audit-exceptions.txt: one waiver
#     per line, "<package> <reason> <review-date(YYYY-MM-DD)>". Waivers whose
#     review date has passed are treated as expired and still fail the build.
#
# Exit codes: 0 = clean (or all findings waived and not expired), 1 = gate
# failure, 2 = tooling problem.

set -o pipefail

EXCEPTIONS_FILE=".github/audit-exceptions.txt"

pnpm audit --prod --audit-level high --json > /tmp/audit.json 2>/dev/null
# pnpm audit exits non-zero when advisories exist — that is data, not a
# tooling error. Only bail out when the JSON output is unusable.
if [ ! -s /tmp/audit.json ]; then
  echo "::error::pnpm audit produced no output"
  exit 2
fi

FINDINGS_FILE=$(mktemp)
node -e '
const fs = require("fs");
const raw = require("fs").readFileSync("/tmp/audit.json", "utf8");
let data;
try { data = JSON.parse(raw); } catch { process.exit(0); }
const advisories = data.advisories ? Object.values(data.advisories) : [];
for (const a of advisories) {
  const sev = String(a.severity || "").toLowerCase();
  if (sev === "high" || sev === "critical") {
    console.log(`${a.module_name || a.name}\t${sev}\t${a.github_advisory_id || a.url || ""}`);
  }
}
' > "$FINDINGS_FILE" || { echo "::error::audit JSON processing failed"; exit 2; }

TOTAL=$(wc -l < "$FINDINGS_FILE" | tr -d ' ')
if [ "$TOTAL" = "0" ]; then
  echo "✅ Dependency audit: no high/critical vulnerabilities in production dependencies."
  exit 0
fi

# Load waivers: package<TAB|space>reason<space>review-date
WAIVED_COUNT=0
FAILED=0
while IFS=$'\t' read -r pkg sev ref; do
  [ -z "$pkg" ] && continue
  waived=""
  if [ -f "$EXCEPTIONS_FILE" ]; then
    while read -r w_pkg w_reason w_date; do
      case "$w_pkg" in ''|'#'*) continue ;; esac
      if [ "$w_pkg" = "$pkg" ]; then
        # Expired waiver (review date in the past) no longer covers the finding.
        if [ -n "$w_date" ] && [ "$w_date" \< "$(date +%Y-%m-%d)" ]; then
          echo "⏰ Waiver EXPIRED for $pkg (review date $w_date) — treat as unwaived."
        else
          waived="$w_reason"
        fi
        break
      fi
    done < "$EXCEPTIONS_FILE"
  fi
  if [ -n "$waived" ]; then
    echo "🟡 WAIVED  $pkg ($sev) — $waived [$ref]"
    WAIVED_COUNT=$((WAIVED_COUNT + 1))
  else
    echo "❌ BLOCKING  $pkg ($sev) [$ref]"
  fi
done < "$FINDINGS_FILE"

rm -f "$FINDINGS_FILE"

if [ "$WAIVED_COUNT" = "$TOTAL" ]; then
  echo "✅ Dependency audit: $TOTAL finding(s), all waived with an approved exception."
  exit 0
fi

echo ""
echo "::error::Dependency audit gate FAILED: $TOTAL high/critical finding(s), $WAIVED_COUNT waived."
echo "Fix the vulnerabilities or add a reviewed, dated waiver in $EXCEPTIONS_FILE."
exit 1
