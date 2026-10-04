# Risk Tiers, Verdicts, and Evidence

Read this before setting the tier or deciding any verdict. It carries the parts of the method that keep the output honest: how hard to look, what counts as confirmed, how severity is calibrated, and where the line is between a bounded local check and reckless testing.

## Contents

1. Risk tiers
2. The candidate gate
3. The three verdicts
4. Severity anchors
5. Bounded local evidence and the sandbox
6. Source visibility

## 1. Risk tiers

Set the tier first and state it, plus the one factor that drove it, at the top of the report. Tier the change or component in front of you, not the whole codebase.

- **Tier 0, low stakes.** Static or internal, no sensitive data, easily reversible. A broken control here is an inconvenience. Review the obvious exposures and move on.
- **Tier 1, moderate.** Real users or data, limited blast radius. One user can affect their own data or a small shared surface. Review the primary boundaries and the obvious classes.
- **Tier 2, high.** Authentication, authorization, multi-tenant data, money, or irreversible actions. A broken control crosses between users or tenants or moves money. Review thoroughly, split by subsystem, and run the adversarial verification pass without shortcuts.
- **Tier 3, critical.** Payments, health or identity data, or anything that takes over accounts or infrastructure if it fails. Review deeply, give the high-value boundaries a second independent pass, and treat the absence of a control that a tier-0 system could skip as itself a finding.

The driving factor is one of: money, irreversibility, data sensitivity, traffic, or blast radius. Name it. It is what justifies the depth to a reader who wonders why a small change got a long review, or a large one got a short one.

Tiers change breadth and redundancy. They never lower the evidence bar. The candidate gate, the source-and-local boundary, the `needs_validation` discipline, and independent verification of confirmed records apply at every tier.

## 2. The candidate gate

A candidate must pass all of these before it can even be proposed as `confirmed`:

1. A complete repository-relative source trace from a real lower-trust entry point to the sink or boundary effect, with the strongest source-visible control on the path identified.
2. A bounded local observed result that establishes the boundary failure, with meaningful impact across a stated boundary and no visible preventing layer.
3. No strengthening of the observed effect. A crash is not code execution. Ordinary work is not an availability attack. A same-principal action is not privilege gain.
4. If a required fact is not visible in source and not locally observable, the verdict is `needs_validation` with the exact blocker named. It does not get a severity or a speculative completion.
5. A missing best practice with no affected principal or resource is hardening or excluded, not a finding. A candidate that source disproves is `rejected`, not `needs_validation`.
6. The same source-derived fingerprint identifies the same root cause in every state, so the same issue is never reported twice and can be tracked across runs.

Return nothing rather than something that fails the gate. An empty confirmed list on a real review is a legitimate and valuable result.

## 3. The three verdicts

Keep them distinct. The schema in `scripts/report-schema.json` enforces the field contracts, and `scripts/validate-findings.cjs` rejects a record that mixes them.

**confirmed** — a demonstrated vulnerability. Has `root_cause`, `intended_behavior`, an ordered `trace`, `evidence`, `conditions`, a target-neutral `execution` with a nonempty `observed_result`, `remediation`, `severity`, and `confidence`. The execution uses the target's native interface: an API call, a CLI invocation, a library call, a message, a file fixture, a browser action, or a rendered policy. HTTP is one option, not the default.

**needs_validation** — a source-grounded lead blocked on an exact fact that is genuinely outside the repository or the local fixture. Has `claimed_root_cause`, `trace`, `evidence`, nonempty `blockers`, and at least one applicable `validation_plan.local` or `validation_plan.deployment`. No severity, no remediation, no execution. The `deployment` plan asks an owner to observe a configuration, identity, route, policy, or runtime fact. It is never a request to send audit traffic at a live target. `needs_validation` is not a parking space for a hunch; if source refutes the trace, the verdict is `rejected`.

**rejected** — a candidate that source or local behaviour disproved. Has `claimed_root_cause`, `trace`, `evidence`, and a `reason`. Kept so a future run does not re-raise the same unsupported claim without new evidence. Not described as a finding in the report.

## 4. Severity anchors

Only `confirmed` records get a severity, and overall severity can never exceed demonstrated impact.

- **critical** — an unauthenticated actor gains code execution, full data-store access, or takeover of arbitrary accounts.
- **high** — an actor fully defeats an explicit control with real consequences: authentication bypass, cross-tenant read or write, stored script execution affecting other users, authenticated code execution, or an unauthenticated remote stop of a shared service.
- **medium** — a real boundary violation with limited blast radius, uncommon preconditions, or consequences confined to a narrow resource set.
- **low** — disclosure of non-secret internals, or an effect that needs sustained effort for minimal gain.
- **informational** — a confirmed but minimal-impact observation, useful mainly as a prerequisite inside a larger finding.

The high-versus-medium test: does the demonstrated result fully defeat an explicit control for an action with real consequences, or only weaken it? If you cannot state the concrete damage, the severity is lower than it feels.

## 5. Bounded local evidence and the sandbox

Local execution is for confirmation, not impact expansion.

Run target-controlled builds, tests, processes, browsers, emulators, fuzzers, and fixture processing only inside an OS-enforced sandbox that provides all of:

- no external network, with an isolated loopback namespace only when a check genuinely needs local client and server traffic;
- an empty environment populated from an explicit allowlist with safe values, with scratch-local `HOME`, temp directories, and caches;
- a read-only target and toolchain, with the target-controlled process able to write only inside its own scratch directory;
- explicit low CPU, memory, process, file-size, disk, and wall-clock limits, applied to every check and not only the ones expected to be expensive.

Record the exact input, command, limits, and minimum result. For the environment, record only the allowlisted variable names and safe non-secret values needed to reproduce the check. Never capture the ambient environment, inherited variables, credentials, authentication state, or unrelated host paths. Launch from an empty environment rather than redacting one afterward.

Allowed inside that sandbox: offline builds with already-present dependencies; isolated-loopback processes using dummy state; unit and integration tests; small fixture processing; sanitizers; bounded fuzz and regression tests; deterministic concurrency checks; local browser or emulator tests with dummy accounts; rendered manifests and policy evaluation with dummy identities; mocked external or paid calls.

Never allowed: live or deployed traffic; requests to services not started for this isolated check; installing or fetching dependencies over the network; real accounts, credentials, or production data; shared queues, cloud resources, runners, registries, or signing and release services; publishing; stress, saturation, or cost generation; any work past the minimum dummy-data boundary result.

If any required control is unavailable, do not execute. Record the lead as `needs_validation` with the exact missing capability and a safe plan. A missing sandbox does not erase a source-grounded candidate; it just blocks the confirming step.

## 6. Source visibility

Deployment controls, proxy and CDN behaviour, provider settings, browser headers, identity policy, broker ACLs, packaging, and topology are real controls. When one is required for the trace to hold and it is not present in the repository, do not assume either presence or absence. Use `needs_validation` with the exact missing fact and a safe owner-observed or local plan. A deployment, provider, browser, OS, proxy, package, secret, or identity fact outside source is not proof in either direction.
