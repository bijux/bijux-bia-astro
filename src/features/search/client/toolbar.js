import { changedSearchURL } from '../state.ts';
import { submitFacetsForm } from '../facets/controls.js';
export function bindToolbar(root, navigateSearch, signal) {
    function toggleView(viewId) {
        const views = ['card-view', 'table-view', 'grid-view'];
        views.forEach(id => {
            const view = document.getElementById(id);
            if (view)
                view.style.display = id === viewId ? 'block' : 'none';
        });
        if (viewId === 'table-view') {
            window.dataTable?.columns?.adjust?.();
        }
    }
    function initViewControls(root) {
        root.querySelectorAll('input[name="view"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    toggleView(e.target.value);
                }
            }, { signal });
        });
        root.querySelectorAll('input[name="columns"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    setGridColumns(Number(e.target.value));
                }
            }, { signal });
        });
        function setGridColumns(columns) {
            const gridInner = root.querySelector('.grid-inner');
            if (gridInner) {
                gridInner.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
                const sizeBars = root.querySelectorAll('.compact-size-bar');
                const icons = root.querySelectorAll('.icon-container');
                const display = columns === 5 ? 'none' : '';
                sizeBars.forEach(bar => bar.style.display = display);
                icons.forEach(icon => icon.style.display = display);
            }
        }
        setGridColumns(4);
    }
    function initConvertedImageToggle(root) {
        const toggle = root.querySelector("#convertedImageToggle");
        const hidden = root.querySelector("#has_converted_image_hidden");
        const form = root.querySelector("#facets");
        if (!toggle || !hidden || !form)
            return;
        const url = new URL(window.location.href);
        const on = url.searchParams.has("has_converted_image");
        toggle.checked = on;
        hidden.disabled = !on;
        toggle.addEventListener("change", () => {
            hidden.disabled = !toggle.checked;
            const pageInput = form.querySelector('input[name="pagination.page"]');
            if (pageInput)
                pageInput.remove();
            submitFacetsForm();
        }, { signal });
    }
    function initPageSize(root) {
        root.querySelector("#pageSize")?.addEventListener("change", (event) => {
            navigateSearch(changedSearchURL(window.location.href, { pageSize: event.target.value }));
        }, { signal });
    }
    function initSortOptions(root) {
        const sortBy = root.querySelector("#sortBy");
        const sortOrder = root.querySelector("#sortOrder");
        const updateSort = (event) => {
            navigateSearch(changedSearchURL(window.location.href, {
                sortBy: sortBy?.value || '', sortOrder: sortOrder?.value || '', reset: event?.target?.value === '',
            }));
        };
        sortBy?.addEventListener("change", updateSort, { signal });
        sortOrder?.addEventListener("change", updateSort, { signal });
    }
    initViewControls(root);
    initConvertedImageToggle(root);
    initPageSize(root);
    initSortOptions(root);
}
