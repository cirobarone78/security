# security-audit

A coding-agent skill that turns your agent into a security auditor. It orchestrates isolated agents through reconnaissance, coverage-led hunting, candidate validation, structured output, independent record verification, and target-neutral reporting.

This repository is a fork of [Cloudflare's security-audit-skill](https://github.com/cloudflare/security-audit-skill), the single-repository starting point for the harness described in [Build your own vulnerability harness](https://blog.cloudflare.com/build-your-own-vulnerability-harness). The audit method and validators are maintained upstream. This fork currently adds clearer usage and platform guidance and automated checks; it does not claim a different detection method.

This fork also ships a second skill, [`security-review`](skills/security-review), a lighter adaptation of the same method for the Builders engineering family. It keeps the upstream verification spine (three verdicts, adversarial independence, severity-requires-impact, the hardened validators) and adds plain-language consequence framing, risk tiers, and explicit handoffs to sibling skills so a review can feed a release gate. Use `security-audit` for the full multi-agent harness and `security-review` when you want a review that speaks the Builders family's language. See its [NOTICE](skills/security-review/NOTICE.md) for attribution.

## What it does

The skill runs a structured audit in six phases:

1. **Reconnaissance** -- map architecture, trust boundaries, input surfaces, prior evidence, and deterministic coverage in `architecture.md` and `coverage-ledger.json`.
2. **Coverage-led hunting** -- assign isolated hunters from ledger units, record their checks, and use coverage critics to find gaps.
3. **Candidate validation** -- give every unique candidate to a fresh verifier that tries to disprove it.
4. **Structured output** -- write `confirmed`, `needs_validation`, and `rejected` records to `findings.json` and validate them against `report-schema.json`.
5. **Independent record verification** -- fresh agents verify final source claims. Material replacements receive another independent verifier.
6. **Target-neutral reporting** -- derive `REPORT.md`, `FINDINGS-DETAIL.md`, and `NEEDS-VALIDATION.md` from the verified records and coverage ledger.

The parent runs `validate-coverage-ledger.cjs` after creating the ledger and after each later ledger update. It runs `validate-findings.cjs` in Phase 4 and again after every Phase 5 replacement.

The verdicts are distinct: `confirmed` has a complete source trace and bounded observed result, `needs_validation` has an exact unresolved fact and no severity, and `rejected` records a disproved candidate.

Multiple runs against the same repo are additive. The skill uses prior ledgers and findings to target gaps, revalidate changed source, and carry forward current-source evidence without treating stale or unresolved work as covered.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Setup, core principles, platform terminology, workflow overview, and audit anti-patterns |
| `RECONNAISSANCE.md` | Phase 1 reconnaissance prompts and synthesis instructions |
| `HUNTING.md` | Phase 2 orchestration, hunting methodology, and validation rules |
| `ATTACK-CLASSES.md` | Core, wildcard, and obvious-things attack prompts |
| `MEMORY-SAFETY-AND-BINARY.md` | Memory-safety, binary, and kernel hunting classes for native targets |
| `AI-AND-LLM.md` | Prompt-injection, agent/tool, and output-handling hunting classes for LLM-backed targets |
| `WEB-PROTOCOL-AND-AUTH.md` | HTTP request-framing, cache, and authentication-protocol hunting classes for HTTP-protocol and auth targets |
| `CLIENT-SIDE.md` | DOM-injection, messaging-trust, UI-redress, and prototype-pollution hunting classes for client-side/browser targets |
| `SUPPLY-CHAIN-AND-RELEASE.md` | Dependency, CI, release, signing, update, plugin, and extension hunting classes |
| `CLOUD-AND-DEPLOYMENT.md` | IAM, infrastructure-as-code, container, serverless, ingress, and runtime-configuration hunting classes |
| `PROTOCOLS-RPC-AND-MESSAGING.md` | RPC, serialization, queue, broker, webhook, and streaming-protocol hunting classes |
| `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` | Shared resource, quota, queue, worker, and operator-spend hunting classes |
| `DATA-ISOLATION-AND-LIFECYCLE.md` | Tenant isolation, cache, search, export, backup, migration, deletion, and restore hunting classes |
| `DESKTOP-MOBILE-AND-LOCAL-IPC.md` | Native app, deep-link, webview, exported-component, helper, daemon, and local-IPC hunting classes |
| `VALIDATION-AND-REPORTING.md` | Phases 3–6 candidate validation, structured output, record verification, and reporting |
| `report-schema.json` | JSON schema for all three `findings.json` verdicts |
| `validate-findings.cjs` | Zero-dependency validator for `findings.json` in Phases 4 and 5 |
| `validate-findings.test.cjs` | Findings-validator tests and producer-compatible fixture checks |
| `validate-coverage-ledger.cjs` | Zero-dependency validator for `coverage-ledger.json` in Phases 1–5 |
| `validate-coverage-ledger.test.cjs` | Coverage-ledger validator tests |

## Installation

Install the skill with the [Skills CLI](https://skills.sh):

```bash
npx skills add https://github.com/Beckleytobi/security-audit-skill \
  --skill security-audit
```

Use `--global` for a user-level installation:

```bash
npx skills add https://github.com/Beckleytobi/security-audit-skill \
  --skill security-audit \
  --global
```

Run `npx skills --help` for agent-selection and non-interactive options.

## Usage

Start your coding agent in (or pointed at) the codebase you want to audit, then ask it to do a security audit:

```
security audit this codebase
```

```
find security vulnerabilities in ./src
```

```
do a security review, output to ~/audits/my-project
```

The skill activates automatically when the request matches its trigger (security audit, find vulnerabilities, pen-test the code, etc.). A direct codebase audit or pen-test request uses full audit mode. Security questions and focused vulnerability work use guidance mode unless you request report artifacts. In full audit mode, an unspecified output directory defaults to `~/security-audit-skill/<repo-name>/run-<N>`. The workflow writes inside the target repository only when you explicitly select a directory that version control ignores.

### Choose an audit size

| Request | Skill behavior |
|---|---|
| A security question or one finding | Guidance mode: use the relevant method without creating a full audit run. |
| A repository audit or requested report | Full audit mode: use the six phases and the `standard` profile by default. |
| A fast first pass or a narrow subsystem | Request `quick` or name the scope; the report must say that coverage is partial. |
| A high-stakes, multi-pass review | Request `deep`; it uses more independent review and agent calls. |

For example: `Audit the authentication subsystem with the quick profile and report the coverage gaps.` The profiles change breadth and review effort, not the evidence required to confirm a finding. A full audit needs a platform that supports parallel agents and the validator and sandbox requirements below.

## Requirements

- A coding agent with a model that supports tool use and parallel sub-agents
- Node.js for the zero-dependency findings and coverage-ledger validators
- An OS-enforced sandbox for target-controlled builds, tests, processes, browsers, emulators, fuzzers, and fixtures. It must disable external networking, use a sanitized allowlisted environment, enforce resource limits, and allow writes only to assigned scratch paths. Without these controls, the workflow keeps the lead as `needs_validation` instead of executing target code.
- The bundled validator CLIs require Node.js to expose nonzero `O_NOFOLLOW` and `O_NONBLOCK` file-opening flags. On platforms without them, including Windows with the currently bundled Node.js validator implementation, they deliberately fail closed. Use a supported host for a complete audit; a Windows host can still use guidance mode and the validators' in-process checks, but cannot claim a completed full run. Running Node in a Linux container does not by itself satisfy the separate target-code sandbox requirements.

## Checks

The repository tests both validators on Linux and Windows in CI. On platforms without safe input-opening flags, CLI acceptance tests are skipped and explicit tests check that the CLIs fail closed. Locally, run:

```bash
node --test skills/security-audit/validate-findings.test.cjs skills/security-audit/validate-coverage-ledger.test.cjs
```

These tests check validator behavior; they do not measure vulnerability detection quality. A comparative evaluation against known vulnerable and clean repositories remains future work.

## Design principles

- **Only confirm established boundary failures.** Keep a source-grounded blocked lead as `needs_validation` with its exact unresolved fact.
- **Adversarial validation.** The agent that checks a finding is never the agent that found it.
- **Severity requires impact.** Likelihood x impact, not deviation from a checklist.
- **Defense-in-depth gaps are not vulnerabilities.** If Layer A prevents the attack, the absence of Layer B is a hardening note.
- **Multiple runs can improve coverage.** Preserve prior evidence and gaps so later runs can target work left open; measure the gain on your own repositories rather than assuming a fixed detection rate.

## License

MIT -- see [LICENSE](LICENSE).
