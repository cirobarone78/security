# Attribution

This `security-review` skill is an adaptation, not original work from scratch.

Its verification architecture, three-verdict model, severity discipline, sandbox
and write-isolation rules, and the hardened validators and JSON schema in
`scripts/` are derived from Cloudflare's **security-audit-skill**
(https://github.com/cloudflare/security-audit-skill), MIT licensed. The following
files are carried over substantially unchanged and credit belongs upstream:

- `scripts/report-schema.json`
- `scripts/validate-findings.cjs` and `scripts/validate-findings.test.cjs`
- `scripts/validate-coverage-ledger.cjs` and `scripts/validate-coverage-ledger.test.cjs`

What this adaptation adds, so it fits the Builders skill family:

- Plain-language consequence framing, so every confirmed finding states what
  happens to a real person or the business, not only the technical boundary.
  This idea is borrowed from the `production-readiness` skill.
- Risk tiers (0-3) aligned with `production-readiness`, in place of the original
  run profiles.
- An explicit handoff graph (`references/skill-handoffs.md`) so the review plugs
  into `software-design-principles`, `regression-protection`,
  `production-readiness`, `database-rls`, `testing-verification`, and
  `ci-cd-delivery-governance`, with a verdict vocabulary that `ci-cd` can consume
  at a release gate.
- A founder-facing report shape (`references/report-template.md`,
  `scripts/report_skeleton.py`).

The original skill remains the authoritative reference for the full six-phase
multi-agent audit. Use it directly when you want the complete harness. Use this
one when you want a security review that speaks the Builders family's language and
hands off cleanly to the other engineering skills.

Licensed under MIT, consistent with the upstream project. See LICENSE at the
repository root.
