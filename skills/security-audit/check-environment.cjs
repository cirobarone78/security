const fs = require("node:fs");

const SCOPE = "JSON validator file-reading prerequisites only";
const REQUIREMENT = "non-zero integer";
const FLAG_NAMES = ["O_NOFOLLOW", "O_NONBLOCK"];

function flagType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function inspectFlag(value) {
  return {
    available: Number.isInteger(value) && value !== 0,
    requirement: REQUIREMENT,
    type: flagType(value),
    value: Number.isInteger(value) ? value : null,
  };
}

function inspectEnvironment(options = {}) {
  const constants = options.constants || fs.constants;
  const runtime = {
    nodeVersion: options.nodeVersion || process.version,
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
  };
  const capabilities = {
    O_NOFOLLOW: inspectFlag(constants.O_NOFOLLOW),
    O_NONBLOCK: inspectFlag(constants.O_NONBLOCK),
  };
  const missingCapabilities = FLAG_NAMES.filter((name) => !capabilities[name].available);
  const ok = missingCapabilities.length === 0;

  return {
    schemaVersion: 1,
    ok,
    scope: SCOPE,
    runtime,
    capabilities,
    missingCapabilities,
    conclusion: ok
      ? "The JSON validator CLIs have the required protected file-opening flags."
      : "The JSON validator CLIs cannot run because they refuse to read input without both protected file-opening flags.",
    recommendation: ok
      ? null
      : "Run Node.js in Linux or WSL, where Node.js normally exposes O_NOFOLLOW and O_NONBLOCK.",
    limitation: "This result does not verify the complete audit environment or a security sandbox.",
  };
}

function displayValue(check) {
  if (check.type === "undefined") return "undefined";
  if (check.value !== null) return `${check.value} (${check.type})`;
  return `a value of type ${check.type}`;
}

function formatText(report) {
  const lines = [
    "Validator environment doctor",
    `Node.js: ${report.runtime.nodeVersion}`,
    `OS: ${report.runtime.platform}`,
    `Architecture: ${report.runtime.arch}`,
  ];

  for (const name of FLAG_NAMES) {
    const check = report.capabilities[name];
    const status = check.available ? "PASS" : "FAIL";
    lines.push(`${name}: ${status} (expected ${check.requirement}; got ${displayValue(check)})`);
  }

  lines.push(`${report.ok ? "PASS" : "FAIL"}: ${report.conclusion}`);
  if (report.recommendation) lines.push(`Recommendation: ${report.recommendation}`);
  lines.push(`Scope: ${report.scope}. ${report.limitation}`);
  return `${lines.join("\n")}\n`;
}

function formatHelp() {
  return [
    "Usage: node skills/security-audit/check-environment.cjs [--json | --help]",
    "",
    "Check whether Node.js exposes the protected file-opening flags required by the JSON validators.",
    "",
    "Options:",
    "  --json  Print a stable, machine-readable JSON result.",
    "  --help  Show this help message.",
    "",
  ].join("\n");
}

function main(argv = process.argv.slice(2), options = {}) {
  const writeOut = options.writeOut || ((text) => process.stdout.write(text));
  const writeError = options.writeError || ((text) => process.stderr.write(text));

  if (argv.length === 1 && argv[0] === "--help") {
    writeOut(formatHelp());
    return 0;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--json")) {
    writeError("Invalid arguments. Use --help for usage.\n");
    return 2;
  }

  const report = inspectEnvironment(options.environment);
  if (argv[0] === "--json") {
    writeOut(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    writeOut(formatText(report));
  }
  return report.ok ? 0 : 1;
}

module.exports = {
  FLAG_NAMES,
  SCOPE,
  formatHelp,
  formatText,
  inspectEnvironment,
  main,
};

if (require.main === module) process.exitCode = main();
