# Cryptography and Key Management Hunting

#### When to use this file

Reach for this file when the target encrypts protected data, signs or verifies messages, generates security tokens, stores password verifiers, establishes TLS peer identity, or manages secret/key lifecycles. Select it for a source-visible cryptographic trust boundary, not merely a crypto dependency. Use `ATTACK-CLASSES.md` for the ordinary cryptography and secrets block, `WEB-PROTOCOL-AND-AUTH.md` for session and identity-protocol semantics, and `CLOUD-AND-DEPLOYMENT.md` for provider IAM and deployment policy. Share evidence for overlapping paths rather than reporting the same root cause twice.

Split large targets by encrypted storage, signing/verification, token generation, password storage, TLS clients/servers, and key provisioning/rotation.

## Core discipline (include in every agent prompt for this domain)

```
- Name the protected property (confidentiality, integrity, authenticity, or peer identity), attacker-controlled bytes, key owner, and operation that consumes the cryptographic result.
- Trace the complete construction: algorithm/mode, key provenance and scope, randomness, nonce/IV, authenticated context, verification, and failure handling. An algorithm name alone is not a finding.
- Require a concrete security use and boundary result. Non-security checksums, public salts/nonces, test-only keys, and absent optional hardware are not vulnerabilities by themselves.
- Use dummy secrets and bounded offline fixtures under SKILL.md's execution controls. Never recover real passwords, extract production keys, or probe deployed TLS/KMS endpoints.
- Use needs_validation when key access, issuance volume, provider policy, certificate trust, or deployment configuration is decisive but unavailable. Do not infer these facts from a library default alone.
```

## Primitive and encryption attack classes (subagent_type: `general`)

**Weak or deprecated cryptographic constructions**
Locate MD5/SHA-1 used where collision resistance is required, DES/3DES/RC4 encryption, ECB patterns, home-grown ciphers, and unsupported algorithms or key sizes. Distinguish an unkeyed digest from a MAC: hashing an attacker-editable message does not authenticate it. Do not equate collision attacks with preimage recovery or automatically extend a hash collision claim to HMAC. Establish the actual forgery, disclosure, or unauthorized acceptance path; recommend a maintained high-level construction appropriate to the protocol rather than inventing a replacement.

**Insecure randomness and predictable tokens**
Trace reset links, API secrets, session IDs, keys, and challenges to an OS-backed CSPRNG. Check timestamps, counters, seeded general-purpose PRNGs, truncation, biased encoding, low-entropy seeds, and failover on entropy errors. Count entropy after encoding and truncation; a long printed value may contain few unpredictable bits. Token expiry, principal/purpose binding, one-time consumption, and guess limits remain necessary even with secure randomness. Public identifiers are not automatically bearer credentials.

**Nonce and IV misuse**
For AES-GCM and ChaCha20-Poly1305, establish uniqueness per key across workers, restarts, retries, snapshots, and counter wrap. A nonce need not be secret; using the same nonce with a different independent key is not the same defect. Review random-nonce collision budgets against issuance volume and the construction's limits. CTR also requires nonrepeating keystream inputs; CBC IVs require unpredictability and integrity protection. Do not impose a single IV rule on every mode. Prefer library-managed nonce allocation or a reviewed per-key allocation strategy with bounded key usage.

**Unauthenticated ciphertext and context substitution**
Follow modified ciphertext, IVs, tags, and associated data through decryption and use. Prefer AEAD; for legacy encrypt-then-MAC, verify the authenticated envelope before releasing plaintext. Reject invalid tags without parsing or acting on unauthenticated output. Bind tenant, object, purpose, and format version as authenticated context where substitution would cross a boundary, deriving the expected context from trusted state. Encryption alone does not prevent replay; check sequence or one-time state where required. Check padding/error oracles only with bounded dummy inputs and a concrete observable distinction.

## Signing and credential attack classes (subagent_type: `general`)

