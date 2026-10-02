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
import ballerina/jballerina.java;
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

// Timestamp columns are naive (TIMESTAMP / DATETIME2, no zone) and hold UTC wall-clock.
// Values ICP computes itself are written as explicit UTC, but column defaults and the
// CURRENT_TIMESTAMP in many queries are evaluated in the session time zone. The
// PostgreSQL and Oracle drivers set that zone from the JVM default zone, and the embedded
// H2 uses the JVM zone directly, so on a host outside UTC those rows were stored in local
// time next to UTC ones. Pin the JVM default zone to UTC before any connection is opened,
// so every session evaluates CURRENT_TIMESTAMP in UTC regardless of the host's zone.
isolated function pinJvmDefaultTimeZoneToUtc() {
    setDefaultTimeZone(getTimeZone(java:fromString("UTC")));
}

isolated function getTimeZone(handle id) returns handle = @java:Method {
    name: "getTimeZone",
    'class: "java.util.TimeZone",
    paramTypes: ["java.lang.String"]
} external;

isolated function setDefaultTimeZone(handle zone) = @java:Method {
    name: "setDefault",
    'class: "java.util.TimeZone"
} external;

public client class DatabaseConnectionManager {
    private final sql:Client dbClient;
    private final string dbType;

    public function init(string dbType, string dbHost, int dbPort, string dbName, string dbUser, string dbPassword, boolean useTLS = false) returns error? {
        self.dbType = dbType;
        pinJvmDefaultTimeZoneToUtc();
        sql:ConnectionPool pool = {
            maxOpenConnections: maxOpenConnections,
            minIdleConnections: minIdleConnections,
            maxConnectionLifeTime: maxConnectionLifeTime
        };

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
