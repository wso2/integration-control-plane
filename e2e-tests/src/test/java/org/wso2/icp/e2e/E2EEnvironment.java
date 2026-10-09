package org.wso2.icp.e2e;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import java.net.HttpURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.io.InputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.jacoco.core.runtime.RemoteControlReader;
import org.jacoco.core.runtime.RemoteControlWriter;
import org.jacoco.core.tools.ExecFileLoader;
import org.testcontainers.containers.BindMode;
import org.testcontainers.containers.FixedHostPortGenericContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.Network;
import org.testcontainers.containers.startupcheck.OneShotStartupCheckStrategy;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.MountableFile;

public final class E2EEnvironment implements AutoCloseable {
    public static final String SSO_USERNAME = "sso.user@example.com";
    public static final String SSO_PASSWORD = "Passw0rd!";
    // Distinct from the fixed UUID ICP auto-assigns to the local `admin` user, so SSO and
    // password logins do not collide. ICP uses the OIDC `sub` as the user id, so ThunderID's
    // declarative user id and this seeded id must match.
    private static final String SSO_USER_ID = "5501b0b0-e29b-41d4-a716-446655440111";
    private static final String THUNDERID_IMAGE = "ghcr.io/thunder-id/thunderid:0.48.0";
    private static final int THUNDERID_PORT = 8090;
    private static final String MYSQL_IMAGE = "mysql:8.0";
    private static final int MYSQL_PORT = 3306;
    private static final String DB_NAME = "icp_database";
    private static final String DB_USER = "root";
    private static final String DB_PASSWORD = "my-secret-pw";
    // Bundled H2 quick-start credentials, passed from gradle.properties
    private static final String CREDENTIALS_DB_USER = requiredProperty("icp.e2e.h2QuickStartUser");
    private static final String CREDENTIALS_DB_PASSWORD = requiredProperty("icp.e2e.h2QuickStartPassword");
    private static E2EEnvironment current;

    private final Path runDir;
    private final Path reportDir;
    private final Path icpHome;
    private final Path miZip;
    private final Path biJar;
    private final Ports ports;
    private final boolean observability;
    private final boolean coverage;
    private final boolean sso;
    private final Path jacocoAgentJar;
    private int jacocoPort;
    private final List<Process> runtimeProcesses = new ArrayList<>();
    private Process icpProcess;
    private boolean fluentBitStarted;
    private Network network;
    private GenericContainer<?> opensearch;
    private GenericContainer<?> fluentBit;
    private GenericContainer<?> thunderId;
    private GenericContainer<?> mysql;
    private String opensearchHost;
    private int opensearchPort;

    private E2EEnvironment(Path runDir, Path reportDir, Path icpHome, Path miZip, Path biJar, Ports ports,
                           boolean observability, boolean coverage, boolean sso, String jacocoAgentJar) {
        this.runDir = runDir;
        this.reportDir = reportDir;
        this.icpHome = icpHome;
        this.miZip = miZip;
        this.biJar = biJar;
        this.ports = ports;
        this.observability = observability;
        this.coverage = coverage;
        this.sso = sso;
        this.jacocoAgentJar = jacocoAgentJar.isBlank() ? null : Path.of(jacocoAgentJar).toAbsolutePath();
    }

    public static synchronized E2EConfig start(E2EConfig config) {
        if (!config.selfContained()) return config;
        if (current != null) {
            if (current.observability != config.observability() || current.sso != config.sso()) {
                throw new IllegalStateException("E2E environment already started with a different suite fixture");
            }
            return config.withBaseUrl(current.baseUrl());
        }
        if (config.distributionZip().isBlank()) {
            throw new IllegalStateException("icp.e2e.distributionZip is required for self-contained E2E tests");
        }

        E2EEnvironment environment = null;
        try {
            trustAllHttpsCertificates();
            Path runDir = Path.of(config.workDir()).toAbsolutePath().resolve("run-" + UUID.randomUUID());
            Path reportDir = Path.of(config.reportDir()).toAbsolutePath();
            recreate(runDir);
            Files.createDirectories(reportDir);

            Path icpHome = unzipRoot(Path.of(config.distributionZip()).toAbsolutePath(), runDir.resolve("icp"),
                    "wso2-integration-control-plane-");
            Path miZip = config.miZip().isBlank() ? null : Path.of(config.miZip()).toAbsolutePath();
            Path biJar = config.biJar().isBlank() ? null : Path.of(config.biJar()).toAbsolutePath();
            Ports ports = Ports.allocate();
            E2EEnvironment env = new E2EEnvironment(runDir, reportDir, icpHome, miZip, biJar, ports,
                    config.observability(), config.coverage(), config.sso(), config.jacocoAgentJar());
            environment = env;
            env.startObservability();
            env.startThunderId();
            env.startMysql();
            env.prepareIcp();
            env.startIcp();
            current = env;
            Runtime.getRuntime().addShutdownHook(new Thread(env::closeQuietly));
            return config.withBaseUrl(env.baseUrl());
        } catch (Exception e) {
            if (environment != null) environment.closeQuietly();
            throw new RuntimeException("Failed to start self-contained ICP E2E environment", e);
        }
    }

