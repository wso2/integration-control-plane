.PHONY: download
download:
	go mod download

.PHONY: tidy
tidy:
	go mod tidy

UP_DP_LDFLAGS = -X github.com/wso2-enterprise/integration-user-portal-service/up-dp/config.Version=$(shell cat up-dp/VERSION)

# Local development: run `make run-mock`, `make run-up-dp` and `make web-dev` in
# three terminals, then open http://localhost:5173 (or :9200, the mock gateway, after `make web`).
.PHONY: run-mock
run-mock:
	go run ./ipaas-mock

.PHONY: run-up-dp
run-up-dp:
	go run -ldflags="$(UP_DP_LDFLAGS)" ./up-dp

.PHONY: web-install
web-install:
	cd up-dp/web && pnpm install

.PHONY: web
web: web-install
	cd up-dp/web && pnpm build

.PHONY: web-dev
web-dev:
	cd up-dp/web && pnpm dev

.PHONY: build
build: build-up-dp build-mock

.PHONY: build-up-dp
build-up-dp:
	go build -ldflags="$(UP_DP_LDFLAGS)" -o ./tmp/up-dp ./up-dp

.PHONY: build-mock
build-mock:
	go build -o ./tmp/ipaas-mock ./ipaas-mock

GOBIN := $(shell go env GOPATH)/bin
GOLANGCI_LINT := $(GOBIN)/golangci-lint
GOLANGCI_LINT_VERSION ?= v2.11.4

.PHONY: tools.golangci-lint
tools.golangci-lint:
	@if [ "$$($(GOLANGCI_LINT) version 2>/dev/null | grep -o '$(GOLANGCI_LINT_VERSION:v%=%)')" != "$(GOLANGCI_LINT_VERSION:v%=%)" ]; then \
		echo "installing golangci-lint $(GOLANGCI_LINT_VERSION)"; \
		curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(GOBIN) $(GOLANGCI_LINT_VERSION); \
	fi

.PHONY: lint
lint: tools.golangci-lint
	$(GOLANGCI_LINT) run ./... --timeout=5m

.PHONY: test
test:
	go test ./... -race

# Packages excluded from the coverage number.
COVER_SKIP := /shared/external-services/project-manager-mock|/shared/external-services/rudder-mock|/shared/external-services/cicd-mock|/shared/external-services/app-service-mock|/shared/external-services/ups-internal-mock|/shared/external-services/asgardeo-mock|/shared/external-services/asgardeo-management-mock|/shared/external-services/apim-management-mock|/shared/external-services/app-service/gen

COVER_PKGS = $(shell go list ./... | grep -vE '$(COVER_SKIP)')

COVER_PKG_LIST = $(shell go list ./... | grep -vE '$(COVER_SKIP)' | paste -sd, -)

# CI test run: the same package set `cover` measures, written to a profile the
# pipeline converts to JUnit and Cobertura. Separate from `cover` because that
# one opens a browser.
.PHONY: test-ci
test-ci:
	@mkdir -p ./tmp
	go test $(COVER_PKGS) -v -race -covermode=atomic -coverpkg=$(COVER_PKG_LIST) -coverprofile=./tmp/coverage.out

.PHONY: cover
cover:
	@mkdir -p ./tmp
	@go test $(COVER_PKGS) -race -coverpkg=$(COVER_PKG_LIST) -coverprofile=./tmp/coverage.out > ./tmp/test.log \
		|| (cat ./tmp/test.log; exit 1)
	@./scripts/coverage-report.sh ./tmp/coverage.out
	@go tool cover -html=./tmp/coverage.out
