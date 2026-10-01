.DEFAULT_GOAL := help
NPM ?= npm

include makes/development.mk
include makes/verification.mk
include makes/reports.mk

.PHONY: help
help:
	@printf '%s\n' 'doctor      inspect declared developer versions' 'install     guarded npm ci' 'dev         existing Astro development server' 'build       existing checked production build and root assets' 'preview     existing Astro preview' 'check       Astro static/type validation' 'test        developer command tests' 'report-test report tool tests' 'report      render RECORD into OUT' 'report-check validate RECORD as commit evidence' 'clean       remove only dist, .astro and .netlify outputs'
