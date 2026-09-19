# Cryptography and Key Management Hunting

#### When to use this file

Reach for this file when source uses cryptography to protect data, authenticate messages or peers, generate credentials, store password verifiers, or manage secret keys. Select it for the security boundary, not merely a crypto import or algorithm name. Use it with `ATTACK-CLASSES.md#Cryptography and secrets`.

Pick classes from Phase 1 and split by protected resource, key purpose, and lifecycle. Keep identity flows and claim-to-principal binding in [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md), and workload permissions and effective infrastructure configuration in [CLOUD-AND-DEPLOYMENT.md](CLOUD-AND-DEPLOYMENT.md). Select both companions when the same path crosses those boundaries.

## Core discipline (include in every agent prompt for this domain)

```
- Name the protected property, lower-trust input or observer, key owner, active construction, and consuming operation. Distinguish confidentiality, integrity, authenticity, unpredictability, and password-guessing resistance.
- Trace actual library versions, parameters, defaults, wrappers, and error paths. An algorithm name, missing KMS, or old-looking API is not sufficient evidence.
- Follow key generation or derivation through distribution, use, storage, rotation, revocation, and disposal. Include replicas, restart, restore, migration, and fallback behavior where material.
- Examples are boundary illustrations with stated assumptions, not drop-in protocols. Preserve the assumptions and use maintained cryptographic APIs rather than implementing primitives.
- Validate with source and bounded offline fixtures using dummy keys, passwords, tokens, and certificates under SKILL.md execution controls. Do not use real secrets, online cracking, live TLS probes, or provider calls.
- Return confirmed only for a complete trace and demonstrated security consequence. Keep decisive unknown runtime, key, trust-store, or deployment facts as needs_validation with the exact missing check.
```

## Primitive and construction attack classes (subagent_type: `general`)

**Weak or deprecated algorithms**
Find MD5, SHA-1, DES, RC4, undersized keys, and custom constructions, then identify their actual role. A collision matters when a lower-trust party can substitute content at a digest-based trust decision; it does not automatically break preimage resistance, HMAC, or a non-security checksum. For encryption, show which protected bytes become recoverable or distinguishable under the available observations and key strength. A compatibility decoder is not necessarily an active writer or an authentication bypass.

Example (Python): an upload service treats a caller-provided checksum as proof that content is authentic. The defect is the missing trusted authenticator; replacing MD5 with SHA-256 alone does not fix it. The corrected variant assumes a secret shared only by authorized producers and this verifier, and an expected producer authorized for the destination. Replay and resource binding remain protocol obligations.

```python
# Vulnerable: anyone who changes the content can recompute its checksum.
accepted = hashlib.md5(content).hexdigest() == supplied_checksum

# Corrected: authenticate the exact bytes with a separately provisioned key.
expected = hmac.digest(producer_key, content, "sha256")
accepted = hmac.compare_digest(expected, supplied_mac_bytes)
```

**Insecure randomness and predictable tokens**
Trace password-reset, session, API-key, challenge, and key generation to the entropy source. Review general-purpose PRNGs, timestamp/PID seeds, truncated outputs, biased encodings, deterministic test sources, fork/snapshot state, and failure fallbacks. Count unpredictable bits after formatting. Uniqueness is not unpredictability; a public identifier need not be a secret. A collision-free local sample does not establish secure randomness.

Example (Python): an account-recovery bearer token must resist guessing. The corrected generator supplies 32 random bytes; the application must still bind the token to one account/action, expire it, and consume it once.

```python
# Vulnerable: time determines the credential.
token = hashlib.sha256(str(time.time_ns()).encode()).hexdigest()

# Corrected: use the operating-system-backed security API; fail on errors.
token = secrets.token_urlsafe(32)
```

