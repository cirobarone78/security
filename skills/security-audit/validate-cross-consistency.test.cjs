const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const schema = require("./report-schema.json");
const {
  FINGERPRINT_PATTERN,
  validateDocument,
} = require("./validate-findings.cjs");
const {
  canonicalCoverageId,
} = require("./validate-coverage-ledger.cjs");
const {
  indexLedgerFingerprints,
  validateCrossConsistency,
} = require("./validate-cross-consistency.cjs");

const validatorPath = path.join(__dirname, "validate-cross-consistency.cjs");
const CLI_TIMEOUT_MS = 5000;
const HAS_SAFE_INPUT_OPEN = Number.isInteger(fs.constants.O_NOFOLLOW) &&
  fs.constants.O_NOFOLLOW !== 0 &&
  Number.isInteger(fs.constants.O_NONBLOCK) &&
  fs.constants.O_NONBLOCK !== 0;

function source(kind = "entrypoint", file = "src/handler.c", line = 10) {
  return { kind, file, line, scope: "handle", description: "Attacker data reaches the operation." };
}

function evidence(file = "src/handler.c", line = 10) {
  return { file, line, description: "The source performs the operation without the required check." };
}

function confirmed(fingerprint = "src-handler-missing-check") {
  return {
    verdict: "confirmed",
    fingerprint,
    title: "Missing ownership check",
    description: "An attacker can reach an operation without the intended ownership check.",
    root_cause: "handle omits the ownership check before changing the object.",
    intended_behavior: "Only the object's owner can change it.",
    trace: [source("entrypoint"), source("propagation", "src/model.c", 20), source("sink", "src/store.c", 30)],
    evidence: [evidence()],
    conditions: [],
    execution: {
      attacker_perspective: "An unprivileged remote user with their own account.",
      payloads: ["An object identifier owned by another user."],
      instructions: ["Submit the identifier through the public operation."],
      observed_result: "The other user's object changes.",
    },
    remediation: { strategy: "Check ownership before the state change." },
    severity: {
      likelihood: { score: "medium", reason: "The operation is directly reachable." },
      impact: { score: "medium", reason: "The attacker changes one protected object." },
      overall_severity: "medium",
    },
    confidence: { score: "high", reason: "The source path and result were reproduced." },
  };
}

function candidateUnit(fingerprints, overrides = {}) {
  const canonicalRefs = {
    surface: "src/router.ts#POST /users/:id",
    boundary: "src/authz.ts#requireOwner",
    subsystem: "packages/api",
    attack_class: "ATTACK-CLASSES.md#Access control",
  };
  const value = {
    coverage_id: canonicalCoverageId(canonicalRefs),
    canonical_refs: canonicalRefs,
    surface: "Update-user route",
    boundary: "Object ownership",
    subsystem: "API",
    attack_class: "Access control",
    starting_paths: ["src/router.ts", "src/authz.ts"],
    ordinary_attack_class_block: "ATTACK-CLASSES.md#Access control",
    selected_companion_blocks: [],
    excluded_blocks: [],
    prior_status: "new",
    attempts: [],
    wave: 1,
    status: "candidate",
    agent_id: "hunter-1",
    reviewed_paths: ["src/router.ts"],
    local_checks: [{
      agent_id: "hunter-1",
      reviewed_paths: ["src/router.ts"],
      invariant: "The route checks object ownership.",
      method: "source",
      result: "The owner check applies before the update.",
      artifact: null,
    }],
    result_fingerprints: fingerprints,
    unresolved: [],
  };
  return Object.assign(value, overrides);
}

function errorsFor(findings, ledger) {
  return validateCrossConsistency(findings, ledger, schema);
}

