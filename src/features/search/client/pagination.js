import { cleanHistoryURL } from '../history.mjs';
function buildCleanHistoryURL(url) {
    return cleanHistoryURL(url, window.location.origin);
}
function buildNumberedPageURL(targetPage) {
    const nextURL = buildCleanHistoryURL(new URL(window.location.href));
    nextURL.searchParams.set("pagination.page", String(targetPage));
    return nextURL.toString();
}
function buildCursorFetchURL(cursor, targetPage) {
    const nextURL = new URL(window.location.href);
    nextURL.searchParams.set("cursor", cursor);
    if (typeof targetPage === "number") {
        nextURL.searchParams.set("pagination.page", String(targetPage));
    }
    else {
        nextURL.searchParams.delete("pagination.page");
    }
    return nextURL.toString();
}
function buildVisiblePaginationURL() {
    return buildCleanHistoryURL(new URL(window.location.href)).toString();
}
export function renderCursorPagination(root = document, state = history.state || {}) {
    const nav = root.querySelector(".vf-pagination");
    if (!(nav instanceof HTMLElement))
        return;
    const positiveInteger = (value, fallback = 1) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
    const totalPages = positiveInteger(nav.dataset.totalPages);
    const cappedPage = positiveInteger(nav.dataset.cappedPage);
    const currentPage = positiveInteger(nav.dataset.currentPage);
    const hasCursor = nav.dataset.hasCursor === "true";
    const nextHref = nav.dataset.nextHref || "";
    const currentCursor = nav.dataset.currentCursor || "";
    const stateCursorPage = positiveInteger(state?.cursorPage, 0);
    const cursorTrail = Array.isArray(state?.cursorTrail) ? state.cursorTrail.filter(value => typeof value === "string" && value.length <= 8192).slice(0, 7) : [];
    const displayPage = hasCursor ? Math.max(cappedPage + 1, stateCursorPage || positiveInteger(nav.dataset.displayPage, cappedPage + 1)) : currentPage;
    const list = nav.querySelector(".vf-pagination__list");
    if (!(list instanceof HTMLElement))
        return;
    if (!hasCursor)
        return;
    const prevCursor1 = cursorTrail[0] || "";
    const prevCursor2 = cursorTrail[1] || "";
    const nextState = JSON.stringify({
        cursorPage: displayPage + 1,
        cursorTrail: [currentCursor, ...cursorTrail].filter(Boolean).slice(0, 7),
    });
    const prevState1 = JSON.stringify({
        cursorPage: displayPage - 1,
        cursorTrail: cursorTrail.slice(1, 7),
    });
    const prevState2 = JSON.stringify({
        cursorPage: displayPage - 2,
        cursorTrail: cursorTrail.slice(2, 7),
    });
    function pageItem(label, { fetchUrl, navState, cursorPage, active = false, ellipsis = false, className = "" } = {}) {
        const item = document.createElement("li");
        item.className = `vf-pagination__item ${className}`.trim();
        if (active)
            item.classList.add("vf-pagination__item--is-active");
        let url = null;
        try {
            const candidate = new URL(fetchUrl, window.location.href);
            if (fetchUrl && candidate.origin === window.location.origin && !candidate.username && !candidate.password)
                url = candidate;
        }
        catch { /* An invalid navigation destination is rendered as unavailable. */ }
        const content = document.createElement(url ? "a" : "span");
        content.textContent = String(label);
        if (url) {
            content.href = buildVisiblePaginationURL();
            content.dataset.fetchUrl = url.href;
            content.dataset.navState = navState;
            if (typeof cursorPage === "number")
                content.dataset.cursorPage = String(cursorPage);
        }
        if (ellipsis)
            content.setAttribute("aria-hidden", "true");
        if (active)
            content.style.cssText = "padding: 0.25rem 0.5rem; background-color: #3b6fb6; color: white;";
        item.appendChild(content);
        return item;
    }
    const renderedItems = [];
    function appendRenderedPage(page, fetchUrl, navState, cursorPage) {
        const previous = renderedItems.at(-1);
        if (previous?.type === "page" && page - previous.page > 1) {
            renderedItems.push({ type: "ellipsis" });
        }
        if (previous?.type === "page" && previous.page === page)
            return;
        renderedItems.push({ type: "page", page, fetchUrl, navState, cursorPage });
    }
    for (let pageNumber = 1; pageNumber <= Math.min(5, cappedPage); pageNumber += 1) {
        appendRenderedPage(pageNumber, buildNumberedPageURL(pageNumber), JSON.stringify({ page: pageNumber }));
    }
    appendRenderedPage(cappedPage, buildNumberedPageURL(cappedPage), JSON.stringify({ page: cappedPage }));
    if (prevCursor2 && displayPage - 2 > cappedPage) {
        appendRenderedPage(displayPage - 2, buildCursorFetchURL(prevCursor2, displayPage - 2), prevState2, displayPage - 2);
    }
    if (prevCursor1 && displayPage - 1 > cappedPage) {
        appendRenderedPage(displayPage - 1, buildCursorFetchURL(prevCursor1, displayPage - 1), prevState1, displayPage - 1);
    }
    appendRenderedPage(displayPage, "", "");
    if (nextHref && displayPage + 1 <= totalPages) {
        appendRenderedPage(displayPage + 1, nextHref, nextState, displayPage + 1);
    }
    const lastRenderedPage = [...renderedItems].reverse().find((item) => item.type === "page")?.page || 0;
    const showTailEllipsis = totalPages - lastRenderedPage > 1;
    const previousItem = prevCursor1
        ? pageItem("Previous", { fetchUrl: buildCursorFetchURL(prevCursor1, displayPage - 1), navState: prevState1, className: "vf-pagination__item--previous-page" })
        : pageItem("Previous", { fetchUrl: displayPage - 1 <= cappedPage ? buildNumberedPageURL(displayPage - 1) : "", navState: JSON.stringify({ page: displayPage - 1 }), className: "vf-pagination__item--previous-page" });
    const items = [previousItem, ...renderedItems.map(item => item.type === "ellipsis"
            ? pageItem("...", { ellipsis: true })
            : pageItem(item.page, { fetchUrl: item.fetchUrl, navState: item.navState, cursorPage: item.cursorPage, active: item.page === displayPage }))];
    if (showTailEllipsis)
        items.push(pageItem("...", { ellipsis: true }));
    items.push(pageItem(`out of ${totalPages} pages`));
    items.push(pageItem("Next", { fetchUrl: nextHref, cursorPage: displayPage + 1, navState: nextState, className: "vf-pagination__item--next-page" }));
    list.replaceChildren(...items);
}
export function syncPaginatedResults(root = document, state = history.state || {}) {
    const shell = root instanceof HTMLElement && root.id === "search-results-shell" ? root : root.querySelector("#search-results-shell");
    const label = root.querySelector("#paginated-results");
    if (!(shell instanceof HTMLElement) || !(label instanceof HTMLElement))
        return;
    const totalResults = Number(shell.dataset.totalResults || "0");
    const pageSize = Number(shell.dataset.pageSize || "12");
    const resultsCount = Number(shell.dataset.resultsCount || "0");
    const cappedPage = Number(shell.dataset.cappedPage || "1");
    const hasCursor = shell.dataset.hasCursor === "true";
    const currentPage = Number(shell.dataset.currentPage || "1");
    const shellDisplayPage = Number(shell.dataset.displayPage || currentPage || cappedPage + 1);
    const displayPage = hasCursor
        ? Number(state?.cursorPage || shellDisplayPage)
        : Number(state?.page || currentPage);
    if (resultsCount === 0)
        return;
    const start = ((displayPage - 1) * pageSize) + 1;
    const end = Math.min(start + resultsCount - 1, totalResults);
    label.textContent = `${start} - ${end} of ${totalResults} results`;
}
