# Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
#
# WSO2 Inc. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
#  http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

# Stage 1: Build frontend using Node.js 22 (Vite requires v20.19+ or v22.12+)
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Required for pnpm to run non-interactively in Docker (no TTY)
ENV CI=true

COPY frontend/ ./

# --no-frozen-lockfile: pnpm-lock.yaml was generated on macOS; allow pnpm to
# resolve platform-native optional deps (e.g. @rollup/rollup-linux-arm64-musl)
RUN npm install -g pnpm@9 && \
    pnpm install --no-frozen-lockfile && \
    pnpm build

# Stage 2: Build stage with Ballerina and Gradle
FROM ballerina/ballerina:2201.14.0 AS builder

# Install required dependencies (using apk for Alpine-based image)
USER root

RUN apk add --no-cache wget unzip zip bash

# Set working directory
WORKDIR /app

# Copy gradle wrapper and gradle files
COPY gradlew ./
COPY gradlew.bat ./
COPY gradle/ ./gradle/
COPY build.gradle ./
COPY settings.gradle ./
COPY gradle.properties ./

# Copy source code
COPY icp_server/ ./icp_server/
COPY www/ ./www/
COPY conf/ ./conf/
COPY distribution/ ./distribution/

# Make gradlew executable
RUN chmod +x ./gradlew

# Copy the pre-built frontend dist from stage 1 (avoids needing Node.js in this stage)
COPY --from=frontend-builder /app/frontend/dist/ ./frontend/dist/

# Build the project, skipping buildFrontend since the dist is already present.
#
# `check` is skipped too: the root project's check depends on :e2e-tests tasks, and this
# stage deliberately does not copy e2e-tests/ (its Playwright suites need browsers and a
# running server). Without -x check the build fails on a task that cannot exist here.
# Packaging is not the place to run tests in any case — CI runs them against the source.
RUN ./gradlew clean build -x buildFrontend -x check

# Stage 3: Runtime stage
FROM eclipse-temurin:25-jdk

# Define build argument for ICP version
ARG ICP_VERSION=2.0.0-SNAPSHOT

# Install unzip
RUN apt-get update && \
    apt-get install -y unzip && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /home/wso2

# Copy the distribution zip file from builder stage
COPY --from=builder /app/build/distribution/wso2-integration-control-plane-${ICP_VERSION}.zip /home/wso2/

# Unzip the distribution and remove the zip file
RUN unzip wso2-integration-control-plane-${ICP_VERSION}.zip && \
    rm wso2-integration-control-plane-${ICP_VERSION}.zip

# Set working directory to the unzipped distribution home
WORKDIR /home/wso2/wso2-integration-control-plane-${ICP_VERSION}

# Expose ports (HTTPS, GraphQL, Observability, OpenSearch Adaptor)
EXPOSE 9445 9446 9449

# Ensure the script is executable
RUN chmod +x bin/icp.sh

# Run the startup script
ENTRYPOINT ["bin/icp.sh"]
