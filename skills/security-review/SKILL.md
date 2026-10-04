---
name: security-review
description: Find real, demonstrated security vulnerabilities in a codebase, API, service, or library, then report each one with its source evidence, a safe reproduction, a priority grounded in actual impact, and the smallest effective fix. Use whenever someone asks to security review, security audit, pen-test, or find vulnerabilities in code, when a change touches authentication, authorization, payments, multi-tenant data, file handling, deserialization, webhooks, LLM or agent tool-calling, or secrets, and before shipping anything where a breach would expose user data or let one tenant reach another. This is the security verdict that production-readiness, regression-protection, and QA each explicitly defer to; reach for it even when the request says "is this safe" without the word security. Defensive and source-first: it reviews code and runs only bounded local checks, never live or shared targets.
---

# Security Review

## The question this exists to answer

> Can a lower-trust actor cross a boundary this code is supposed to hold, and if so, what actually happens to a real person, tenant, or the business?

A finding is not a missing best practice, a scanner flag, or a gut feeling that something looks off. A finding is a demonstrated failure: a named lower-trust actor, an input or action they control, a control that should have stopped them, the boundary that gets crossed anyway, and a concrete observed result. If you cannot name all of those, you do not have a finding yet. You have a lead, and leads have their own home in this workflow.

That bar is the whole point. Security review done without it produces a long list of plausible-sounding concerns that waste the reader's time and train them to ignore the next report. Done with it, every line in the output is something that is actually true and actually matters.

This skill is defensive and source-first. It reads code and runs small, bounded, local checks to confirm behaviour. It never touches a live endpoint, a shared service, production data, another user's account, or a real credential. The deliverable describes fixes; it does not change the target's source.

## How this differs from the skills around it

Do not collapse security into a general "is this good" review. Each of these answers a different question, and a change can need several at once.

| Skill | Question it answers |
|---|---|
| software-design-principles | Is the code structured appropriately for this change? |
| regression-protection | Did this break something that used to work? |
| production-readiness | Can we operate this safely with real traffic and failures? |
| QA / testing-verification | Does it behave correctly against requirements? |
| **security-review (this one)** | **Can an attacker cross a boundary, and what is the damage?** |

`production-readiness` and the others deliberately hand the security verdict here and ask whether a real review happened. This skill is that review. When a task also needs one of the others, do the security work and hand the rest to its own process rather than rendering that verdict here. See [references/skill-handoffs.md](references/skill-handoffs.md) for what this consumes from and produces for each sibling, including the verdict vocabulary that lets `ci-cd-delivery-governance` consume these findings at a release gate.

## Who reads the output, and why it changes how you write

The person relying on this is often a non-technical founder, not another security engineer. A finding they cannot act on because they cannot tell what it means has not been communicated. So every confirmed finding states the real-world consequence, not only the technical boundary.

Weak: "Missing per-item authorization on the bulk export endpoint."

What it should say: "Any logged-in member can call the export endpoint and download records belonging to other churches, including ones they have no access to in the app. Right now nothing stops that, so a single ordinary account can pull the whole platform's data."

This translation is not decoration layered on top of the real analysis. It is the deliverable. The technical trace lives in the detail; the consequence leads.

## Two ways to use this skill

Loading this skill does not by itself start a full audit or create files.

**Guidance mode** is the default. For a security question, a focused review of one component, triage of a specific concern, or a methodology question, use only the relevant parts of this skill and answer in the conversation. Do not create an output directory or write report files.

**Full review mode** is for an explicit request to audit, pen-test, or do a complete security review of a codebase, or when the person asks for the report artifacts. Run the workflow below and write the files. If a request could mean either, ask one short question before creating anything.

## The non-negotiables

These hold in both modes. They are what make the output trustworthy.

**A finding needs a boundary and a result.** Name the lower-trust actor, the accepted input or action, the control that should have rejected or scoped it, the boundary crossed, and the concrete observed result. Never promote a missing best practice, a guessed deployment behaviour, a generic parser crash, or a self-inflicted effect into a security finding. Read [references/risk-and-verdicts.md](references/risk-and-verdicts.md) for the candidate gate in full.

**The checker is never the finder.** The single most important rule. The agent (or pass) that verifies a finding must not be the one that discovered it. A verifier tries to *refute* the claim from source and bounded local evidence. A finding that survives an honest attempt to disprove it is worth reporting; one that was only ever confirmed by its own author is not. If you are working without sub-agents, separate the passes in time and mindset: hunt first, then come back and genuinely try to break each candidate before it earns `confirmed`.

**Severity requires demonstrated impact.** Overall severity can never exceed what you actually showed. A crash is a crash until you demonstrate code execution; do not narrate it into the latter. The severity anchors are in [references/risk-and-verdicts.md](references/risk-and-verdicts.md).