**Signature and JWT verification confusion**
Find the verification call used before claims authorize an operation. Check `alg=none`, disabled verification, attacker-selected algorithm allowlists, symmetric/asymmetric key confusion, weak HMAC keys, and permissive fallback after verification errors. Bind trusted key material to issuer, algorithm, purpose, and key ID; treat `kid`, `jku`, `x5u`, and embedded keys as untrusted selectors rather than authority. Check required issuer, audience, subject, expiry, not-before, and token-type bindings for the consuming protocol. An otherwise valid token from another context must not gain authority here. Use the web/auth companion for OAuth/OIDC flow and session lifecycle review. See [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) for JWT verification rules.

**Password hashing and verifier migration**
Find every registration, login, reset, import, and legacy fallback. Reject plaintext/reversible password storage and fast general-purpose hashes as password verifiers. Prefer Argon2id with unique library-generated salts and an explicit, benchmarked work policy; distinguish Argon2 variants. OWASP's minimum baseline is 19 MiB memory, two iterations, and parallelism one. For legacy bcrypt, use cost 10 or greater and handle its 72-byte input limit explicitly without silent truncation. Where PBKDF2 is required, use an approved implementation and an explicit PRF/work factor; OWASP lists at least 600,000 iterations for PBKDF2-HMAC-SHA-256. Algorithm choice alone does not establish FIPS compliance. Tune upward for available resources while bounding verification work, store parameters/version with the verifier, and rehash after successful authentication when policy changes. A pepper, if used, belongs separately from the verifier database and requires a recovery/rotation plan. These are baselines, not automatic vulnerability thresholds; tie a finding to exposure and feasible guessing conditions. See the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

**Secret comparison and fail-open verification**
Use maintained verification APIs and constant-time comparison for fixed-length MACs or secret bytes. Trace exceptions, malformed encodings, empty keys, partial comparisons, and fallback branches to the actual acceptance decision. A normal string comparison alone does not prove remotely exploitable timing leakage; establish attacker observations and the secret-dependent signal or retain the exact validation blocker. Authentication failures must not return partial plaintext or authorize a default principal.

## Transport and key-lifecycle attack classes (subagent_type: `general`)

**TLS and certificate validation bypass**
Trace every outbound client, proxy hop, redirect, and mTLS listener. Check disabled verification (`verify=False`, `InsecureSkipVerify`, `rejectUnauthorized: false`), accept-all callbacks, missing hostname checks, unintended trust roots, and fallback to plaintext or obsolete protocols. Chain validation without the expected peer identity is insufficient. Review certificate validity and key usage through the library's validation APIs; SNI alone does not verify identity. For mTLS, distinguish a trusted certificate from authorization for the requested tenant/action. Where pinning exists, check its failure and rotation paths. External termination and deployed trust stores require owner evidence, not a live scan.

**Secret storage and key authority**
Trace generation, provisioning, storage, use, export, logs, crash dumps, backups, and deletion. Establish who can read a secret or invoke a signing/decryption operation; hardcoded production secrets and broadly readable key material can bypass otherwise correct crypto. Prefer scoped secret provisioning and envelope encryption where appropriate, separating data-encryption keys from wrapping keys. KMS/HSM non-exportability does not prevent an overprivileged caller from requesting decryption or signatures. Verify operation, key, tenant, and authenticated encryption-context bindings as well as IAM. Missing KMS/HSM use alone is not a finding. See [OWASP key management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html).

**Key rotation, revocation, and lifecycle drift**
Follow key IDs and versions through issuance, verification, decryption, caches, replicas, backup restore, and rollback. Separate the active writer key from bounded old-key readers; prevent indefinite verification with compromised/revoked signing keys. Historical decryption may legitimately need old keys, subject to access and retention policy. Check re-encryption/rewrapping, stale key caches, revocation propagation, and failure when key services are unavailable. A rotation schedule is not proof of revocation, and absence of periodic rotation alone is not a confirmed boundary violation. Keep unrelated purposes, tenants, and environments separated by keys or an established domain-separated KDF design.

## Vulnerable vs. secure code examples

These Python fragments illustrate individual invariants, not complete authentication or storage systems. Use dummy inputs only; run examples only under the execution controls in `SKILL.md`. Third-party libraries must already be available locally. Include a relevant example in an assignment only when it clarifies the selected class.

**Bearer-token generation**

