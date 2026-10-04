# Attack Classes

Choose the classes that match what reconnaissance actually found. Not every class applies to every target. This file is the working catalogue for the kinds of systems the Builders family tends to review: web and API services, multi-tenant SaaS on Postgres or Supabase, and products with an LLM or agent in the loop. For native, binary, kernel, protocol, cloud-infrastructure, and supply-chain depth beyond what is here, the upstream `security-audit` skill in this repository carries dedicated companion files; reach for those when the target is in one of those domains.

Every class below obeys the same gate as everything else: name the lower-trust actor, the input or action, the control that should stop it, the boundary crossed, and the concrete result. A class is a place to look, not a licence to report a concern without that evidence.

## Contents

1. Injection
2. Access control and authorization
3. Multi-tenant data isolation
4. Authentication, sessions, and tokens
5. Resource and file handling
6. Cryptography and secrets
7. Business logic
8. Feature abuse and data leakage
9. LLM, agent, and tool-calling
10. Client-side and browser
11. Chained vulnerabilities and trust boundaries
12. Obvious things

## 1. Injection

Trace untrusted input from entry point to a dangerous sink. What counts as dangerous depends on the target: SQL and ORM query construction, HTML and template output, shell commands, file paths, redirects, deserialization, log and search-index writes, LDAP or similar. Do not stop at the direct path. Look for indirect injection where data is stored safely and later retrieved into a dangerous context by different code, and for injection through field names, keys, headers, and metadata rather than values. On Postgres and Supabase specifically, check string-built SQL, dynamic SQL in functions, and anything that bypasses the parameterized query path or the ORM.

## 2. Access control and authorization

Verify a caller cannot act outside its authority. Go past "does a permission check exist" to "is it the right check, for the right resource, through the right mechanism". Ask: is there a second path to the same state change that checks a weaker permission or none; can a field in the request body override what the permission system meant to restrict; are there endpoints that gate on authentication but forget authorization; does the same resource have multiple access paths with inconsistent checks; do bulk, batch, export, and import operations enforce per-item permission. Split auth-bypass from authorization-logic when the model is complex.

## 3. Multi-tenant data isolation

The boundary that matters most for SaaS. Every read and write must be scoped to the caller's tenant, and that scope must be enforced in the query or policy, not merely stored on the object. A tenant field on a row is not enforcement if an alternate query, a shared cache, a batch path, a report, or an admin view omits the filter. On Supabase, read the Row Level Security policies as the primary control: check that RLS is actually enabled on every table that holds tenant data, that policies scope by the authenticated tenant and not just by authentication, that `service_role` or any bypass path is not reachable from user-triggered code, and that `security definer` functions do not quietly run past the policy. Cross-tenant read or write is a high finding by default; prove the exact path and name the affected tenant.

## 4. Authentication, sessions, and tokens

Check identity establishment at every entry surface and the lifecycle after. Session fixation and predictable or non-rotating session identifiers. Token scope that is broader than the action needs, or that widens after refresh, delegation, or role change. JWT handling: algorithm confusion, missing signature or audience checks, trusting unverified claims. Password reset, invite, account linking, and recovery flows, which routinely leak existence or hand over access. MFA and passkey flows that can be skipped or downgraded. Confirm the broken state is actually accepted before reporting.

## 5. Resource and file handling

Path traversal when reading or writing, including through symlinks, encoded sequences, and null bytes. Server-side request forgery when the application fetches a URL the caller influences, including through redirects, DNS rebinding, and URL-parser differentials; webhook, notification, and callback URLs are the common entry. Unsafe deserialization and archive extraction (zip slip). Temp-file handling and check-then-use races on file operations. For uploads, check where the file lands, who can later reach it, and whether its type and size are enforced where it matters.

## 6. Cryptography and secrets

Weak randomness for security-critical values such as tokens, keys, and nonces. Hardcoded secrets, and secrets in logs, error messages, URLs, or client-visible responses. Broken key derivation, missing integrity verification, nonce or IV reuse, unauthenticated encryption, ECB mode. Timing side-channels on secret comparison. And the failure path: when a crypto operation fails, does the code fall back to no crypto or an empty value.

## 7. Business logic

Hand-found logic errors that scanners miss and that tend to be high impact. State-machine violations: can you skip steps, go backwards, replay a completed flow, or leave a half-committed state when step two of three fails. Race conditions with business impact: double-spend, double-approve, lost updates, anything that checks then acts non-atomically. Numeric and quantity manipulation: negative, zero, overflow, precision loss, string-number coercion. Time-based logic: expiry, scheduling, rate windows, clock skew, exact-boundary moments. Default and fallback behaviour: the security posture when config is missing, a flag is off, a dependency is down, or the system is mid-migration.

