# ICP Playwright Java E2E tests

This suite is wired into the ICP Gradle build and defaults to a self-contained product fixture.

Default flow:

1. build/package the ICP distribution,
2. resolve the latest released MI zip from Maven (`-PmiVersion=` overrides it),
3. build the BI test apps from `src/test/resources/bi/hello-world` (released `wso2/icp.runtime.bridge:0.1.9`)
   and `src/test/resources/bi/workflow` (released `ballerina/workflow:0.10.1` and bridge `1.0.2`),
4. run the core, observability, and SSO suites; each suite unzips and starts ICP
   from the packaged distribution against a MySQL storage DB started via
   Testcontainers (credentials store stays on local H2),
5. run Playwright Java tests against those product instances.

Run from `./icp`:

```bash
./gradlew :e2e-tests:test
./gradlew check
```

Useful properties:

```bash
./gradlew :e2e-tests:test \
  -PmiVersion=4.6.0 \
  -Dicp.e2e.headless=false \
  -Dicp.e2e.timeoutMs=30000
```

To run against an already running ICP instead of the self-contained fixture:

```bash
./gradlew :e2e-tests:test \
  -Dicp.e2e.selfContained=false \
  -Dicp.e2e.baseUrl=https://localhost:9445
```

`:e2e-tests:test` is an aggregate task. It runs all three explicit suites by default:

```bash
./gradlew :e2e-tests:e2eCore
./gradlew :e2e-tests:e2eObservability
./gradlew :e2e-tests:e2eSso
```

The core suite covers login, failed login, protected-route redirect, logout,
public policy pages, project listing, environment listing, project validation,
not-found resources, and workflows: a workflow integration registers itself with an
org secret, is typed Workflow, and has a run started, its human task completed and
its result read in the console. The workflow scenario starts a Temporal dev server
(`temporalio/temporal`) via Testcontainers.

## SSO (ThunderID)

`e2eSso` runs a full OIDC login through a ThunderID IdP. It starts ThunderID
(`ghcr.io/thunder-id/thunderid:0.48.0`) via Testcontainers, enables ICP SSO
against it, seeds a matching OIDC super-admin user, then drives the **Sign in
with SSO** flow in the browser. It needs Docker and fails if the fixture cannot
start.

## Observability (runtime logs)

`e2eObservability` starts real BI and MI runtimes plus an OpenSearch + Fluent
Bit pipeline and verifies their emitted logs in the ICP UI. It needs Docker and
fails if the fixture cannot start.

OpenSearch and Fluent Bit are managed by Testcontainers (auto cleanup via Ryuk);
BI, MI and ICP run as host processes.

On Linux/CI with the default Docker socket nothing extra is needed. With
**Colima** locally, point Testcontainers at its socket:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="/var/run/docker.sock"
./gradlew :e2e-tests:e2eObservability --tests '*RuntimeLogsScenariosTest'
```

OpenSearch needs `vm.max_map_count >= 262144` on the Docker host.

## Ballerina coverage

Self-contained E2E runs collect ICP server Ballerina line coverage by attaching
JaCoCo to the packaged ICP JVM. Reports are written to:

- `build/reports/e2e/<suite>/coverage/html/index.html` — detailed JaCoCo HTML report
- `build/reports/e2e/<suite>/coverage/summary.md` — merged Ballerina source line summary
- `build/reports/e2e/<suite>/coverage/jacoco.xml` — raw JaCoCo XML
- `build/reports/e2e/<suite>/coverage/jacoco.exec` — execution data

Coverage is enabled by default for `:e2e-tests:test`; disable it with
`-Dicp.e2e.coverage=false`.

### Combined report (E2E + Ballerina unit tests)

`combinedCoverageReport` unions existing JaCoCo dumps — the three E2E suite dumps
and the `bal test --code-coverage` dump — into one report. All are analysed
against the same ICP jar; JaCoCo merges probes by class id, so a line covered by
any suite counts as covered.

It is a **pure merge step**: it does not run any suite. E2E uses Testcontainers,
and the unit tests run against a seeded H2 database (no MySQL). `./gradlew testICP` (pulled in by `build`/`check`)
first runs `:icp_server:initTestH2` to recreate `icp_test_db` / `credentials_test_db`,
then `bal test --code-coverage`.

Because JaCoCo keys execution data by class id (a hash of the bytecode), **all
dumps and the analysed jar must come from the same source built with the same
Ballerina toolchain**. Otherwise mismatched classes are
silently dropped and the merged numbers understate coverage. CI pins the
Ballerina version in `.github/workflows/pr-check.yml`; the jar you analyse must
match it.

A normal build already runs all E2E suites and the merge — no MySQL, no extra tasks:

```bash
./gradlew build                     # unit (self-contained H2) + E2E + combined report
./gradlew build -x :e2e-tests:test  # unit only — combined self-skips (needs both dumps)
./gradlew coverage -PskipE2E        # unit only, explicit; combined not scheduled
```

Or run the pieces yourself:

```bash
./gradlew testICP                       # unit dump (self-contained H2)
./gradlew :e2e-tests:test               # E2E suite dumps (self-contained)
./gradlew :e2e-tests:combinedCoverageReport
```

`combinedCoverageReport` requires the three default E2E dumps and the unit dump.
It self-skips if any is missing. That is also why `coverage -PskipE2E` skips it entirely.

CI produces the combined report on every PR: the `build` job runs the E2E suites and
`testICP` on the same runner, then `combinedCoverageReport` (see
`.github/workflows/pr-check.yml`). The report writes `coverage.txt` (the combined
line-coverage percent) and can gate the build:

```bash
./gradlew :e2e-tests:combinedCoverageReport -Picp.coverage.min=25   # fails below 25%
```

Default input paths (each overridable with `-P`):

- `icp.coverage.jar` — `icp_server/target/bin/icp_server.jar`
- `icp.coverage.e2eExec` — path-separator-separated override for E2E exec dumps
  (defaults to core, observability, and SSO suite dumps)
- `icp.coverage.unitExec` — `icp_server/target/cache/tests_cache/coverage/ballerina.exec`

Output:

- `build/reports/combined/coverage/html/index.html` — combined HTML report
- `build/reports/combined/coverage/summary.md` — combined line summary
- `build/reports/combined/coverage/jacoco.xml` — raw merged JaCoCo XML