    // Release the heavy per-scenario runtimes (BI/MI/Fluent Bit) while keeping the shared
    // ICP and OpenSearch, so memory is freed for the remaining UI tests.
    public static synchronized void stopRuntimes() {
        if (current == null) return;
        current.runtimeProcesses.reversed().forEach(E2EEnvironment::destroyTree);
        current.runtimeProcesses.clear();
        current.removeFluentBit();
    }

    private void removeFluentBit() {
        if (fluentBit == null) return;
        fluentBit.stop();
        fluentBit = null;
        fluentBitStarted = false;
    }

    private String baseUrl() {
        return "https://localhost:" + ports.icp;
    }

    public static String runtimeListenerUrl() {
        if (current == null) throw new IllegalStateException("E2E environment is not running");
        return "https://localhost:" + current.ports.runtimeListener;
    }

    public static RuntimeProcess startBiRuntime(String runtimeId, String environment, String project, String component,
                                                String secret) throws Exception {
        if (current == null) throw new IllegalStateException("E2E environment is not running");
        return current.startBi(runtimeId, environment, project, component, secret);
    }

    public static RuntimeProcess startMiRuntime(String runtimeId, String environment, String project, String component,
                                                String secret, String logMessage) throws Exception {
        if (current == null) throw new IllegalStateException("E2E environment is not running");
        return current.startMi(runtimeId, environment, project, component, secret, logMessage);
    }

    public static void waitUntilReachable(String url) throws Exception {
        waitForUrl(url, Duration.ofSeconds(30));
    }

    // Poll OpenSearch until the Fluent Bit pipeline has indexed a log entry containing the message.
    public static void awaitLogIndexed(String message) throws Exception {
        if (current == null) throw new IllegalStateException("E2E environment is not running");
        String query = "{\"size\":1,\"query\":{\"match_phrase\":{\"message\":\"" + message + "\"}}}";
        Instant deadline = Instant.now().plus(Duration.ofSeconds(120));
        while (Instant.now().isBefore(deadline)) {
            try {
                if (current.openSearchText("/*-application-logs-*/_search", "POST", query).contains(message)) return;
            } catch (IOException ignored) {
            }
            Thread.sleep(1_000);
        }
        throw new RuntimeException("Timed out waiting for OpenSearch to index log: " + message);
    }

    public static void startLogCollector() throws Exception {
        if (current == null) throw new IllegalStateException("E2E environment is not running");
        current.startFluentBit();
    }

    // Storage DB for the product under test: a fresh MySQL seeded with the same schema + data the
    // packaged distribution ships (dbscripts/), so E2E exercises the real MySQL code path.
    private void startMysql() {
        mysql = new GenericContainer<>(MYSQL_IMAGE)
                .withExposedPorts(MYSQL_PORT)
                .withEnv("MYSQL_ROOT_PASSWORD", DB_PASSWORD)
                .withEnv("MYSQL_DATABASE", DB_NAME)
                .withCopyFileToContainer(MountableFile.forHostPath(icpHome.resolve("dbscripts/mysql_init.sql")),
                        "/docker-entrypoint-initdb.d/01_init.sql")
                .withCopyFileToContainer(MountableFile.forHostPath(icpHome.resolve("dbscripts/mysql_test_data_init.sql")),
                        "/docker-entrypoint-initdb.d/02_test_data.sql")
                // MySQL logs "ready for connections" for the temp init server and the X plugin too;
                // wait for the real server line ("port: 3306") so ICP never connects mid-init.
                .waitingFor(Wait.forLogMessage(".*ready for connections.*port: 3306.*", 1)
                        .withStartupTimeout(Duration.ofMinutes(3)));
        mysql.start();
    }

    private static void allowContainerWrites(Path dir) {
        try {
            Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwxrwxrwx"));
        } catch (IOException | UnsupportedOperationException ignored) {
            // Non-POSIX filesystem (e.g. Windows); bind-mount permissions are handled by the OS there.
        }
    }

    private void execMysql(String sql) throws Exception {
        var result = mysql.execInContainer("mysql", "-uroot", "-p" + DB_PASSWORD, DB_NAME, "-e", sql);
        if (result.getExitCode() != 0) {
            throw new IllegalStateException("MySQL exec failed: " + result.getStderr());
        }
    }