**Nonce and IV reuse**
Identify the construction's requirement: AES-GCM and ordinary ChaCha20-Poly1305 require nonce uniqueness per key; CBC requires an unpredictable IV; CTR must not repeat a counter block under the same key. An IV need not be secret. Trace allocation across threads, processes, retries, rollback, reboot, and restored snapshots; key-ID changes do not prove key-byte changes. Random nonces require a collision budget and per-key usage limit, not merely a CSPRNG. Check the pinned construction's size and message limits. See [RFC 5116, section 3.1](https://www.rfc-editor.org/rfc/rfc5116.html#section-3.1).

Example (pseudocode): several workers encrypt using one persistent AES-GCM key. The corrected allocator atomically reserves a never-reissued 96-bit value for that actual key across all workers, persists reservations before encryption, cannot roll back with application backups, and fails closed on exhaustion or unavailable state. If those guarantees cannot be established, this is not a demonstrated fix.

```text
# Vulnerable after every restart, or concurrently in different workers.
nonce = encode96(process_local_counter++)
ciphertext_and_tag = AES_GCM.seal(key, nonce, plaintext, aad)

# Corrected under the allocator guarantees above; never reclaim a reservation.
nonce = durable_allocator.reserve_unique96(key_version)
ciphertext_and_tag = AES_GCM.seal(key, nonce, plaintext, aad)
```

**Unauthenticated encryption and verification failure**
Review ECB pattern disclosure, CBC/CTR without authentication, ignored or truncated tags, plaintext consumed before final verification, distinguishable padding failures, and exception paths that accept plaintext or retry without crypto. Trace who can alter ciphertext and what trusted operation consumes the result. Bind metadata such as object identity and format version when the application relies on it. Prefer a maintained authenticated-encryption construction; inspect both encryption and decryption. See [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

Example (pseudocode): a lower-trust store can replace an encrypted object. The corrected AES-GCM writer uses a unique 96-bit nonce per key and a full 128-bit tag. `open` returns plaintext only after authentication succeeds; failure stops processing. Both sides encode the same unambiguous context, and the reader obtains expected tenant/object IDs from the authorized lookup, not the envelope. AEAD does not by itself prevent replay of an older valid object.

```text
# Vulnerable: decrypted bytes influence a trusted action without authentication.
apply(parse(AES_CTR.decrypt(key, envelope.iv, envelope.ciphertext)))

# Corrected writer and reader, with the nonce discipline described above.
aad = encode_fields("object-v1", expected_tenant, expected_object)
envelope = (nonce, AES_GCM.seal(key, nonce, plaintext, aad))
plaintext = AES_GCM.open(key, envelope.nonce, envelope.ciphertext_and_tag, aad)
apply(parse(plaintext))  # Unreachable on authentication failure.
```

**Key derivation and purpose separation**
Check password-derived encryption keys, raw hashes used as KDFs, insufficient salts/work factors, and reuse of one key for encryption, authentication, tenants, or environments. Determine whether one permitted operation enables another purpose or reveals a related key. HKDF derives purpose-specific keys from strong key material; it does not make a weak password resistant to guessing. Use an appropriate password KDF for passwords and a maintained key-derivation API for high-entropy input. See [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html).

Example (pseudocode): download links and password-reset tokens otherwise authenticate identical message formats. A download signing capability must not authorize resets. The corrected design derives keys from a high-entropy root with distinct, unambiguous purpose labels; each endpoint fixes its own label and message schema. Distinct labels do not isolate a caller that already has the root key.

```text
# Vulnerable: a tag issued for a download also verifies as a reset tag.
download_key = reset_key = root_key

# Corrected: separate domains through the maintained HKDF-SHA-256 API.
download_key = HKDF_SHA256(root_key, deployment_salt, "download-v1", 32)
reset_key = HKDF_SHA256(root_key, deployment_salt, "password-reset-v1", 32)
```

## Credential and transport attack classes (subagent_type: `general`)

**JWT algorithm and key selection**
At a boundary requiring a signed JWT, check acceptance of `alg=none`, decode-only paths, RSA/HMAC confusion, weak symmetric secrets, and caller-selected keys. Pin permitted algorithms and compatible key types to the server's token profile. Treat `kid` as a selector inside an issuer-bound trusted key set, not an arbitrary file/query; do not trust token-supplied `jku`, `x5u`, or embedded keys as authority. Verify all required cryptographic layers of nested tokens and stop on verification failure. See [RFC 8725, sections 3.1–3.5](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.1).

Example (pseudocode): this service accepts signed access tokens from one configured issuer. The vulnerable verifier permits both symmetric and asymmetric interpretations of public key bytes; confirm actual library/version behavior before claiming exploitation. The corrected verifier binds RSA keys to RS256 and requires signature, issuer, audience, and time checks before exposing claims. Key retrieval uses configured trust, never a token-provided URL. Also select `WEB-PROTOCOL-AND-AUTH.md#JWT verification and claim binding` for token type, claim, and principal binding.

```text
# Vulnerable in a verifier that allows a public key to become an HMAC secret.
claims = verify(token, public_key_bytes, algorithms=["RS256", "HS256"])

# Corrected under the token profile above; any failed check rejects the token.
claims = verify_signed_jwt(token,
    keys=issuer_bound_RSA_keys, algorithms=["RS256"],
    issuer=configured_issuer, audience=this_service,
    require=["iss", "aud", "exp"], validate_exp=true, validate_nbf_if_present=true)
principal = bind_verified_access_token(claims)
```

**Password hashing and migration**
Trace registration, verification, reset, import, and rehash. Look for plaintext/reversible local verifiers, fast hashes, shared salts, silent truncation, and parameters overridden by legacy records. Review Argon2id memory/time/parallelism, bcrypt cost and its 72-byte input limit, and PBKDF2 PRF/iterations. Benchmark bounded representative work; do not infer practical cracking cost from the algorithm name alone. Keep password KDFs distinct from HKDF and high-entropy API-token hashing.

[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) gives an Argon2id baseline of 19 MiB, two iterations, and parallelism one; legacy bcrypt cost at least 10; and PBKDF2-HMAC-SHA-256 at least 600,000 iterations where FIPS requirements apply. FIPS compliance also depends on the implementation. Verify guidance and runtime capacity before recommending parameters. Use a fresh salt per password, store algorithm/version/cost with the verifier, and keep any pepper separately protected. Missing a pepper alone is not a finding.

Example (pseudocode): an authentication database stores unsalted SHA-256 password verifiers. The corrected password API generates a fresh salt and returns a self-describing Argon2id record. Successful legacy verification can trigger atomic replacement using the entered password; never treat an old hash as the user's password. Bound accepted record parameters and password input sizes. Preserve legacy input semantics during verification, avoid bcrypt truncation in new records, and require resets when safe migration is impossible. A pepper change may require password resets.

```text
# Vulnerable: cheap offline guessing against every exposed verifier.
record = SHA256(password_bytes)

# Corrected: library-managed salt and encoded parameters, calibrated for capacity.
record = password_api.hash_argon2id(password_bytes, memory_kib=19456,
                                  iterations=2, parallelism=1)
authenticated = password_api.verify(record, submitted_password_bytes)
```

**TLS and certificate validation**
Locate the active TLS client/server and final context after wrappers, environment overrides, proxies, and reconnects. Review disabled chain validation, missing destination hostname/IP checks, overbroad custom trust callbacks, certificate validity and intended usage, obsolete negotiated protocol/cipher choices, and HTTP fallback. A valid signature or chain alone does not authenticate the intended destination; sending SNI alone is not hostname verification. Do not infer the deployed trust store, protocol negotiation, or revocation policy from unused defaults. See [RFC 9525](https://www.rfc-editor.org/rfc/rfc9525.html).

Example (Python): a client sends credentials to a fixed service. The corrected context uses the configured trust roots and validates the expected DNS name. A private CA may be configured explicitly without disabling identity checks. This requires the shown context to be the one actually used; no error handler may retry insecurely. For client-certificate-to-principal mapping, also select `WEB-PROTOCOL-AND-AUTH.md#mTLS peer and application-identity confusion`.

```python
# Vulnerable: an untrusted certificate can authenticate the destination.
context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE

# Corrected: validate the chain and the independently configured destination.
context = ssl.create_default_context()
tls_socket = context.wrap_socket(sock, server_hostname="api.example.com")
```

## Secret and key lifecycle attack classes (subagent_type: `general`)

**Secret storage and KMS or HSM boundaries**
Follow hardcoded/default keys, repositories and history, config files, environment, logs, crash dumps, client bundles, backups, and export/debug paths to an actual lower-trust reader. Distinguish public keys, key IDs, wrapped data keys, and dummy fixtures from usable secrets. For envelope encryption, identify the data-encryption key (DEK), wrapping key (KEK), access to each, and authenticated resource context. For KMS/HSM, inspect key selection, permitted operations, exportability, returned plaintext, and fail-open local substitutes. Hardware protection does not prevent an authorized API caller from misusing decrypt/sign authority. No KMS/HSM is not itself a vulnerability; cloud IAM and attachment review belongs in `CLOUD-AND-DEPLOYMENT.md`.

Example (pseudocode): a database reader must not decrypt protected records. Storing a raw DEK alongside ciphertext defeats that boundary. The corrected envelope assumes separate, restricted KEK authority and a trusted tenant/object context checked on unwrap and AEAD open. A database-only reader cannot unwrap; if that reader also has decrypt authority, the claimed separation does not hold. Do not log or persist plaintext DEKs.

```text
# Vulnerable: the same database read returns everything needed for decryption.
db.store(ciphertext_and_tag, nonce, plaintext_DEK)

# Corrected: only a wrapped DEK accompanies the encrypted object.
context = encode_fields("object-v1", authorized_tenant, authorized_object)
wrapped_DEK = key_service.wrap(configured_KEK, plaintext_DEK, context)
db.store(ciphertext_and_tag, nonce, wrapped_DEK, configured_KEK_version)
```

**Rotation, revocation, and key disposal**
Separate active signing/encryption from permitted legacy verification/decryption. Trace versioned selection, caches, rollout overlap, compromised-key denial, token lifetime, backup restore, and retirement. Changing an alias or wrapping key does not automatically re-encrypt data, rotate a DEK, or invalidate existing credentials. Legitimate decrypt-only retention is not failed revocation; continued authorization by a revoked signing key is a different property. Review removal from process caches, replicas, exports, and backups; do not promise memory zeroization that the runtime cannot provide. Confirm crypto-erasure only when all recoverable key copies within the claimed boundary are gone.

Example (pseudocode): a signer is marked compromised, so its old tokens must stop authorizing requests. The vulnerable path tries every historical key. The corrected lookup requires the token-purpose-specific allowed state, and revocation overrides any planned verification grace period. Cache invalidation and all consumers must obey that state; unavailable policy cannot silently reuse a revoked key. Use dummy keys and a local state transition to validate this.

```text
# Vulnerable: historical keys remain authorization authorities indefinitely.
accepted = any(verify(token, key) for key in all_historical_signing_keys)

# Corrected: resolve only within the configured issuer and purpose.
key = key_registry.lookup(configured_issuer, "access-token", untrusted_kid)
require(key is present and key.state in ["active", "verify-only"])
require(not key.revoked and now < key.verification_deadline)
accepted = verify_with_pinned_algorithm(token, key)
```

## Universal moves (apply across the above)

- Build a source-backed inventory of protected data, primitive/mode, parameters, library/version, key purpose and owner, generation/derivation, storage, consumers, rotation, revocation, and disposal. Keep unknown deployment facts explicit.
- Walk generate → distribute → store → use → rotate → revoke → dispose, including backups and derived copies. Compare normal, error, concurrent, restart, restore, and migration paths for the same actual key bytes.
- Trace exact authenticated bytes and context through encoding, normalization, verification, parsing, and consumption. Check constant-time secret/MAC comparison and timing or error oracles only where an observer and feasible secret-dependent distinction exist; an ordinary public-value comparison is not a finding.
- Pair a valid dummy fixture with a changed tag, wrong context/key/purpose, disallowed algorithm, wrong certificate identity, or revoked key as applicable. A working round trip alone does not prove rejection behavior. Do not build exploit chains or perform large brute-force/timing campaigns.

## Validation rules (apply before reporting ANY finding here)

1. Cite the active source path, library/version/configuration, lower-trust capability, missing property, and protected operation. Confirm a meaningful disclosure, forgery, unauthorized acceptance, or loss of the claimed protection; a checklist deviation is insufficient.
2. For randomness and nonce claims, establish the seed/state or allocation defect and per-key scope, including applicable concurrency/restart assumptions. Bounded repetition may demonstrate failure; absence of repetition does not prove security.
3. For encryption, MAC, JWT, and TLS claims, show where invalid bytes, context, algorithm, key, or peer are accepted and subsequently trusted. Inspect rejection paths and library defaults; do not assume an API accepts a malformed fixture.
4. For password claims, record the actual verifier format, salt, cost, input handling, and exposure model. Keep cracking demonstrations limited to synthetic passwords and bounded offline work. Migration advice must preserve verification semantics and avoid silent downgrade.
5. For secrets and lifecycle claims, name who can recover or use which key, the resulting authority, and the failed storage/rotation/revocation boundary. Use redacted source references and dummy values; never retain real keys in evidence.
6. Return `needs_validation` when a decisive effective config, key state, entropy implementation, trust store, KMS/HSM policy, cache, or restore behavior is unavailable. State the exact owner-observed fact or safe local check needed; lower severity is not a substitute for resolving uncertainty. Reject hypotheses whose trace is defeated by an effective control or lacks a security consequence.
