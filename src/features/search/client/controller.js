import { cleanHistoryURL, historyRequestURL } from '../history.mjs';
import { formSearchURL } from '../query.mjs';
import { createSearchNavigation } from './navigation.mjs';
import { bindFacetControls, submitFacetsForm } from './facets.js';
import { bindToolbar } from './toolbar.js';
import { renderCursorPagination, syncPaginatedResults } from './pagination.js';
const SHELL_ID = 'search-results-shell';
function mountSearch() {
    if (!document.getElementById(SHELL_ID))
        return;
    const lifetime = new AbortController();
    const signal = lifetime.signal;
    let shellLifetime;
    function initialise(shell) {
        shellLifetime?.abort();
        shellLifetime = new AbortController();
        bindFacetControls(shell, shellLifetime.signal);
        bindToolbar(shell, navigateSearch, shellLifetime.signal);
        renderCursorPagination(shell, history.state || {});
        syncPaginatedResults(shell, history.state || {});
    }
    const navigation = createSearchNavigation({
        load: async (url, requestSignal) => {
            const response = await fetch(url.toString(), { headers: { 'X-Requested-With': 'fetch' }, signal: requestSignal });
            if (!response.ok || new URL(response.url).origin !== window.location.origin)
                throw new Error('Search navigation failed: ' + response.status);
            return new DOMParser().parseFromString(await response.text(), 'text/html');
        },
        commit: (nextDocument, url, { push = true, state = {} } = {}) => {
            const nextShell = nextDocument.getElementById(SHELL_ID);
            if (!nextShell)
                throw new Error('Search response is missing its results shell.');
            const current = document.getElementById(SHELL_ID);
            if (!current)
                throw new Error('The current search shell is unavailable.');
            shellLifetime?.abort();
            current.replaceWith(nextShell);
            document.title = nextDocument.title;
            const saved = { ...state, fetchURL: url.toString() };
            if (push)
                history.pushState(saved, '', cleanHistoryURL(url, window.location.origin).toString());
            else
                history.replaceState(saved, '');
            initialise(nextShell);
        },
        fail: (url, error) => { console.error(error); window.location.href = url.toString(); },
        busy: value => document.getElementById(SHELL_ID)?.classList.toggle('is-loading', value),
    });
    function navigateSearch(url, options) {
        if (!document.getElementById(SHELL_ID)) {
            window.location.href = url.toString();
            return;
        }
        return navigation.navigate(url, options);
    }
    window.addEventListener('pagehide', event => {
        if (event.persisted)
            return;
        shellLifetime?.abort();
        navigation.dispose();
        lifetime.abort();
    }, { signal });
    const restore = historyRequestURL(window.location.href, history.state);
    if (!history.state?.fetchURL)
        history.replaceState({ ...history.state, fetchURL: window.location.href }, '');
    document.addEventListener("submit", (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.id !== "facets")
            return;
        event.preventDefault();
        navigateSearch(formSearchURL(form.action, new FormData(form).entries(), window.location.origin));
    }, { signal });
    document.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            return;
        if (!target.matches('#facets input[type="checkbox"]'))
            return;
        submitFacetsForm();
    }, { signal });
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        const tooltipClose = target.closest("[data-tooltip-close]");
        if (tooltipClose) {
            event.preventDefault();
            event.stopPropagation();
            tooltipClose.closest(".tooltip")?.classList.add("is-dismissed");
            return;
        }
        const facetToggle = target.closest("[data-facet-toggle]");
        if (facetToggle) {
            const id = facetToggle.getAttribute("data-facet-toggle");
            const section = document.getElementById(`facet-section-${id}`);
            const options = document.getElementById(`facet-option-${id}`);
            if (section && options) {
                const isCollapsed = section.classList.toggle("collapsed");
                options.style.display = isCollapsed ? "none" : "block";
            }
            return;
        }
        const link = target.closest(".facet-remove-btn, .vf-pagination a");
        if (!(link instanceof HTMLAnchorElement))
            return;
        const fetchURL = link.dataset.fetchUrl || link.href;
        const url = new URL(fetchURL, window.location.origin);
        if (url.host === window.location.host) {
            url.protocol = window.location.protocol;
        }
        if (url.origin !== window.location.origin)
            return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank" || link.hasAttribute("download"))
            return;
        event.preventDefault();
        navigateSearch(url, {
            state: link.dataset.navState
                ? JSON.parse(link.dataset.navState)
                : link.dataset.cursorPage
                    ? { cursorPage: Number(link.dataset.cursorPage) }
                    : {},
        });
    }, { signal });
    document.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof Element))
            return;
        const facetToggle = target.closest("[data-facet-toggle]");
        if (!facetToggle || (event.key !== "Enter" && event.key !== " "))
            return;
        event.preventDefault();
        facetToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, { signal });
    window.addEventListener("popstate", (event) => {
        navigateSearch(historyRequestURL(window.location.href, event.state), { push: false, state: event.state || {} });
    }, { signal });
    initialise(document.getElementById(SHELL_ID));
    if (restore.href !== window.location.href)
        navigateSearch(restore, { push: false, state: history.state || {} });
}
mountSearch();
