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
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

enum DatabaseType {
    MYSQL = "mysql",
    H2 = "h2",
    MSSQL = "mssql",
    POSTGRESQL = "postgresql"
}

public client class DatabaseConnectionManager {
    private final sql:Client dbClient;
    private final string dbType;

    public function init(string dbType, string dbHost, int dbPort, string dbName, string dbUser, string dbPassword) returns error? {
        self.dbType = dbType;
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
        } else {
            log:printInfo("Initializing H2 Database...");
            // Determine the appropriate init script based on database name
            string initScript = dbName == "credentialsdb" ? 
                "resources/db/init-scripts/credentials_h2_init.sql" : 
                "resources/db/init-scripts/h2_init.sql";
            string jdbcUrl = string `jdbc:h2:file:./database/${dbName};MODE=MySQL;AUTO_SERVER=TRUE;INIT=RUNSCRIPT FROM '${initScript}'`;
            log:printInfo(string `Connecting to H2: ${jdbcUrl}`);
            self.dbClient = check new jdbc:Client(jdbcUrl, dbUser, dbPassword);
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
