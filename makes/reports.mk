.PHONY: report report-check
report:
	@test -n "$(RECORD)" -a -n "$(OUT)" || { printf '%s\n' 'Usage: make report RECORD=record.json OUT=artifacts/report-preview'; exit 2; }
	$(NPM) run report -- "$(RECORD)" --out "$(OUT)"
report-check:
	@test -n "$(RECORD)" || { printf '%s\n' 'Usage: make report-check RECORD=record.json'; exit 2; }
	$(NPM) run report-check -- "$(RECORD)" --require-commit