    private void prepareIcp() throws Exception {
        Files.createDirectories(icpHome.resolve("bin/database"));
        Files.createDirectories(icpHome.resolve("logs"));
        Files.createDirectories(runDir.resolve("logs/bi/e2e-bi"));
        Files.createDirectories(runDir.resolve("logs/mi"));
        // Main storage runs on MySQL (Testcontainers); credentials stay on local H2.
        initializeH2("credentials_db", icpHome.resolve("dbscripts/credentials_h2_init.sql"));
        if (sso) seedOidcUser();
        writeDeploymentToml();
    }

    private void startThunderId() throws Exception {
        if (!sso) return;
        Path home = runDir.resolve("thunderid");
        Path db = home.resolve("database");
        Path consentDb = home.resolve("consent-database");
        Path certs = home.resolve("config/certs");
        Path secrets = home.resolve("config/secrets");
        List<Path> writableDirs = List.of(db, consentDb, certs, secrets);
        for (Path dir : writableDirs) {
            Files.createDirectories(dir);
            allowContainerWrites(dir);
        }
        writeThunderIdConfig(home);

        new GenericContainer<>(THUNDERID_IMAGE)
                .withCommand("sh", "-c", "cp -r /opt/thunderid/database/* /data/ && (cp -r /opt/thunderid/consent/repository/database/* /consent-data/ 2>/dev/null || true) && cp -r /opt/thunderid/config/certs/* /certs/")
                .withFileSystemBind(db.toString(), "/data", BindMode.READ_WRITE)
                .withFileSystemBind(consentDb.toString(), "/consent-data", BindMode.READ_WRITE)
                .withFileSystemBind(certs.toString(), "/certs", BindMode.READ_WRITE)
                .withStartupCheckStrategy(new OneShotStartupCheckStrategy().withTimeout(Duration.ofMinutes(2)))
                .start();

        new GenericContainer<>(THUNDERID_IMAGE)
                .withCommand("./setup.sh")
                .withEnv("ADMIN_USERNAME", "admin")
                .withEnv("ADMIN_PASSWORD", "admin")
                .withFileSystemBind(db.toString(), "/opt/thunderid/database", BindMode.READ_WRITE)
                .withFileSystemBind(consentDb.toString(), "/opt/thunderid/consent/repository/database", BindMode.READ_WRITE)
                .withFileSystemBind(certs.toString(), "/opt/thunderid/config/certs", BindMode.READ_WRITE)
                .withFileSystemBind(secrets.toString(), "/opt/thunderid/config/secrets", BindMode.READ_WRITE)
                .withFileSystemBind(home.resolve("deployment-setup.yaml").toString(), "/opt/thunderid/deployment.yaml", BindMode.READ_ONLY)
                .withStartupCheckStrategy(new OneShotStartupCheckStrategy().withTimeout(Duration.ofMinutes(2)))
                .start();

        thunderId = new FixedHostPortGenericContainer<>(THUNDERID_IMAGE)
                .withFixedExposedPort(ports.thunderId, THUNDERID_PORT)
                .withExposedPorts(THUNDERID_PORT)
                .withFileSystemBind(db.toString(), "/opt/thunderid/database", BindMode.READ_WRITE)
                .withFileSystemBind(consentDb.toString(), "/opt/thunderid/consent/repository/database", BindMode.READ_WRITE)
                .withFileSystemBind(certs.toString(), "/opt/thunderid/config/certs", BindMode.READ_ONLY)
                .withFileSystemBind(secrets.toString(), "/opt/thunderid/config/secrets", BindMode.READ_ONLY)
                .withFileSystemBind(home.resolve("deployment.yaml").toString(), "/opt/thunderid/deployment.yaml", BindMode.READ_ONLY)
                .withFileSystemBind(home.resolve("gate-config.js").toString(), "/opt/thunderid/apps/gate/config.js", BindMode.READ_ONLY)
                .withFileSystemBind(home.resolve("resources").toString(), "/opt/thunderid/config/resources", BindMode.READ_ONLY)
                .waitingFor(Wait.forHttps("/health/readiness").forPort(THUNDERID_PORT).allowInsecure()
                        .withStartupTimeout(Duration.ofMinutes(2)));
        thunderId.start();
    }

    private void writeThunderIdConfig(Path home) throws IOException {
        Path resources = home.resolve("resources");
        Files.createDirectories(resources.resolve("applications"));
        Files.createDirectories(resources.resolve("users"));
        // deployment-base.yaml.template references this file via a `file://` URI; ThunderID resolves
        // it at config-load time, and unlike the `crypto` cert material it ships no default for it.
        Files.writeString(home.resolve("config/secrets/direct_auth_secret"), UUID.randomUUID().toString());

        Map<String, String> vars = thunderIdVars();
        String baseDeployment = render("thunderid/deployment-base.yaml.template", vars);
        Files.writeString(home.resolve("deployment-setup.yaml"), baseDeployment);
        Files.writeString(home.resolve("deployment.yaml"), baseDeployment + "\n" + resource("thunderid/declarative-stores.yaml"));
        Files.writeString(home.resolve("gate-config.js"), render("thunderid/gate-config.js.template", vars));
        Files.writeString(resources.resolve("applications/icp-console.yaml"),
                render("thunderid/applications/icp-console.yaml.template", vars));
        Files.writeString(resources.resolve("users/sso-user.yaml"), render("thunderid/users/sso-user.yaml.template", vars));
    }

