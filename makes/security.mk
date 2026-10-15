# Run from the repository root; the root Makefile loads the owned fragments.
.PHONY: security security-test security-check security-code security-deps

# Tests use isolated fixtures, so make -j2 can check source alongside them.
# Audit starts after both prerequisites succeed and retains the combined report.
security: security-test security-check
	npm run audit:security

security-test:
	npm test

security-check:
	npm run check

security-code:
	npm run audit:security -- code

security-deps:
	npm run audit:security -- deps