```python
import random
import secrets

# Vulnerable when used as an authentication/reset credential: predictable PRNG.
weak_token = format(random.getrandbits(256), "064x")

# Secure randomness: 32 random bytes, encoded for transport.
token = secrets.token_urlsafe(32)
```

The consuming flow still binds the token to its user/purpose, expires it, and atomically consumes it when single use is required. See Python's [secrets API](https://docs.python.org/3/library/secrets.html).

**Authenticated decryption and nonce allocation**

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def vulnerable_seal(key, plaintext):
    # Repeated calls under this key reuse the GCM nonce.
    return AESGCM(key).encrypt(b"\x00" * 12, plaintext, None)

def seal(key, plaintext, expected_context, allocate_nonce):
    # Caller supplies a reviewed, persistent allocator unique across all
    # writers for this key; it must fail before wrap or key-use limits.
    nonce = allocate_nonce()
    if len(nonce) != 12:
        raise ValueError("expected a 96-bit GCM nonce")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, expected_context)
    return nonce, ciphertext  # ciphertext includes the authentication tag

def open_sealed(key, nonce, ciphertext, expected_context):
    # InvalidTag propagates: no plaintext is returned on authentication failure.
    return AESGCM(key).decrypt(nonce, ciphertext, expected_context)
```

`key` is securely provisioned; `expected_context` is an unambiguous encoding of trusted tenant/object/purpose metadata, independently reconstructed by the reader. The secure fragment depends on the documented allocator contract; a resetting in-memory counter does not satisfy it. Check the [AEAD library contract](https://cryptography.io/en/latest/hazmat/primitives/aead/).

**JWT verification before authorization**

```python
import jwt

def vulnerable_claims(token):
    return jwt.decode(token, options={"verify_signature": False})

def verified_claims(token, trusted_public_key_pem):
    # Key comes from trusted issuer configuration, never from token headers.
    return jwt.decode(
        token, trusted_public_key_pem, algorithms=["RS256"],
        issuer="https://issuer.example", audience="example-api",
        options={"require": ["exp", "iss", "aud", "sub"]},
    )
```

Use a maintained patched PyJWT version. Verification exceptions deny access; callers must still apply token-purpose policy and subject/resource authorization. Requiring a claim's presence alone does not validate its application meaning. See [PyJWT's decode contract](https://pyjwt.readthedocs.io/en/stable/api.html).

## Universal moves (apply across the above)

- Inventory cryptographic call sites, wrappers, configuration overrides, and legacy paths. Trace one protected value from producer through serialization/storage to its last trusted verification and use.
- Compare altered ciphertext/tag/context, wrong key/algorithm, wrong issuer/audience, expired credentials, and unknown/revoked key IDs against a valid dummy control. Require denial without fallback or partial effects.
- Follow generation and rotation through worker concurrency, restart, retry, and restore. Bound fixtures to a few deterministic dummy operations; a small sample with no collisions does not prove nonce safety.
- Map selected classes to ledger units using exact `CRYPTOGRAPHY-AND-KEY-MANAGEMENT.md#<class name>` references. Include this file's `Core discipline`, `Universal moves`, and `Validation rules`; record excluded blocks and source-backed reasons. Keep related web/auth and cloud boundaries visible without duplicating a single finding.

## Validation rules (apply before reporting ANY finding here)

1. Name the lower-trust principal, protected value, intended cryptographic guarantee, affected owner/resource, and concrete disclosure, forgery, unauthorized acceptance, or identity substitution.
2. Cite the producer, key/parameter source, verifier, failure path, and security-sensitive consumer. Check whether a wrapper or downstream control already enforces the missing invariant.
3. Use complete source evidence and bounded dummy fixtures under the required sandbox. Do not crack real credentials, export secrets, contact external peers, or equate a library warning with an exploited boundary.
4. For a local check, preserve only non-secret inputs and minimal results under the shared artifact rules. Show a valid control and rejection/acceptance of the relevant invalid input; do not claim more than the fixture demonstrates.
5. Return `confirmed` only with the full boundary and meaningful result. Use `needs_validation` with the exact missing key permissions, issuance/restart behavior, runtime version, certificate trust, or deployment fact and a safe owner-observed check. Keep checklist-only hardening separate from findings.
