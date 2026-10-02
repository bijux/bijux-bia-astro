.PHONY: doctor install dev build preview clean
doctor dev build preview clean:
	$(NPM) run $@
install:
	$(NPM) run setup
