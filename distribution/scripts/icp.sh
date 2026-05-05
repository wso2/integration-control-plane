#!/bin/bash

# Copyright (c) 2025, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
#
# WSO2 Inc. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# ICP Server Launcher Script
# Usage: ./icp.sh [start|stop|restart|run|version]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/icp-server.jar"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PARENT_DIR/conf/deployment.toml"
PID_FILE="$PARENT_DIR/icp.pid"
LOG_DIR="$PARENT_DIR/logs"
LOG_FILE="$LOG_DIR/icp.log"
JAVA_OPTS=""

resolve_version() {
    if [ -f "$PARENT_DIR/version.txt" ]; then
        cat "$PARENT_DIR/version.txt"
        return 0
    fi

    local dir_name
    dir_name="$(basename "$PARENT_DIR")"
    case "$dir_name" in
        wso2-integration-control-plane-*)
            echo "${dir_name#wso2-integration-control-plane-}"
            return 0
            ;;
    esac

    if command -v unzip >/dev/null 2>&1 && [ -f "$JAR_FILE" ]; then
        local version
        version="$(unzip -p "$JAR_FILE" META-INF/MANIFEST.MF 2>/dev/null | awk -F': ' '/^(Implementation-Version|Specification-Version):/ {gsub("\r", "", $2); print $2; exit}')"
        if [ -n "$version" ]; then
            echo "$version"
            return 0
        fi
    fi

    echo "unknown"
}

detect_java_opts() {
    JAVA_OPTS=""
    if [ -f /etc/alpine-release ] || (command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl); then
        echo "Alpine Linux detected - disabling native Netty tcnative libraries"
        JAVA_OPTS="-Dio.netty.native.workdir=/tmp/netty-native -Dio.netty.transport.noNative=true -Dio.netty.handler.ssl.noOpenSsl=true"
    fi
}

is_running() {
    local pid
    if [ -f "$PID_FILE" ]; then
        pid="$(cat "$PID_FILE" 2>/dev/null)"
        if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

run_server() {
    local mode="$1"
    shift

    if [ ! -f "$JAR_FILE" ]; then
        echo "Error: icp-server.jar not found in $SCRIPT_DIR"
        exit 1
    fi

    detect_java_opts
    mkdir -p "$LOG_DIR"

    cd "$SCRIPT_DIR" || exit 1

    if [ -f "$CONFIG_FILE" ]; then
        echo "Starting ICP Server with configuration: $CONFIG_FILE"
        export BAL_CONFIG_FILES="$CONFIG_FILE"
    else
        echo "Warning: Configuration file not found at $CONFIG_FILE"
        echo "Starting ICP Server without custom configuration..."
        unset BAL_CONFIG_FILES
    fi

    if [ "$mode" = "background" ]; then
        nohup java $JAVA_OPTS -jar "$JAR_FILE" "$@" >> "$LOG_FILE" 2>&1 &
        server_pid=$!
        echo "$server_pid" > "$PID_FILE"
        echo "ICP Server started with PID $server_pid"
        echo "Logs are available at $LOG_FILE"
    else
        exec java $JAVA_OPTS -jar "$JAR_FILE" "$@"
    fi
}

stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        echo "ICP Server is not running"
        return 0
    fi

    pid="$(cat "$PID_FILE" 2>/dev/null)"
    if [ -z "$pid" ]; then
        rm -f "$PID_FILE"
        echo "Removed stale PID file"
        return 0
    fi

    if ps -p "$pid" >/dev/null 2>&1; then
        echo "Stopping ICP Server (PID $pid)"
        kill -TERM "$pid"

        wait_count=0
        while ps -p "$pid" >/dev/null 2>&1; do
            wait_count=$((wait_count + 1))
            if [ "$wait_count" -ge 20 ]; then
                echo "Process did not stop gracefully; forcing shutdown"
                kill -KILL "$pid" 2>/dev/null
                break
            fi
            sleep 1
        done
        echo "ICP Server stopped"
    else
        echo "Removing stale PID file"
    fi

    rm -f "$PID_FILE"
}

COMMAND="run"
case "${1:-}" in
    start|--start|-start)
        COMMAND="start"
        shift
        ;;
    stop|--stop|-stop)
        COMMAND="stop"
        shift
        ;;
    restart|--restart|-restart)
        COMMAND="restart"
        shift
        ;;
    version|--version|-version)
        COMMAND="version"
        shift
        ;;
    run|--run|-run)
        shift
        ;;
esac

case "$COMMAND" in
    start)
        if is_running; then
            current_pid="$(cat "$PID_FILE" 2>/dev/null)"
            echo "Process is already running with PID $current_pid"
            exit 0
        fi
        run_server background "$@"
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        run_server background "$@"
        ;;
    version)
        echo "WSO2 Integration Control Plane $(resolve_version)"
        ;;
    run)
        run_server foreground "$@"
        ;;
esac