## 8. Feature abuse and data leakage

Legitimate features turned to unintended ends. Export, backup, or snapshot that a low-privilege user can trigger and that includes data above their access, other users' data, or deleted and draft content. Import or restore that overwrites data, creates records bypassing validation, or ignores the permission model the UI enforces. Search, filter, and sort as an oracle that reveals whether hidden content exists or leaks hidden field values through result ordering. Enumeration through differing error messages, timing, sizes, or status codes across reset, invite, and registration. Preview, draft, and staging leakage through tokens that unlock too much, or cache headers that let a CDN serve private content.

## 9. LLM, agent, and tool-calling

For any product where a language model participates in a trust-sensitive decision: assistants, RAG, persistent memory, tool-calling agents, MCP servers or clients, prompt assembly from untrusted input, or code that acts on model output. The data flow that matters is untrusted content reaching a model or memory and then reaching capability, authority, or a sink.

Prompt injection alone is not a finding. Require a code-level boundary failure: content reaches another principal's context, invokes authority the requester lacks, discloses data they cannot read, or drives a sink they cannot reach directly. Model output, retrieved documents, tool descriptions, and MCP responses are untrusted inputs, not policy. A guardrail prompt is not a security boundary; count only deterministic checks, resource-scoped authorization, isolation, and constrained credentials. The specific shapes to look for: indirect injection through retrieved or ingested content that enters another user's context; cross-session or cross-tenant context bleed through over-broad cache or history keys; persistent memory poisoning where low-trust content becomes durable instruction; tool-argument injection where model-produced arguments reach SQL, shell, file, or URL sinks without handler-side validation; confused-deputy authority where the tool uses a service identity but never re-checks the requesting user's permission on the named resource; action-confirmation binding where an approved action can execute with mutated arguments, a different resource, or on a later turn; and unbounded delegated loops that spend, send, or mutate without a per-request budget or idempotency control. Separate authorization from action binding: an action the user is generally allowed to perform is still a finding if attacker-controlled content caused it without the user's intentional request.

## 10. Client-side and browser

For SPAs, extensions, embedded webviews, and anything rendering in a browser. DOM-based injection where untrusted data reaches an executing HTML, template, URL, or script sink without the sink's required encoding. `postMessage` and cross-window messaging that trusts the message without checking origin. Prototype pollution. CORS set to a wildcard, or a reflected origin combined with credentials. Cookies missing `HttpOnly`, `Secure`, or `SameSite` where the cookie carries something sensitive. Service workers and browser storage holding data a later context trusts. Confirm the sink and the actual sensitive data before reporting; a missing flag on a cookie that holds nothing sensitive is not a finding.

## 11. Chained vulnerabilities and trust boundaries

Individually contained behaviour that becomes a vulnerability when a later component or lifecycle step relies on a stronger guarantee. Map what a low-privilege actor can read, write, invoke, and retain, then connect only concrete outputs to later trust decisions, confirming each prerequisite rather than assuming the downstream effect. Compare the exact guarantee one component produces with what the next assumes, including truncation, type coercion, normalization, and tenant scope. Watch second-order use where safe-when-stored data becomes dangerous later: a field name becomes a JSON path, a slug becomes a file path, a stored string becomes a URL or template. Watch scope growth after delegation, refresh, caching, or role change. Watch rollback and recovery: undelete and restore must reapply current ownership and authorization, not restore an invalid past state.

## 12. Obvious things

The basic exposures everyone assumes someone else checked. Be thorough and literal here; creativity is not the point. Hardcoded passwords, keys, tokens, or secrets in source, including in git history. Security-relevant TODO, FIXME, and HACK comments. Debug or dev mode reachable in production through an env var, query parameter, or header. Test, example, or seed credentials that work in production. Unprotected `/debug`, `/admin`, `/metrics`, `/env`, `/.env`, `/config`, and similar. Secret files committed to the repo, and a `.gitignore` that does not actually cover them. Unpinned dependencies or known-vulnerable versions in lockfiles. Dynamic `eval`, `exec`, child-process, or `Function` calls with influenced input. Open redirects through `redirect`, `return`, `next`, `url`, `goto` parameters. Error responses leaking stack traces, internal paths, or SQL errors in production. For anything flagged here, trace the impact before reporting: a flag is not a finding until you have shown the sensitive data or reachable path behind it.
