# Skill Handoffs

Security review does not stand alone. It sits in the Builders engineering family, and most real work needs more than one of these skills. This file says what security-review consumes from each sibling, what it produces for them, and how its verdicts map onto `ci-cd-delivery-governance`'s gate vocabulary so a release gate can act on a security finding without a human translating it by hand.

The rule that governs all of it: consume a sibling's result, do not restate its methodology, and never claim a sibling ran when it did not. If a needed sibling is unavailable, mark its input `UNKNOWN`, gather equivalent evidence within scope, or block and say so.

## The family and who owns what

- **software-design-principles — BUILD WELL.** Owns internal structure, boundaries, and change design. Security-review consumes its map of module boundaries and trust seams: knowing where one component stops trusting another tells you where to look for a cross-component trust gap. It does not re-judge structure.
- **regression-protection — DON'T BREAK.** Owns regression surface and protected behaviour. Security-review produces regression tests for every confirmed fix; those tests belong in regression-protection's evidence, so a later change cannot silently reopen a patched hole. When a security fix changes behaviour, hand the regression surface to this skill rather than reasoning about it here.
- **production-readiness — OPERATE SAFELY.** Owns risk-tiered operational assessment. It explicitly defers the security verdict to this skill and asks whether a real review happened; this skill is the answer. In return, security-review surfaces operational-security observations it notices in passing (secrets handling, tenant isolation at the operational level, internals leaking through error messages) and hands them to production-readiness rather than rendering an operational verdict.
- **database-rls — ISOLATE DATA.** Generates Postgres schema and Supabase Row Level Security policies. It is the main *control* for multi-tenant isolation; security-review is the main *check* on it. When a confirmed finding is a tenant-isolation failure, the fix usually lives in database-rls territory: name the invariant (every row read or written is scoped to the caller's tenant) and hand the policy change there, then verify the result here.
- **testing-verification / QA — WORKS CORRECTLY.** Owns functional correctness against requirements. Security-review consumes its existing tests as ready-made local harnesses for confirming a boundary, and produces security regression cases that extend the suite. It does not re-judge functional correctness.
- **ci-cd-delivery-governance — DELIVER SAFELY.** Owns the release path, gates, and authority. It can gate a release on a security result, so the verdict mapping below has to be exact.

## Verdict mapping for the release gate

`ci-cd-delivery-governance` evaluates gates with a fixed vocabulary: `PASS`, `FAIL`, `BLOCKED`, `PASS WITH CONDITIONS`, `APPROVAL REQUIRED`, `NOT APPLICABLE`, `NOT RUN`, `UNKNOWN`. Map the security review's result onto it like this, and preserve the original record in the evidence ledger alongside the mapped status so nothing is silently normalized.

| Security review result | CI/CD gate status | Note |
|---|---|---|
| No `confirmed` records, review complete | `PASS` | State the coverage and tier; a scoped or quick pass is not a clean full pass. |
| `confirmed` record at `critical` or `high` | `FAIL` | A real cross-boundary failure with real consequences blocks the gate. |
| `confirmed` record at `medium` with an owned, time-boxed remediation plan | `PASS WITH CONDITIONS` | Only when the condition has a named owner and does not hide a failed required gate. |
| `confirmed` record at `low` or `informational` | `PASS WITH CONDITIONS` or `PASS` | Judgement call by tier; record it, do not bury it. |
| `needs_validation` on a decisive boundary | `BLOCKED` until resolved | The gate cannot pass on an unverified security-critical fact. Resolve the blocker, do not downgrade it to a warning. |
| Review could not run (no sandbox, missing access) | `UNKNOWN` / `NOT RUN` | Never `PASS`. Name what was not checked. |
| Review deferred for this change, lower tier | `NOT APPLICABLE` | Only with a traceable reason. |

The principle behind the table is `ci-cd`'s own: `UNKNOWN` and `NOT RUN` are never `PASS`, and a green pipeline does not override an unresolved serious security finding.

## Producing evidence other skills can consume

When another skill or a release gate will act on this review, give it the structured record, not prose. `findings.json` validated against `scripts/report-schema.json` is the machine-readable handoff. The founder-facing `SECURITY-REVIEW.md` is for the human. Keep both in sync; the prose never carries a verdict the JSON does not.
