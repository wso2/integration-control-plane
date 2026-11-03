# --------------------------------------------------------------------
# Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the License for the
# specific language governing permissions and limitations
# under the License.
# --------------------------------------------------------------------

# Build context is the repository root: the BFF imports shared/.
# One image: the SPA is built first, and the BFF serves it next to /api/v1.
ARG NODE_VERSION=22
ARG GO_VERSION=1.26
ARG ALPINE_VERSION=3.21

# The SPA and the BFF build on the build machine's platform: the SPA is the same
# for every architecture, and Go cross-compiles. Under QEMU, esbuild crashes.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS web
WORKDIR /web
RUN corepack enable
COPY up-dp/web/package.json up-dp/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY up-dp/web/ ./
RUN pnpm build

FROM --platform=$BUILDPLATFORM golang:${GO_VERSION}-alpine AS builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY shared/ shared/
COPY up-dp/ up-dp/
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -trimpath -ldflags="-s -w -X github.com/wso2-enterprise/integration-user-portal-service/up-dp/config.Version=$(cat up-dp/VERSION)" -o /out/up-dp ./up-dp

FROM alpine:${ALPINE_VERSION}
ARG APP_USER=up-dp-user

# The WIdP-DP and iPaaS-Service are https, and alpine ships no CA bundle.
# hadolint ignore=DL3018
RUN apk --no-cache upgrade \
    && apk --no-cache add ca-certificates \
    && adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "12000" \
    "${APP_USER}"

COPY --from=builder /out/up-dp /up-dp
COPY --from=web /web/dist /srv/web
ENV SPA_DIR=/srv/web
# Numeric: the kubelet checks runAsNonRoot without reading the image's passwd.
USER 12000
EXPOSE 8080
ENTRYPOINT ["/up-dp"]
