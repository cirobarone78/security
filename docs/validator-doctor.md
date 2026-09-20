# Validator environment doctor

Run the doctor before an audit to check whether the current Node.js environment exposes the file-opening capabilities required by the JSON validator CLIs:

```sh
node skills/security-audit/check-environment.cjs
```

The command reports the Node.js version, operating system, architecture, and whether `fs.constants.O_NOFOLLOW` and `fs.constants.O_NONBLOCK` are non-zero integers. This is the same availability rule used by the validators. The doctor reports `PASS` and exits `0` when both capabilities are available. It reports `FAIL` and exits `1` when either capability is missing, zero, or not an integer.

The protected flags are required because the validators fail closed rather than read input files without no-follow and nonblocking protections. If the check fails on native Windows, run Node.js inside Linux or WSL. The doctor reports the installed Node.js version but does not impose a minimum version.

For automation, request JSON output:

```sh
node skills/security-audit/check-environment.cjs --json
```

The JSON document has a versioned, stable top-level structure. `ok` is the overall result, `runtime` identifies the environment, `capabilities` describes each flag, and `missingCapabilities` lists requirements that failed. The command keeps the same `0` or `1` result exit code in JSON mode.

For usage information:

```sh
node skills/security-audit/check-environment.cjs --help
```

Help exits `0`. Unknown options or extra arguments exit `2`.

This command checks only the JSON validators' file-reading prerequisites. It does not verify the complete security-audit environment, an OS-enforced security sandbox, network isolation, resource limits, or safe scratch-directory configuration. It has no third-party dependencies, does not access the network, and does not install software or change system configuration.
