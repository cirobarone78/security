# Report Template

The founder-facing report is `SECURITY-REVIEW.md`. Scaffold its shell with `python3 scripts/report_skeleton.py "<subject>" --tier <0-3>`, then fill it from the verified records in `findings.json`. The scaffold builds the shape only. The content comes from the records, and the records' verdicts, severities, and blockers are authoritative: prose never changes them.

## What the reader needs

The reader is often a non-technical founder deciding whether to ship. They need, in order: whether it is safe, what is in the way if not, and what to do about it. Everything else is supporting detail. Lead with the answer.

## Structure

**Header.** Subject, date, risk tier with the one factor that drove it, execution policy (sandboxed source-and-local-only), and coverage (full, scoped, or quick, and whether prior runs informed this one). A scoped or quick run says plainly here that it is a partial pass.

**Bottom line.** One or two sentences. Safe to ship from a security standpoint, or the single thing standing in the way. A clean review says so without hedging.

**What is already solid.** Name the controls that genuinely work. This is part of the deliverable, not filler. It tells the reader what not to disturb and earns trust in the findings that follow.

**Confirmed findings.** Only demonstrated vulnerabilities, highest severity first. Each one leads with the real-world consequence, then gives the technical backing: what is true today with the repository path and line, what it means in practice for a person or the business, how it was shown with the bounded local reproduction, the conditions required, and the smallest source fix with a regression test. If there are none, write one line saying so and keep the section short. Do not invent low findings to look thorough.

**Needs validation.** Source-grounded leads blocked on one fact outside the repository. No severity. A short table: the lead, where it is, the exact missing fact, and the safe way an owner can check it. These are prioritized leads, not findings, and not live-test instructions.

**Hardening notes.** Defence-in-depth improvements that are not vulnerabilities because another layer already stops the attack. Kept separate so they do not inflate the finding count. Positive patterns worth keeping can go here too.

**Coverage and limits.** What was reviewed and what was not, deferred and out-of-scope areas, and the plain statement that no single pass is exhaustive.

**Action plan.** Split into before-launch (blocking), soon-after (important, not blocking), and when-it-becomes-relevant (tier-dependent, revisit as the system grows). This is the part most likely to actually get used, so make it concrete.

## Worked example of the consequence framing

The framing is the thing that most often goes wrong, so here is the difference made explicit. Both describe the same finding.

Weak, technical only:

> Broken access control on `GET /api/v1/exports/:id`. The handler checks authentication but not ownership, so `export_id` is an IDOR.

Strong, consequence first:

> Any logged-in member can read another church's data export by changing one number in the URL. The export includes giving records and member contact details. Right now the code checks that you are signed in but never checks that the export belongs to you, so a single ordinary account can walk through every export on the platform. Severity: high, cross-tenant data read. Fix: scope the lookup to the caller's church at `exports/handler.ts:42` and add a test that a member of church A gets 404 for church B's export.

The second version is longer because it tells the reader what actually happens, which is the only version they can act on.

## Companion files for larger runs

For a review with several medium-or-higher findings, it is fine to keep the deep per-finding detail (full ordered trace, exact fixture, observed output, regression case) in a separate `FINDINGS-DETAIL.md` and the unresolved leads in a `NEEDS-VALIDATION.md`, with `SECURITY-REVIEW.md` staying the readable summary. Keep all three derived from the same `findings.json` so they never disagree.
