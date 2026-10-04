#!/usr/bin/env python3
"""
Scaffold the founder-facing SECURITY-REVIEW.md shell.

This builds the shape of the report only, never the content. It exists so the
report format stays consistent without retyping it by hand, in the same spirit
as production-readiness/scripts/report_skeleton.py.

Usage:
    python3 report_skeleton.py "<subject>" --tier <0-3> [--out PATH]
    python3 report_skeleton.py --list-tiers

The report body is written by the person running the review, from the verified
records in findings.json. The verdicts, severities and blockers come from those
records, never from this scaffold.
"""

import argparse
import datetime
import sys

TIERS = {
    0: "Low stakes. Static or internal, no sensitive data, easily reversible.",
    1: "Moderate. Real users or data, limited blast radius.",
    2: "High. Auth, multi-tenant data, money, or irreversible actions.",
    3: "Critical. Payments, health or identity data, or anything that takes "
       "over accounts or infrastructure if it fails.",
}


def skeleton(subject: str, tier: int) -> str:
    today = datetime.date.today().isoformat()
    tier_line = TIERS[tier]
    return f"""# Security Review: {subject}

**Date:** {today}
**Risk tier:** {tier} — {tier_line}
**Driving factor:** <the one thing that set the tier: money, irreversibility, data sensitivity, blast radius>
**Execution policy:** sandboxed source-and-local-only, no live or shared targets
**Coverage:** <full | scoped to PATHS | quick pass> — <prior runs used, or "first run">

---

## Bottom line

<One or two sentences. Is it safe to ship from a security standpoint, and if not,
what is the single thing standing in the way. A clean review says so plainly.>

## What is already solid

<Name the controls that are genuinely working. This is part of the deliverable,
not filler. It tells the reader what not to touch and builds trust in the findings
that follow.>

## Confirmed findings

<Only vulnerabilities that were demonstrated: a real attacker, a crossed boundary,
and an observed result. Each one states the real-world consequence for a person or
the business, not just the technical gap. Sorted highest severity first. If there
are none, write "None confirmed in this pass" and leave the section short.>

### <severity> — <title>

- **What is true today:** <the source-level defect, repository path and line>
- **What it means in practice:** <who gets hurt and how, in plain language>
- **How it was shown:** <the bounded local reproduction, native interface>
- **Conditions:** <what has to hold for the attack to work>
- **Smallest fix:** <the narrowest source change that enforces the invariant, plus a regression test>

## Needs validation

<Source-grounded leads blocked on one fact that is not visible in the repository:
a deployment setting, provider behaviour, an identity policy. No severity. Each one
names the exact missing fact and the safe way an owner can check it.>

| Lead | Where | Exact blocker | How to resolve safely |
|------|-------|---------------|----------------------|
| <title> | <path> | <the one missing fact> | <local fixture or owner-observed check> |

## Hardening notes

<Defence-in-depth improvements that are not vulnerabilities because another layer
already stops the attack. Useful, but kept separate so they do not inflate the
finding count.>

## Coverage and limits

<What was reviewed and what was not. Deferred and out-of-scope areas. If this was a
quick or scoped pass, say plainly that it is partial and not a clean bill of health.>

## Action plan

**Before launch:** <blocking items>
**Soon after:** <important but not blocking>
**When it becomes relevant:** <tier-dependent, revisit as the system grows>

---

_Findings in this report are derived from the verified records in findings.json.
Each confirmed record passed independent verification by an agent that did not
produce it. Severity reflects demonstrated impact, never deviation from a checklist._
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold the SECURITY-REVIEW.md shell.")
    parser.add_argument("subject", nargs="?", help="What was reviewed, e.g. 'Shiltone API' ")
    parser.add_argument("--tier", type=int, choices=[0, 1, 2, 3], help="Risk tier 0-3")
    parser.add_argument("--out", help="Write to this path instead of stdout")
    parser.add_argument("--list-tiers", action="store_true", help="Print the tier definitions and exit")
    args = parser.parse_args()

    if args.list_tiers:
        for level, text in TIERS.items():
            print(f"{level}: {text}")
        return 0

    if not args.subject or args.tier is None:
        parser.error("subject and --tier are required unless --list-tiers is given")

    content = skeleton(args.subject, args.tier)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(content)
        print(f"Wrote {args.out}")
    else:
        sys.stdout.write(content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