    private String thunderIdUrl() {
        return "https://localhost:" + ports.thunderId;
    }

    private Map<String, String> thunderIdVars() {
        return Map.of(
                "BASE_URL", baseUrl(),
                "THUNDERID_PORT", Integer.toString(ports.thunderId),
                "THUNDERID_URL", thunderIdUrl(),
                "SSO_PASSWORD", SSO_PASSWORD,
                "SSO_USERNAME", SSO_USERNAME,
                "SSO_USER_ID", SSO_USER_ID);
    }

    private void startObservability() throws Exception {
        if (!observability) return;
        network = Network.newNetwork();
        opensearch = new GenericContainer<>("opensearchproject/opensearch:2.19.1")
                .withNetwork(network)
                .withNetworkAliases("opensearch")
                .withEnv("discovery.type", "single-node")
                .withEnv("OPENSEARCH_JAVA_OPTS", "-Xms1g -Xmx1g")
                .withEnv("OPENSEARCH_INITIAL_ADMIN_PASSWORD", "Ballerina@123")
                .withExposedPorts(9200)
                .waitingFor(Wait.forHttps("/_cluster/health")
                        .allowInsecure()
                        .withBasicCredentials("admin", "Ballerina@123")
                        .forStatusCodeMatching(code -> code >= 200 && code < 300)
                        .withStartupTimeout(Duration.ofMinutes(3)));
        opensearch.start();
        opensearchHost = opensearch.getHost();
        opensearchPort = opensearch.getMappedPort(9200);
        applyOpenSearchIndexTemplate();
    }

    private void startFluentBit() throws Exception {
        if (!observability || fluentBitStarted) return;
        Path conf = runDir.resolve("fluent-bit.conf");
        Path parsers = runDir.resolve("parsers.conf");
        Path scripts = runDir.resolve("scripts.lua");
        Files.writeString(parsers, resource("observability/parsers.conf"));
        Files.writeString(scripts, resource("observability/scripts.lua"));
        Files.writeString(conf, resource("observability/fluent-bit.conf"));
        fluentBit = new GenericContainer<>("fluent/fluent-bit:latest")
                .withNetwork(network)
                .withCopyFileToContainer(MountableFile.forHostPath(conf), "/fluent-bit/etc/fluent-bit.conf")
                .withCopyFileToContainer(MountableFile.forHostPath(parsers), "/fluent-bit/etc/parsers.conf")
                .withCopyFileToContainer(MountableFile.forHostPath(scripts), "/fluent-bit/etc/scripts.lua")
                .withFileSystemBind(runDir.resolve("logs/bi").toString(), "/var/log/ballerina", BindMode.READ_ONLY)
                .withFileSystemBind(runDir.toString(), "/e2e", BindMode.READ_ONLY)
                .waitingFor(Wait.forLogMessage(".*stream processor started.*", 1)
                        .withStartupTimeout(Duration.ofSeconds(60)));
        fluentBit.start();
        fluentBitStarted = true;
    }

    public static void captureDiagnostics(String label) {
        if (current == null || !current.observability) return;
        current.dumpDiagnostics(label);
    }

    private void dumpDiagnostics(String label) {
        StringBuilder out = new StringBuilder("=== observability diagnostics: " + label + " ===\n");
        try {
            out.append("\n--- OpenSearch _cat/indices ---\n")
                    .append(openSearchText("/_cat/indices?v", "GET", null));
            String search = "{\"size\":20,\"sort\":[{\"@timestamp\":\"desc\"}],\"query\":{\"match_all\":{}}}";
            out.append("\n--- mi-application-logs-*/_search ---\n")
                    .append(openSearchText("/mi-application-logs-*/_search", "POST", search));
            out.append("\n--- ballerina-application-logs-*/_search ---\n")
                    .append(openSearchText("/ballerina-application-logs-*/_search", "POST", search));
        } catch (Exception e) {
            out.append("\nOpenSearch query failed: ").append(e).append('\n');
        }
        if (fluentBit != null) {
            out.append("\n--- fluent-bit logs ---\n").append(fluentBit.getLogs());
        }
        try {
            Files.writeString(reportDir.resolve("observability-diagnostics.log"), out.toString());
        } catch (IOException ignored) {
        }
        System.out.println(out);
    }

    private String openSearchText(String path, String method, String body) throws IOException {
        HttpsURLConnection connection = openSearchConnection(path, method);
        if (body != null) {
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        }
        int code = connection.getResponseCode();
        java.io.InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
        String text = stream == null ? "" : new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        return code + "\n" + text + "\n";
    }