function runCli(findingsContents, ledgerContents, options = {}) {
  const { nodeArgs = [], timeout = CLI_TIMEOUT_MS } = options;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "validate-cross-consistency-"));
  const findingsPath = path.join(directory, "findings.json");
  const ledgerPath = path.join(directory, "coverage-ledger.json");
  try {
    fs.writeFileSync(findingsPath, findingsContents);
    fs.writeFileSync(ledgerPath, ledgerContents);
    return spawnSync(process.execPath, [...nodeArgs, validatorPath, findingsPath, ledgerPath], {
      encoding: "utf8",
      timeout,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function cliOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

test("accepts findings whose fingerprints trace to candidate units", () => {
  const findings = [confirmed()];
  const ledger = [candidateUnit(["src-handler-missing-check"])];
  assert.deepEqual(errorsFor(findings, ledger), []);
});

test("accepts empty findings and an empty ledger", () => {
  assert.deepEqual(errorsFor([], []), []);
  assert.deepEqual(errorsFor([], [candidateUnit(["src-handler-missing-check"])]), []);
});

test("accepts when a candidate unit's extra fingerprints have no finding", () => {
  // The check is one-directional: a validated candidate may be dropped from
  // the report for budget or scope reasons, but a reported record must be
  // backed by a validated candidate.
  const findings = [confirmed("src-handler-missing-check")];
  const ledger = [candidateUnit(["src-handler-missing-check", "src-parser-size-hypothesis"])];
  assert.deepEqual(errorsFor(findings, ledger), []);
});

test("rejects an orphan finding fingerprint with no matching ledger unit", () => {
  const findings = [confirmed("src-handler-missing-check")];
  const ledger = [candidateUnit(["src-parser-size-hypothesis"])];
  const errors = errorsFor(findings, ledger);
  assert(errors.some((error) => error.includes("no matching candidate unit")));
});

test("rejects a finding whose fingerprint matches a non-candidate unit", () => {
  const findings = [confirmed("src-handler-missing-check")];
  const ledger = [candidateUnit([], {
    status: "planned",
    agent_id: null,
    reviewed_paths: [],
    local_checks: [],
    result_fingerprints: [],
    unresolved: [],
  })];
  const errors = errorsFor(findings, ledger);
  assert(errors.some((error) => error.includes("no matching candidate unit")));
});

test("reports standalone findings validation failures first", () => {
  const findings = [confirmed()];
  delete findings[0].root_cause; // schema requires root_cause for confirmed
  const ledger = [candidateUnit(["src-handler-missing-check"])];
  const errors = errorsFor(findings, ledger);
  assert(errors.some((error) => error.includes("standalone validation failed")));
});

test("reports standalone ledger validation failures first", () => {
  const findings = [confirmed()];
  const ledger = [candidateUnit(["src-handler-missing-check"], { status: "covered", agent_id: null })];
  const errors = errorsFor(findings, ledger);
  assert(errors.some((error) => error.includes("standalone validation failed")));
});

test("rejects a finding whose fingerprint is invalid per the shared pattern", () => {
  const invalid = confirmed("bad fingerprint with spaces");
  assert.equal(false, FINGERPRINT_PATTERN.test(invalid.fingerprint));
  const errors = validateDocument([invalid], schema);
  assert(errors.some((error) => error.includes("invalid fingerprint")));
});

test("indexes ledger fingerprints only from candidate units", () => {
  const ledger = [
    candidateUnit(["src-handler-missing-check"]),
    candidateUnit([], { status: "covered", result_fingerprints: [] }),
    candidateUnit([], { status: "planned", result_fingerprints: [] }),
  ];
  const byFingerprint = indexLedgerFingerprints(ledger);
  assert.deepEqual(Array.from(byFingerprint.keys()), ["src-handler-missing-check"]);
});

test("passes through the CLI", { skip: !HAS_SAFE_INPUT_OPEN }, () => {
  const findings = JSON.stringify([confirmed()]);
  const ledger = JSON.stringify([candidateUnit(["src-handler-missing-check"])]);
  const result = runCli(findings, ledger);
  assert.equal(result.status, 0, cliOutput(result));
  assert.match(result.stdout, /PASS: 1 finding\(s\) consistent with 1 coverage unit\(s\)/);
});

test("fails through the CLI on an orphan fingerprint", { skip: !HAS_SAFE_INPUT_OPEN }, () => {
  const findings = JSON.stringify([confirmed()]);
  const ledger = JSON.stringify([candidateUnit(["src-parser-size-hypothesis"])]);
  const result = runCli(findings, ledger);
  assert.notEqual(result.status, 0);
  assert.match(cliOutput(result), /no matching candidate unit/);
});

test("fails through the CLI when inputs are not valid UTF-8", { skip: !HAS_SAFE_INPUT_OPEN }, () => {
  const findings = JSON.stringify([confirmed()]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "validate-cross-consistency-"));
  const findingsPath = path.join(directory, "findings.json");
  const ledgerPath = path.join(directory, "coverage-ledger.json");
  try {
    fs.writeFileSync(findingsPath, findings);
    fs.writeFileSync(ledgerPath, Buffer.from([0xff, 0xfe, 0xfd]));
    const result = spawnSync(process.execPath, [validatorPath, findingsPath, ledgerPath], {
      encoding: "utf8",
      timeout: CLI_TIMEOUT_MS,
    });
    assert.notEqual(result.status, 0);
    assert.match(cliOutput(result), /not valid UTF-8/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("prints usage when arguments are missing", () => {
  const emptyRun = spawnSync(process.execPath, [validatorPath], {
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
  });
  assert.notEqual(emptyRun.status, 0);
  assert.match(cliOutput(emptyRun), /Usage: node validate-cross-consistency\.cjs/);
});