**Three verdicts, kept distinct.** `confirmed` has a complete source trace and a bounded observed result. `needs_validation` has an exact unresolved fact that is genuinely outside the repository, and it carries no severity: it is not a low-confidence `confirmed`. `rejected` records a candidate that source or local behaviour disproved, kept so a later run does not re-raise it without new evidence.

**Bounded local evidence only.** Static analysis establishes the path. A small local check resolves behaviour: a function harness, an existing unit test, a parser fixture, a dummy-tenant integration test, a locally rendered policy. Stop at the first result that settles the invariant. Run target-controlled code only in an OS-enforced sandbox with no external network, an allowlisted empty environment, read-only target and tools, scratch-only writes, and explicit resource and time limits. If that sandbox is not available, do not execute; record the lead as `needs_validation` with the missing capability. The full execution boundary is in [references/risk-and-verdicts.md](references/risk-and-verdicts.md).

**Source visibility is honest.** Deployment settings, proxy and CDN behaviour, provider config, identity policy, broker ACLs, and topology are real controls. If one is required and not in the repository, do not assume it is present or absent. Say so with `needs_validation` and name the exact fact and a safe way the owner can check it.

**The smallest effective fix.** For each confirmed finding, name the invariant the code must enforce and the narrowest source change that enforces it at the last trusted decision point, with a regression test. Prefer a specific repository-relative change over generic hardening advice.

## Workflow (full review mode)

Set the risk tier first (see [references/risk-and-verdicts.md](references/risk-and-verdicts.md)), because it decides how hard to look and how much redundancy the rest of the run gets. Tier a *change or component*, not a whole codebase: a payments platform can still ship a low-stakes copy tweak, and a quiet internal tool can still add a genuinely high-stakes feature.

1. **Map the ground.** Product, principals, and their normal authority. Entry surfaces where external or lower-trust input enters, the transformations and stored copies it flows through, and the security-relevant sinks it reaches. The trust boundaries and the strongest source-visible control on each. Local build and test commands that could run offline. Prior review output for this repo, if any. Keep this to roughly 1,000 words of orientation; it is the shared context every later step reads.

2. **Hunt by boundary.** Choose the attack classes that match what you mapped from [references/attack-classes.md](references/attack-classes.md); not every class applies to every target. Trace each assigned input from entry through identity, authorization, normalization, state, and derived copies to the final sink, including the sibling, legacy, batch, retry, and error paths that reach the same effect. Produce candidates that each meet the gate, or record honestly that a boundary held.

3. **Validate adversarially.** Give every candidate to a fresh verifier that did not find it and whose job is to refute it. It re-reads every cited line and independently reproduces any decisive check it safely can. It returns `confirmed`, `needs_validation`, or `rejected`.

4. **Record structured output.** Write the final records to `findings.json`, sorted by fingerprint, matching `scripts/report-schema.json`. Validate with `node scripts/validate-findings.cjs findings.json`. If you kept a coverage ledger, validate it with `node scripts/validate-coverage-ledger.cjs coverage-ledger.json`. The validators prove format and consistency, not correctness.

5. **Verify the final records with fresh eyes.** A second independent pass checks each retained `confirmed` and `needs_validation` record against source. Any upgrade to a stronger verdict gets another independent verifier before it stands. Never let a `confirmed` record reach the report without independent review.

6. **Write the founder-facing report.** Derive `SECURITY-REVIEW.md` from the verified records with `scripts/report_skeleton.py "<subject>" --tier <0-3>` as the shell, following [references/report-template.md](references/report-template.md). The prose never changes a verdict, severity, or blocker. A clean run can have zero confirmed findings; say so plainly rather than inventing low findings to look thorough.

End the run in exactly one of two states: all report artifacts written and the validators passing, or an explicitly recorded incomplete status with its reason and the gap disclosed in the report. Never stop mid-phase and imply completion.

## Guardrails

Proportionality cuts both ways. Do not bury a static marketing page in demands that belong to a payments platform, and do not wave a payment or health-data path through with a shallow pass. At the top tiers, a gap that would be fine to skip at tier 0 is itself a finding.

Never expand harm to prove a point. Stop at the smallest effect that establishes the defect: a wrong return value, an unauthorized dummy record, a sanitizer finding, a policy difference. Do not build a working exploit chain, test availability by exhausting a real service, or produce persistence or concealment material. The review confirms the boundary failure and stops.

Never run target-controlled code outside the sandbox, use a real credential, probe a deployed target, or touch shared infrastructure. If the decisive fact lives outside source and the local fixture, it is `needs_validation`, not a guess.

No single pass is complete. State what you reviewed and what you did not. Multiple runs improve coverage; in practice a single pass finds a fraction of what repeated passes find together. A quick or scoped run presents itself as a partial pass, never a clean bill of health.

This is a security review, not a full engineering review. Note structural, operational, or correctness issues you happen to see and hand them to the right sibling skill, but do not present this as having rendered those verdicts.