    private RuntimeProcess startBi(String runtimeId, String environment, String project, String component, String secret)
            throws Exception {
        if (biJar == null || !Files.exists(biJar)) throw new IllegalStateException("icp.e2e.biJar is required");
        int port = freePort();
        Path home = runDir.resolve("bi-runtime");
        recreate(home);
        Files.createDirectories(runDir.resolve("logs/bi/e2e-bi"));
        Files.writeString(home.resolve(".icp_runtime_id"), runtimeId);
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("HTTP_PORT", Integer.toString(port));
        vars.put("RUNTIME_ID", escapeToml(runtimeId));
        vars.put("SERVER_URL", runtimeListenerUrl());
        vars.put("SECRET", escapeToml(secret));
        vars.put("INTEGRATION", escapeToml(component));
        vars.put("PROJECT", escapeToml(project));
        vars.put("ENVIRONMENT", escapeToml(environment));
        vars.put("LOG_PATH", escapeToml(runDir.resolve("logs/bi/e2e-bi/app.log").toString()));
        Files.writeString(home.resolve("Config.toml"), render("bi/Config.toml", vars));

        Process process = new ProcessBuilder(javaBin(), "-jar", biJar.toString())
                .directory(home.toFile())
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.appendTo(reportDir.resolve("bi-stdout.log").toFile()))
                .start();
        runtimeProcesses.add(process);
        String url = "http://localhost:" + port + "/greeting";
        waitForUrl(url, Duration.ofSeconds(90));
        return new RuntimeProcess("BI", runtimeId, url);
    }

    private RuntimeProcess startMi(String runtimeId, String environment, String project, String component, String secret,
                                   String logMessage) throws Exception {
        if (miZip == null || !Files.exists(miZip)) throw new IllegalStateException("icp.e2e.miZip is required");
        int httpPort = freePort();
        int httpsPort = freePort();
        int inboundPort = freePort();
        Path miRuntimeDir = runDir.resolve("mi-runtime");
        recreate(miRuntimeDir);
        Path miHome = unzipRoot(miZip, miRuntimeDir);
        Path synapse = miHome.resolve("repository/deployment/server/synapse-configs/default");
        Files.createDirectories(synapse.resolve("api"));
        Files.writeString(miHome.resolve(".icp_runtime_id"), runtimeId);
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("HTTP_PORT", Integer.toString(httpPort));
        vars.put("HTTPS_PORT", Integer.toString(httpsPort));
        vars.put("ICP_URL", runtimeListenerUrl());
        vars.put("ENVIRONMENT", escapeToml(environment));
        vars.put("PROJECT", escapeToml(project));
        vars.put("INTEGRATION", escapeToml(component));
        vars.put("SECRET", escapeToml(secret));
        Files.writeString(miHome.resolve("conf/deployment.toml"), render("mi/deployment.toml", vars));
        patchMiLog4j(miHome.resolve("conf/log4j2.properties"));
        String api = render("mi/e2e-log-api.xml.template", Map.of("MESSAGE", xmlEscape(logMessage)));
        Files.writeString(synapse.resolve("api/e2e-log-api.xml"), api);
        deployRichMiArtifacts(synapse, inboundPort);

        ProcessBuilder builder = new ProcessBuilder("./micro-integrator.sh");
        builder.directory(miHome.resolve("bin").toFile());
        builder.redirectErrorStream(true);
        builder.redirectOutput(ProcessBuilder.Redirect.appendTo(reportDir.resolve("mi-stdout.log").toFile()));
        Map<String, String> env = builder.environment();
        env.put("JAVA_OPTS", "-Xms256m -Xmx768m");
        Process process = builder.start();
        runtimeProcesses.add(process);
        String url = "http://localhost:" + httpPort + "/e2e/log";
        waitForUrl(url, Duration.ofSeconds(180));
        return new RuntimeProcess("MI", runtimeId, url);
    }

    private void deployRichMiArtifacts(Path synapse, int inboundPort) throws IOException {
        writeMiArtifact(synapse, "api", "health-check-api.xml", resource("mi/artifacts/HealthCheckAPI.xml"));
        writeMiArtifact(synapse, "proxy-services", "sample-proxy-service.xml", resource("mi/artifacts/SampleProxyService.xml"));
        writeMiArtifact(synapse, "endpoints", "sample-endpoint.xml", resource("mi/artifacts/SampleEndpoint.xml"));
        writeMiArtifact(synapse, "sequences", "sample-sequence.xml", resource("mi/artifacts/SampleSequence.xml"));
        writeMiArtifact(synapse, "tasks", "sample-task.xml", resource("mi/artifacts/SampleTask.xml"));
        writeMiArtifact(synapse, "message-stores", "sample-message-store.xml", resource("mi/artifacts/SampleMessageStore.xml"));
        writeMiArtifact(synapse, "message-processors", "sample-message-processor.xml", resource("mi/artifacts/SampleMessageProcessor.xml"));
        writeMiArtifact(synapse, "templates", "sample-template.xml", resource("mi/artifacts/SampleTemplate.xml"));
        writeMiArtifact(synapse, "local-entries", "sample-local-entry.xml", resource("mi/artifacts/SampleLocalEntry.xml"));
        writeMiArtifact(synapse, "inbound-endpoints", "sample-inbound-endpoint.xml",
                render("mi/artifacts/SampleInboundEndpoint.xml.template", Map.of("INBOUND_PORT", Integer.toString(inboundPort))));
    }

    private static void writeMiArtifact(Path synapse, String directory, String file, String content) throws IOException {
        Path target = synapse.resolve(directory);
        Files.createDirectories(target);
        Files.writeString(target.resolve(file), content);
    }

    // Mirror the real ICP+MI deployment: emit timezone-aware ISO timestamps and append the
    // icp.runtime.log.suffix system property (set by MI from .icp_runtime_id). Without the
    // timezone the carbon log times are parsed as UTC and land in the future, outside the UI
    // time window, so the logs never appear.
    private static void patchMiLog4j(Path log4j) throws IOException {
        String content = Files.readString(log4j);
        Matcher matcher = Pattern.compile(
                "(?m)^appender\\.CARBON_LOGFILE\\.layout\\.pattern\\s*=.*$").matcher(content);
        if (!matcher.find()) throw new IOException("MI log4j carbon log pattern not found: " + log4j);
        Files.writeString(log4j, matcher.replaceFirst(Matcher.quoteReplacement(
                "appender.CARBON_LOGFILE.layout.pattern = [%d{yyyy-MM-dd'T'HH:mm:ss.SSSXXX}] %5p {%c} %X{Artifact-Container} - %m%ex ${sys:icp.runtime.log.suffix:-}%n")));
    }

    private void seedOidcUser() throws Exception {
        execMysql(render("sql/seed-oidc-user.sql.template", thunderIdVars()));
    }

    private void initializeH2(String dbName, Path script) throws Exception {
        output(new ProcessBuilder(
                javaBin(),
                "-cp", icpHome.resolve("bin/icp-server.jar").toString(),
                "org.h2.tools.RunScript",
                "-url", "jdbc:h2:file:" + icpHome.resolve("bin/database").resolve(dbName) + ";MODE=MySQL",
                "-user", CREDENTIALS_DB_USER,
                "-password", CREDENTIALS_DB_PASSWORD,
                "-script", script.toString()
        ).directory(icpHome.resolve("bin").toFile()), Duration.ofSeconds(60), "initialize " + dbName);
    }

    private void writeDeploymentToml() throws IOException {
        String opensearch = observability
                ? "opensearchUrl = \"https://" + opensearchHost + ":" + opensearchPort + "\"\n"
                + "opensearchUsername = \"admin\"\nopensearchPassword = \"Ballerina@123\""
                : "";
        String ssoConfig = sso ? render("icp/sso.toml.template", thunderIdVars()) : "";
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("SERVER_PORT", Integer.toString(ports.icp));
        vars.put("AUTH_PORT", Integer.toString(ports.auth));
        vars.put("OPENSEARCH_ADAPTOR_PORT", Integer.toString(ports.opensearchAdaptor));
        vars.put("RUNTIME_LISTENER_PORT", Integer.toString(ports.runtimeListener));
        vars.put("ICP_PORT", Integer.toString(ports.icp));
        vars.put("OPENSEARCH", opensearch);
        vars.put("SSO", ssoConfig);
        vars.put("DB_HOST", mysql.getHost());
        vars.put("DB_PORT", Integer.toString(mysql.getMappedPort(MYSQL_PORT)));
        vars.put("DB_NAME", DB_NAME);
        vars.put("DB_USER", DB_USER);
        vars.put("DB_PASSWORD", DB_PASSWORD);
        vars.put("CREDENTIALS_DB_USER", CREDENTIALS_DB_USER);
        vars.put("CREDENTIALS_DB_PASSWORD", CREDENTIALS_DB_PASSWORD);
        Files.writeString(icpHome.resolve("conf/deployment.toml"), render("icp/deployment.toml", vars));
    }

    private void startIcp() throws Exception {
        Path log = reportDir.resolve("icp-stdout.log");
        ProcessBuilder builder = new ProcessBuilder("./icp.sh", "run")
                .directory(icpHome.resolve("bin").toFile())
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.appendTo(log.toFile()));
        enableCoverage(builder);
        icpProcess = builder.start();

        try {
            waitForUrl(baseUrl() + "/login", Duration.ofSeconds(120));
        } catch (Exception e) {
            closeQuietly();
            throw new RuntimeException("ICP did not become ready. See " + log, e);
        }
    }

    private void enableCoverage(ProcessBuilder builder) throws IOException {
        if (!coverage) return;
        if (jacocoAgentJar == null || !Files.exists(jacocoAgentJar)) {
            throw new IOException("icp.e2e.jacocoAgentJar is required when icp.e2e.coverage=true");
        }
        Files.createDirectories(coverageDir());
        jacocoPort = freePort();
        // TCP-server output lets us pull a complete dump before teardown, instead of racing the
        // dump-on-exit shutdown hook against SIGTERM/SIGKILL (which truncates the exec file).
        builder.environment().put("JAVA_TOOL_OPTIONS", "-javaagent:" + jacocoAgentJar
                + "=output=tcpserver,address=127.0.0.1,port=" + jacocoPort + ",includes=wso2.*,dumponexit=true");
    }

    // Pull a full execution-data dump from the running ICP JaCoCo agent over its TCP control port.
    private void dumpCoverage() {
        if (!coverage || jacocoPort == 0) return;
        for (int attempt = 0; attempt < 3; attempt++) {
            try (Socket socket = new Socket("127.0.0.1", jacocoPort)) {
                ExecFileLoader loader = new ExecFileLoader();
                RemoteControlWriter writer = new RemoteControlWriter(socket.getOutputStream());
                RemoteControlReader reader = new RemoteControlReader(socket.getInputStream());
                reader.setSessionInfoVisitor(loader.getSessionInfoStore());
                reader.setExecutionDataVisitor(loader.getExecutionDataStore());
                writer.visitDumpCommand(true, false);
                reader.read();
                loader.save(coverageExec().toFile(), false);
                return;
            } catch (Exception e) {
                if (attempt == 2) System.err.println("Failed to dump ICP coverage over TCP: " + e);
            }
        }
    }

    private void writeCoverageReport() {
        if (!coverage) return;
        try {
            BallerinaCoverageReport.write(icpHome.resolve("bin/icp-server.jar"), coverageDir(),
                    icpServerSourceRoot(), "ICP Ballerina E2E line coverage", coverageExec());
            System.out.println("ICP Ballerina E2E line coverage: " + coverageDir().resolve("summary.md"));
        } catch (Exception e) {
            try {
                Files.writeString(coverageDir().resolve("coverage-error.log"), e.toString());
            } catch (IOException ignored) {
            }
            System.err.println("Failed to write ICP Ballerina E2E coverage report: " + e);
        }
    }

    private Path coverageDir() {
        return reportDir.resolve("coverage");
    }

    private static Path icpServerSourceRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        if (Files.isDirectory(cwd.resolve("icp_server"))) return cwd.resolve("icp_server");
        return cwd.getParent().resolve("icp_server");
    }

    private Path coverageExec() {
        return coverageDir().resolve("jacoco.exec");
    }

    private static void waitForUrl(String url, Duration timeout) throws Exception {
        Instant deadline = Instant.now().plus(timeout);
        Exception last = null;
        while (Instant.now().isBefore(deadline)) {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(2_000);
                connection.setReadTimeout(2_000);
                connection.setRequestMethod("GET");
                int code = connection.getResponseCode();
                if (code >= 200 && code < 400) return;
            } catch (Exception e) {
                last = e;
            }
            Thread.sleep(1_000);
        }
        throw new RuntimeException("Timed out waiting for " + url, last);
    }

    private static Path unzipRoot(Path zip, Path target) throws IOException {
        return unzipRoot(zip, target, "");
    }

    private static Path unzipRoot(Path zip, Path target, String rootPrefix) throws IOException {
        Files.createDirectories(target);
        try (ZipInputStream stream = new ZipInputStream(Files.newInputStream(zip))) {
            ZipEntry entry;
            while ((entry = stream.getNextEntry()) != null) {
                Path output = target.resolve(entry.getName()).normalize();
                if (!output.startsWith(target)) throw new IOException("Unsafe zip entry: " + entry.getName());
                if (entry.isDirectory()) {
                    Files.createDirectories(output);
                } else {
                    Files.createDirectories(output.getParent());
                    Files.copy(stream, output);
                    if (output.getFileName().toString().endsWith(".sh")) output.toFile().setExecutable(true);
                }
            }
        }
        try (Stream<Path> children = Files.list(target)) {
            return children.filter(Files::isDirectory)
                    .filter(path -> rootPrefix.isEmpty() || path.getFileName().toString().startsWith(rootPrefix))
                    .findFirst()
                    .orElseThrow(() -> new IOException("Distribution root not found in " + zip));
        }
    }

    private static void recreate(Path path) throws IOException {
        if (Files.exists(path)) delete(path);
        Files.createDirectories(path);
    }

    private static void delete(Path path) throws IOException {
        try (Stream<Path> paths = Files.walk(path)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        }
    }

    private static String output(ProcessBuilder builder, Duration timeout, String name) throws Exception {
        Process process = builder.redirectErrorStream(true).start();
        CompletableFuture<byte[]> output = CompletableFuture.supplyAsync(() -> {
            try {
                return process.getInputStream().readAllBytes();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        });
        if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
            process.destroyForcibly();
            throw new RuntimeException(name + " timed out");
        }
        String out = new String(output.get(), StandardCharsets.UTF_8).trim();
        if (process.exitValue() != 0) {
            throw new RuntimeException(name + " failed with exit code " + process.exitValue() + ": " + out);
        }
        return out;
    }

    private void applyOpenSearchIndexTemplate() throws IOException {
        String template = resource("observability/index-template.json");
        HttpsURLConnection connection = openSearchConnection("/_index_template/icp-e2e-runtime-logs", "PUT");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);
        connection.getOutputStream().write(template.getBytes(StandardCharsets.UTF_8));
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) {
            String error = connection.getErrorStream() == null ? "" : new String(connection.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            throw new IOException("Failed to apply OpenSearch index template: " + code + " " + error);
        }
    }

    private HttpsURLConnection openSearchConnection(String path, String method) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL("https://" + opensearchHost + ":" + opensearchPort + path).openConnection();
        String basic = Base64.getEncoder().encodeToString("admin:Ballerina@123".getBytes(StandardCharsets.UTF_8));
        connection.setRequestProperty("Authorization", "Basic " + basic);
        connection.setConnectTimeout(2_000);
        connection.setReadTimeout(7_000);
        connection.setRequestMethod(method);
        return connection;
    }

    private static String escapeToml(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String resource(String path) throws IOException {
        try (InputStream in = E2EEnvironment.class.getResourceAsStream("/" + path)) {
            if (in == null) throw new IOException("Missing test resource: " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String render(String path, Map<String, String> vars) throws IOException {
        String text = resource(path);
        for (Map.Entry<String, String> entry : vars.entrySet()) {
            text = text.replace("{{" + entry.getKey() + "}}", entry.getValue());
        }
        return text;
    }

    private static String xmlEscape(String value) {
        return value.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private static String requiredProperty(String name) {
        String value = System.getProperty(name);
        if (value == null || value.isEmpty()) {
            throw new IllegalStateException("System property " + name + " is not set; run the E2E suites through Gradle");
        }
        return value;
    }

    private static String javaBin() {
        String javaHome = System.getProperty("java.home");
        return Path.of(javaHome, "bin", "java").toString();
    }

    private static int freePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        }
    }

    private static void trustAllHttpsCertificates() throws Exception {
        TrustManager[] trustManagers = new TrustManager[]{new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String authType) { }
            public void checkServerTrusted(X509Certificate[] chain, String authType) { }
        }};
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, trustManagers, new SecureRandom());
        HttpsURLConnection.setDefaultSSLSocketFactory(context.getSocketFactory());
        HostnameVerifier verifier = (hostname, session) -> true;
        HttpsURLConnection.setDefaultHostnameVerifier(verifier);
    }

    private void closeQuietly() {
        try {
            close();
        } catch (Exception ignored) {
        }
    }

    @Override
    public void close() {
        runtimeProcesses.reversed().forEach(E2EEnvironment::destroyTree);
        runtimeProcesses.clear();
        if (icpProcess != null) {
            dumpCoverage();
            destroyTree(icpProcess);
            icpProcess = null;
            writeCoverageReport();
        }
        if (fluentBit != null) fluentBit.stop();
        if (thunderId != null) {
            try {
                Files.writeString(reportDir.resolve("thunderid.log"), thunderId.getLogs());
            } catch (IOException ignored) {
            }
            thunderId.stop();
        }
        if (mysql != null) mysql.stop();
        if (opensearch != null) opensearch.stop();
        if (network != null) network.close();
    }

    private static void destroyTree(Process process) {
        List<ProcessHandle> descendants = process.descendants().toList();
        descendants.forEach(ProcessHandle::destroy);
        process.destroy();
        if (waitForExit(process, descendants)) return;

        descendants.stream().filter(ProcessHandle::isAlive).forEach(ProcessHandle::destroyForcibly);
        if (process.isAlive()) process.destroyForcibly();
        waitForExit(process, descendants);
    }

    private static boolean waitForExit(Process process, List<ProcessHandle> descendants) {
        Instant deadline = Instant.now().plusSeconds(10);
        try {
            while (process.isAlive() || descendants.stream().anyMatch(ProcessHandle::isAlive)) {
                if (Instant.now().isAfter(deadline)) return false;
                Thread.sleep(100);
            }
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    public record RuntimeProcess(String type, String runtimeId, String url) {
    }

    private record Ports(int icp, int auth, int runtimeListener, int opensearchAdaptor, int thunderId) {
        static Ports allocate() throws IOException {
            return new Ports(freePort(), freePort(), freePort(), freePort(), freePort());
        }
    }
}
