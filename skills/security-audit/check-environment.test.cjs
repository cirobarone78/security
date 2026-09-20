const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  inspectEnvironment,
  main,
} = require("./check-environment.cjs");

const doctorPath = path.join(__dirname, "check-environment.cjs");
const CLI_TIMEOUT_MS = 5000;
const TEST_RUNTIME = {
  nodeVersion: "v-test",
  platform: "test-os",
  arch: "test-arch",
};

function runMain(argv, constants) {
  let stdout = "";
  let stderr = "";
  const status = main(argv, {
    environment: { ...TEST_RUNTIME, constants },
    writeOut(text) { stdout += text; },
    writeError(text) { stderr += text; },
  });
  return { status, stdout, stderr };
}

function runCli(args = []) {
  return spawnSync(process.execPath, [doctorPath, ...args], {
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
  });
}

function cliOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

test("reports both required capabilities as available", () => {
  const report = inspectEnvironment({
    ...TEST_RUNTIME,
    constants: { O_NOFOLLOW: 131072, O_NONBLOCK: 2048 },
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.missingCapabilities, []);
  assert.deepEqual(report.runtime, TEST_RUNTIME);
  assert.deepEqual(report.capabilities.O_NOFOLLOW, {
    available: true,
    requirement: "non-zero integer",
    type: "number",
    value: 131072,
  });
  assert.equal(report.recommendation, null);
});

const invalidCases = [
  ["O_NOFOLLOW is missing", { O_NONBLOCK: 2048 }, "O_NOFOLLOW", "undefined"],
  ["O_NONBLOCK is missing", { O_NOFOLLOW: 131072 }, "O_NONBLOCK", "undefined"],
  ["O_NOFOLLOW is zero", { O_NOFOLLOW: 0, O_NONBLOCK: 2048 }, "O_NOFOLLOW", "number"],
  ["O_NONBLOCK is zero", { O_NOFOLLOW: 131072, O_NONBLOCK: 0 }, "O_NONBLOCK", "number"],
  ["O_NOFOLLOW has the wrong type", { O_NOFOLLOW: "131072", O_NONBLOCK: 2048 }, "O_NOFOLLOW", "string"],
  ["O_NONBLOCK has the wrong type", { O_NOFOLLOW: 131072, O_NONBLOCK: {} }, "O_NONBLOCK", "object"],
];

for (const [name, constants, missingName, expectedType] of invalidCases) {
  test(`fails when ${name}`, () => {
    const report = inspectEnvironment({ ...TEST_RUNTIME, constants });
    assert.equal(report.ok, false);
    assert.deepEqual(report.missingCapabilities, [missingName]);
    assert.equal(report.capabilities[missingName].available, false);
    assert.equal(report.capabilities[missingName].type, expectedType);
    assert.match(report.conclusion, /cannot run because they refuse to read input/);
    assert.match(report.recommendation, /Linux or WSL/);
  });
}

test("text output reports runtime, checks, scope, and a passing exit code", () => {
  const result = runMain([], { O_NOFOLLOW: 1, O_NONBLOCK: 2 });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Node\.js: v-test/);
  assert.match(result.stdout, /OS: test-os/);
  assert.match(result.stdout, /Architecture: test-arch/);
  assert.match(result.stdout, /O_NOFOLLOW: PASS/);
  assert.match(result.stdout, /O_NONBLOCK: PASS/);
  assert.match(result.stdout, /does not verify the complete audit environment or a security sandbox/);
});

test("text output explains missing capabilities and exits 1", () => {
  const result = runMain([], { O_NOFOLLOW: 1 });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /O_NONBLOCK: FAIL/);
  assert.match(result.stdout, /cannot run because they refuse to read input/);
  assert.match(result.stdout, /Run Node\.js in Linux or WSL/);
});

test("JSON output is stable, parseable, and uses the check result as its exit code", () => {
  const first = runMain(["--json"], { O_NOFOLLOW: 1, O_NONBLOCK: 2 });
  const second = runMain(["--json"], { O_NOFOLLOW: 1, O_NONBLOCK: 2 });
  assert.equal(first.status, 0);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stderr, "");
  const parsed = JSON.parse(first.stdout);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.scope, "JSON validator file-reading prerequisites only");
  assert.deepEqual(parsed.missingCapabilities, []);

  const failed = runMain(["--json"], { O_NOFOLLOW: 1, O_NONBLOCK: 0 });
  assert.equal(failed.status, 1);
  assert.deepEqual(JSON.parse(failed.stdout).missingCapabilities, ["O_NONBLOCK"]);
});

test("help exits 0 without running the check", () => {
  const result = runMain(["--help"], {});
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Usage:/);
  assert.match(result.stdout, /--json/);
  assert.match(result.stdout, /--help/);
});

test("invalid arguments exit 2 and write only to stderr", () => {
  for (const args of [["--unknown"], ["--json", "extra"], ["--help", "--json"]]) {
    const result = runMain(args, { O_NOFOLLOW: 1, O_NONBLOCK: 2 });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Invalid arguments/);
  }
});

test("real CLI text invocation reflects the current platform", () => {
  const expected = inspectEnvironment();
  const result = runCli();
  assert.equal(result.error, undefined, cliOutput(result));
  assert.equal(result.status, expected.ok ? 0 : 1, cliOutput(result));
  assert.match(result.stdout, new RegExp(`Node\\.js: ${process.version.replaceAll(".", "\\.")}`));
  assert.match(result.stdout, new RegExp(`OS: ${process.platform}`));
  assert.match(result.stdout, new RegExp(`Architecture: ${process.arch}`));
});

test("real CLI JSON, help, and invalid-argument invocations use documented exit codes", () => {
  const expected = inspectEnvironment();
  const jsonResult = runCli(["--json"]);
  assert.equal(jsonResult.status, expected.ok ? 0 : 1, cliOutput(jsonResult));
  assert.deepEqual(JSON.parse(jsonResult.stdout), expected);

  const helpResult = runCli(["--help"]);
  assert.equal(helpResult.status, 0, cliOutput(helpResult));
  assert.match(helpResult.stdout, /^Usage:/);

  const invalidResult = runCli(["--unknown"]);
  assert.equal(invalidResult.status, 2, cliOutput(invalidResult));
  assert.match(invalidResult.stderr, /Invalid arguments/);
});
