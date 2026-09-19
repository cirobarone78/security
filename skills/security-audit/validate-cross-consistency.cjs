#!/usr/bin/env node

/**
 * Cross-validates findings.json against coverage-ledger.json.
 * Usage: node validate-cross-consistency.cjs <findings.json> <coverage-ledger.json>
 *
 * Each standalone validator proves one file's internal structure and state
 * machine. This script proves the pairing between them, which the workflow
 * relies on but neither standalone validator can see:
 *
 * - Every record in findings.json must trace to a coverage unit that actually
 *   validated it. The ledger keeps validated candidates in `candidate` units
 *   whose `result_fingerprints` hold the candidate fingerprints (SKILL.md
 *   Phase 3/4). A record whose fingerprint matches no candidate unit — or
 *   matches only units that never produced a validated record (planned,
 *   blocked, deferred, covered, ...) — breaks the run's own audit trail.
 * - The fingerprint format is enforced identically in both validators, so the
 *   two files can actually be joined on it.
 *
 * Run this after Phase 3 has moved validated units to `candidate` and before
 * Phase 5 final dispositions clear `result_fingerprints` from the ledger.
 */

const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const findingsValidator = require("./validate-findings.cjs");
const ledgerValidator = require("./validate-coverage-ledger.cjs");

const LIMITS = Object.freeze({
  inputBytes: 5 * 1024 * 1024,
  validationErrors: 100,
});
// The only ledger state that may hold result_fingerprints (see
// validate-coverage-ledger.cjs state invariants).
const VALIDATED_LEDGER_STATUSES = new Set(["candidate"]);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

class CrossConsistencyError extends Error {}

function escapeUnsafeDiagnosticCharacters(value) {
  return String(value).replace(
    findingsValidator.UNSAFE_DIAGNOSTIC_CHARACTER,
    (character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 0xffff
        ? `\\u${codePoint.toString(16).padStart(4, "0")}`
        : `\\u{${codePoint.toString(16)}}`;
    }
  );
}

function safeQuote(value) {
  let serialized;
  if (typeof value === "string") {
    const clipped = value.length > 256
      ? `${value.slice(0, 256)}...`
      : value;
    serialized = JSON.stringify(clipped);
  } else if (value === null || typeof value === "boolean") {
    serialized = String(value);
  } else if (typeof value === "number" && Number.isFinite(value)) {
    serialized = String(value);
  } else {
    serialized = `"<${Array.isArray(value) ? "array" : typeof value}>"`;
  }
  return escapeUnsafeDiagnosticCharacters(serialized);
}

function createErrorList() {
  const errors = [];
  Object.defineProperty(errors, "push", {
    value(...messages) {
      const remaining = LIMITS.validationErrors - this.length;
      if (remaining > 0) {
        Array.prototype.push.apply(this, messages.slice(0, remaining).map(escapeUnsafeDiagnosticCharacters));
      }
      return this.length;
    },
  });
  return errors;
}

function readFileWithinLimit(file) {
  const noFollow = fs.constants.O_NOFOLLOW;
  const nonBlock = fs.constants.O_NONBLOCK;
  if (!Number.isInteger(noFollow) || noFollow === 0 || !Number.isInteger(nonBlock) || nonBlock === 0) {
    throw new CrossConsistencyError("OS no-follow and nonblocking input protection is unavailable");
  }

  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow | nonBlock);
  } catch (error) {
    if (error && (error.code === "ELOOP" || error.code === "EMLINK")) {
      throw new CrossConsistencyError("input must not be a symlink");
    }
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new CrossConsistencyError("input must be a regular file");
    if (stat.size > LIMITS.inputBytes) {
      throw new CrossConsistencyError(`input exceeds ${LIMITS.inputBytes} byte limit`);
    }

    const chunks = [];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytesRead = 0;
    while (true) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytesRead += count;
      if (bytesRead > LIMITS.inputBytes) {
        throw new CrossConsistencyError(`input exceeds ${LIMITS.inputBytes} byte limit`);
      }
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    try {
      return UTF8_DECODER.decode(Buffer.concat(chunks, bytesRead));
    } catch {
      throw new CrossConsistencyError("input is not valid UTF-8");
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseJson(file, label) {
  let contents;
  try {
    contents = readFileWithinLimit(file);
  } catch (error) {
    const reason = error instanceof CrossConsistencyError ? error.message : "input could not be opened or read safely";
    throw new CrossConsistencyError(`${label}: ${reason}`);
  }
  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new CrossConsistencyError(`${label}: invalid JSON syntax`);
  }
  return value;
}

/**
 * Index the ledger by fingerprint. Each fingerprint maps to the list of
 * (index, status) pairs of units that claim it in result_fingerprints.
 */
function indexLedgerFingerprints(ledger) {
  const byFingerprint = new Map();
  if (!Array.isArray(ledger)) return byFingerprint;
  for (let index = 0; index < ledger.length; index++) {
    const unit = ledger[index];
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) continue;
    if (!Array.isArray(unit.result_fingerprints)) continue;
    for (const fingerprint of unit.result_fingerprints) {
      if (typeof fingerprint !== "string") continue;
      if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, []);
      byFingerprint.get(fingerprint).push({ index, status: unit.status });
    }
  }
  return byFingerprint;
}

