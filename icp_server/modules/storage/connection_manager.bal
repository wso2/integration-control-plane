// Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
//
// WSO2 Inc. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
import ballerina/log;
import ballerina/sql;
import ballerinax/h2.driver as _;
import ballerinax/java.jdbc as jdbc;
import ballerinax/mssql;
import ballerinax/mssql.driver as _;
import ballerinax/mysql;
import ballerinax/mysql.driver as _;
import ballerinax/oracledb;
import ballerinax/oracledb.driver as _;
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

public enum DatabaseType {
    MYSQL = "mysql",
    H2 = "h2",
    MSSQL = "mssql",
    POSTGRESQL = "postgresql",
    ORACLE = "oracle"
}

// Credentials of the bundled H2 quick-start databases (see initH2Database in build.gradle).
// They are public knowledge: used only as a deprecated fallback for H2 when no credentials are
// configured, and never for a real database server.
const string H2_QUICKSTART_USER = "icp_user";
const string H2_QUICKSTART_PASSWORD = "icp_password";

boolean h2WarningLogged = false;

public type DbCredentials record {|
    string user;
    string password;
|};

// Resolves the credentials to connect with from the configured (secret-resolved) values, where ""
// means unset. For H2, unset values fall back to the bundled quick-start credentials with a
// deprecation warning, so older configurations keep working. For any other database, unset
// values are a startup error. configKeys names the settings in log and error messages.
public function resolveDbCredentials(string dbType, string user, string password, string configKeys)
        returns DbCredentials|error {
    if user != "" && password != "" {
        return {user, password};
    }
    if dbType != H2 {
        return error(string `Database credentials are not configured for the ${dbType} database. ` +
                string `Set ${configKeys} in deployment.toml.`);
    }
    log:printWarn(string `Database credentials are not configured; using the bundled H2 quick-start credentials. ` +
            string `This fallback is deprecated: set ${configKeys} in deployment.toml.`);
    return {
        user: user == "" ? H2_QUICKSTART_USER : user,
        password: password == "" ? H2_QUICKSTART_PASSWORD : password
    };
}

public client class DatabaseConnectionManager {
    private final sql:Client dbClient;
    private final string dbType;

    public function init(string dbType, string dbHost, int dbPort, string dbName, string dbUser, string dbPassword, boolean useTLS = false) returns error? {
        self.dbType = dbType;
        sql:ConnectionPool pool = {
            maxOpenConnections: maxOpenConnections,
            minIdleConnections: minIdleConnections,
            maxConnectionLifeTime: maxConnectionLifeTime
        };

        if dbType == H2 {
            if !h2WarningLogged {
                h2WarningLogged = true;
                log:printWarn("H2 is an embedded database intended for evaluation and development only. " +
                        "Use MySQL, PostgreSQL, MSSQL or Oracle in production.");
            }
        } else if dbPassword == H2_QUICKSTART_PASSWORD {
            log:printWarn(string `Database '${dbName}' (${dbType}) uses the sample password from the ICP H2 quick-start ` +
                    "configuration. Set a strong, unique database password before using this deployment in production.");
        }

        if dbType == MYSQL {
            log:printInfo("Initializing MySQL Database...");
            self.dbClient = check new mysql:Client(dbHost, dbUser, dbPassword, dbName, dbPort, connectionPool = pool);
            log:printInfo("MySQL Database initialized successfully.");
        } else if dbType == MSSQL {
            log:printInfo("Initializing MSSQL Database...");
            log:printInfo(string `Connecting to MSSQL: ${dbHost}:${dbPort}/${dbName}`);
            self.dbClient = check new mssql:Client(host = dbHost, user = dbUser, password = dbPassword, database = dbName, port = dbPort, connectionPool = pool);
            log:printInfo("MSSQL Database initialized successfully.");
        } else if dbType == POSTGRESQL {
            log:printInfo("Initializing PostgreSQL Database...");
            log:printInfo(string `Connecting to PostgreSQL: ${dbHost}:${dbPort}/${dbName}`);
            self.dbClient = check new postgresql:Client(host = dbHost, username = dbUser, password = dbPassword, database = dbName, port = dbPort, connectionPool = pool);
            log:printInfo("PostgreSQL Database initialized successfully.");
        } else if dbType == ORACLE {
            log:printInfo("Initializing Oracle Database...");
            log:printInfo(string `Connecting to Oracle: ${dbHost}:${dbPort}/${dbName} (TLS: ${useTLS})`);
            // With useTLS the connector switches the protocol to TCPS (required e.g. for
            // Oracle Autonomous Database); the JDK default truststore validates the server cert.
            oracledb:Options? oracleOptions = useTLS ? {ssl: {}} : ();
            self.dbClient = check new oracledb:Client(host = dbHost, user = dbUser, password = dbPassword, database = dbName, port = dbPort, options = oracleOptions, connectionPool = pool);
            log:printInfo("Oracle Database initialized successfully.");
        } else {
            log:printInfo("Initializing H2 Database...");
            self.dbClient = check new jdbc:Client(string `jdbc:h2:file:./database/${dbName};MODE=MySQL;AUTO_SERVER=TRUE`, dbUser, dbPassword);
            log:printInfo("H2 Database initialized successfully.");
        }
    }

    public isolated function getClient() returns sql:Client {
        return self.dbClient;
    }

    public isolated function close() returns error? {
        return self.dbClient.close();
    }
}
