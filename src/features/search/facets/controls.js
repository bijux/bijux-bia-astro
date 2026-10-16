/** Keep visual, keyboard and announced disclosure state together. Hidden values remain successful form controls. */
export function setFacetExpanded(section, expanded) {
    const options = section?.querySelector('.facet-options');
    const toggle = section?.querySelector('[data-facet-toggle]');
    if (!options || !toggle) return;
    section.classList.toggle('collapsed', !expanded);
    section.classList.toggle('open', expanded);
    options.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.disabled = false;
}

export function submitFacetsForm() {
    const form = document.getElementById("facets");
    if (!form)
        return;
    form.querySelector('[name="pagination.page"]')?.remove();
    if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
    }
    else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
}
export function bindFacetControls(root, signal) {
    function formatBytesToHumanSize(sizeBytes) {
        const i = sizeBytes == 0 ? 0 : Math.floor(Math.log(sizeBytes) / Math.log(1000));
        return `${Number(sizeBytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`;
    }
    function pct(v, min, max) {
        return ((v - min) / (max - min)) * 100;
    }
    function formatRangeLabel(label, a, b) {
        return label.classList.contains("total_size_in_bytes")
            ? `${formatBytesToHumanSize(a)} – ${formatBytesToHumanSize(b)}`
            : `${Math.floor(a)} – ${Math.ceil(b)}`;
    }
    function syncSlider(container, from) {
        const minEl = container.querySelector(".slider-min");
        const maxEl = container.querySelector(".slider-max");
        const progress = container.querySelector(".slider-progress");
        const label = container.closest(".slider-facet")?.querySelector(".slider-label");
        const gte = container.closest(".slider-facet")?.querySelector(".slider-gte");
        const lte = container.closest(".slider-facet")?.querySelector(".slider-lte");
        if (!minEl || !maxEl || !progress || !gte || !lte)
            return;
        const minBound = Number(container.dataset.min);
        const maxBound = Number(container.dataset.max);
        let a = Number(minEl.value);
        let b = Number(maxEl.value);
        if (a > b) {
            if (from === "min") {
                a = b;
                minEl.value = String(a);
            }
            else {
                b = a;
                maxEl.value = String(b);
            }
        }
        const left = pct(a, minBound, maxBound);
        const right = pct(b, minBound, maxBound);
        progress.style.left = left + "%";
        progress.style.width = (right - left) + "%";
        label.textContent = formatRangeLabel(label, a, b);
        container.dataset.dirty = "1";
        const hadInitial = gte.dataset.initial === "1" || lte.dataset.initial === "1";
        if (from !== "init" || hadInitial) {
            gte.value = String(a);
            lte.value = String(b);
        }
        gte.disabled = gte.value === "";
        lte.disabled = lte.value === "";
        if (a === minBound && b === maxBound) {
            gte.value = "";
            lte.value = "";
            gte.disabled = true;
            lte.disabled = true;
            container.dataset.dirty = "0";
            label.textContent = label.dataset.default ?? formatRangeLabel(label, minBound, maxBound);
        }
    }
    function initSliders(root) {
        root.querySelectorAll(".slider-slider").forEach((container) => {
            syncSlider(container, "init");
            const minEl = container.querySelector(".slider-min");
            const maxEl = container.querySelector(".slider-max");
            minEl?.addEventListener("input", () => syncSlider(container, "min"), { signal });
            maxEl?.addEventListener("input", () => syncSlider(container, "max"), { signal });
            minEl?.addEventListener("change", submitFacetsForm, { signal });
            maxEl?.addEventListener("change", submitFacetsForm, { signal });
        });
    }
    function clamp(n, lo, hi) {
        if (!Number.isFinite(n))
            return NaN;
        return Math.min(hi, Math.max(lo, n));
    }
    function setHiddenNumber(input, value) {
        const hasValue = Number.isFinite(value);
        input.value = hasValue ? String(value) : "";
        input.disabled = !hasValue;
    }
    function initRangeFacet(fieldset) {
        const gte = fieldset.querySelector('input.range-gte[type="number"]');
        const lte = fieldset.querySelector('input.range-lte[type="number"]');
        const gteHidden = fieldset.querySelector('input.range-gte-hidden[type="hidden"]');
        const lteHidden = fieldset.querySelector('input.range-lte-hidden[type="hidden"]');
        if (!gte || !lte || !gteHidden || !lteHidden)
            return;
        const minBound = Number(gte.min);
        const maxBound = Number(gte.max);
        let debounceTimer = null;
        signal.addEventListener("abort", () => clearTimeout(debounceTimer), { once: true });
        const DEBOUNCE_MS = 1500;
        function commit(from) {
            clearTimeout(debounceTimer);
            const rawA = gte.value === "" ? NaN : Number(gte.value);
            const rawB = lte.value === "" ? NaN : Number(lte.value);
            let a = clamp(rawA, minBound, maxBound);
            let b = clamp(rawB, minBound, maxBound);
            if (from === "gte" && Number.isFinite(a) && !Number.isFinite(b)) {
                b = maxBound;
                lte.value = String(b);
            }
            if (from === "lte" && Number.isFinite(b) && !Number.isFinite(a)) {
                a = minBound;
                gte.value = String(a);
            }
            if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
                if (from === "gte") {
                    a = b;
                    gte.value = String(a);
                }
                else {
                    b = a;
                    lte.value = String(b);
                }
            }
            setHiddenNumber(gteHidden, a);
            setHiddenNumber(lteHidden, b);
            submitFacetsForm();
        }
        function debounceCommit(from) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => commit(from), DEBOUNCE_MS);
        }
        gte.addEventListener("input", () => debounceCommit("gte"), { signal });
        lte.addEventListener("input", () => debounceCommit("lte"), { signal });
        gte.addEventListener("blur", () => commit("gte"), { signal });
        lte.addEventListener("blur", () => commit("lte"), { signal });
        gte.addEventListener("keydown", (e) => { if (e.key === "Enter") {
            e.preventDefault();
            commit("gte");
        } }, { signal });
        lte.addEventListener("keydown", (e) => { if (e.key === "Enter") {
            e.preventDefault();
            commit("lte");
        } }, { signal });
    }
    function initRangeFacets(root) {
        root.querySelectorAll("fieldset.range-facet").forEach(initRangeFacet);
    }
    function isMobile() {
        const regex = /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        return regex.test(navigator.userAgent);
    }
    function initFacetSections(root) {
        root.querySelectorAll(".facet-section").forEach((section) => {
            setFacetExpanded(section, !isMobile());
        });
    }
    initSliders(root);
    initRangeFacets(root);
    initFacetSections(root);
}
