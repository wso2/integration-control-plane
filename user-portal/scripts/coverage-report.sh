#!/bin/sh
# Summarises a Go coverage profile per package.
#
# `go tool cover -func` reports per function and one grand total, with nothing in
# between, and the per-package lines `go test` prints are meaningless under
# -coverpkg. This fills that gap.
#
# Usage: scripts/coverage-report.sh [profile]   (default ./tmp/coverage.out)

set -e

profile="${1:-./tmp/coverage.out}"

if [ ! -f "$profile" ]; then
	echo "coverage profile not found: $profile" >&2
	exit 1
fi

module=$(go list -m)

# Every test binary emits the same instrumented blocks, so the profile holds
# duplicates. Blocks are merged by key first — a block counts as covered if any
# binary reached it — otherwise shared packages are counted several times over.
awk -v module="$module" '
	NR > 1 {
		stmts[$1] = $2
		if ($3 > 0) hit[$1] = 1
	}
	END {
		for (block in stmts) {
			pkg = block
			sub(/:.*/, "", pkg)        # drop the line:col range
			sub(/\/[^\/]+$/, "", pkg)  # drop the file name
			total[pkg] += stmts[block]
			if (block in hit) covered[pkg] += stmts[block]
		}

		grandTotal = 0
		grandCovered = 0
		for (pkg in total) {
			grandTotal += total[pkg]
			grandCovered += covered[pkg]

			name = pkg
			sub("^" module "/?", "", name)
			if (name == "") name = "(root)"
			# Leading key sorts packages by name, with the total pinned last.
			printf "0\t%s\t%6.1f%%  %-45s %d/%d\n", name, 100 * covered[pkg] / total[pkg], name, covered[pkg], total[pkg]
		}
		printf "1\t\t%s\n", "---"
		printf "2\t\t%6.1f%%  %-45s %d/%d\n", 100 * grandCovered / grandTotal, "TOTAL", grandCovered, grandTotal
	}
' "$profile" | sort -k1,1 -k2,2 | cut -f3-
