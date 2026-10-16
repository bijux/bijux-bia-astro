.PHONY: audit-dead-code audit-markup audit-security

audit-dead-code:
	npm run audit:dead-code

audit-markup:
	npm run audit:markup

audit-security:
	npm run audit:security
