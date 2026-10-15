.PHONY: verify check test test-e2e

# Keep the production fixture build after Node suites, even under parallel Make.
verify:
	$(MAKE) check
	$(MAKE) test
	$(MAKE) test-e2e

check:
	npm run check

test:
	npm test

test-e2e:
	npm run test:e2e