function validateCrossConsistency(findings, ledger, schema) {
  const errors = createErrorList();

  const standaloneFindingsErrors = findingsValidator.validateDocument(findings, schema);
  if (standaloneFindingsErrors.length > 0) {
    errors.push(`findings: standalone validation failed with ${standaloneFindingsErrors.length} error(s); run validate-findings.cjs first`);
    return errors;
  }
  const standaloneLedgerErrors = ledgerValidator.validateDocument(ledger);
  if (standaloneLedgerErrors.length > 0) {
    errors.push(`ledger: standalone validation failed with ${standaloneLedgerErrors.length} error(s); run validate-coverage-ledger.cjs first`);
    return errors;
  }

  const byFingerprint = indexLedgerFingerprints(ledger);

  if (!Array.isArray(findings)) return errors;
  for (let index = 0; index < findings.length && errors.length < LIMITS.validationErrors; index++) {
    const finding = findings[index];
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) continue;
    const fingerprint = finding.fingerprint;
    const base = `$[${index}]`;
    if (typeof fingerprint !== "string" || fingerprint.length === 0) {
      // The standalone validator reports malformed fingerprints; skip here.
      continue;
    }
    const units = byFingerprint.get(fingerprint);
    if (!units || units.length === 0) {
      errors.push(`${base}.fingerprint: ${safeQuote(fingerprint)} has no matching candidate unit in the ledger`);
      continue;
    }
    const validated = units.filter(({ status }) => VALIDATED_LEDGER_STATUSES.has(status));
    if (validated.length === 0) {
      const states = units.map(({ index: unitIndex, status }) => `$[${unitIndex}].status=${safeQuote(status)}`).join(", ");
      errors.push(
        `${base}.fingerprint: ${safeQuote(fingerprint)} belongs only to units that did not validate it (${states}); ` +
        `a finding requires a candidate unit`
      );
    }
  }

  return errors;
}

function run(findingsPath, ledgerPath) {
  if (!findingsPath || !ledgerPath) {
    console.error("Usage: node validate-cross-consistency.cjs <findings.json> <coverage-ledger.json>");
    return 1;
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(path.join(__dirname, "report-schema.json"), "utf8"));
  } catch (error) {
    console.error("Failed to load report-schema.json:", error.message);
    return 1;
  }

  let findings;
  let ledger;
  try {
    findings = parseJson(findingsPath, "findings");
    ledger = parseJson(ledgerPath, "ledger");
  } catch (error) {
    console.error("Failed to read input:", error.message);
    return 1;
  }

  let errors;
  try {
    errors = validateCrossConsistency(findings, ledger, schema);
  } catch {
    console.error("Failed to cross-validate inputs: unexpected validation error");
    return 1;
  }
  for (const message of errors) console.error("ERROR:", message);
  if (errors.length > 0) {
    const cap = errors.length === LIMITS.validationErrors ? `; output capped at ${LIMITS.validationErrors}` : "";
    console.error(`FAIL: ${errors.length} cross-consistency error(s)${cap}`);
    return 1;
  }
  const findingCount = Array.isArray(findings) ? findings.length : 0;
  const unitCount = Array.isArray(ledger) ? ledger.length : 0;
  console.log(`PASS: ${findingCount} finding(s) consistent with ${unitCount} coverage unit(s)`);
  return 0;
}

module.exports = {
  LIMITS,
  VALIDATED_LEDGER_STATUSES,
  indexLedgerFingerprints,
  validateCrossConsistency,
};

if (require.main === module) process.exit(run(process.argv[2], process.argv[3]));
