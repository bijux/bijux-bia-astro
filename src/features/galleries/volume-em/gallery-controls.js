document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-volume-gallery]');
    if (!root) return;
    const searchBox = root.querySelector('#searchBox');
    const viewControls = [...root.querySelectorAll('input[name="view"]')];
    const densityControls = [...root.querySelectorAll('input[name="columns"]')];
    const views = new Map(['card-view', 'table-view', 'grid-view'].map(id => [id, root.querySelector(`#${id}`)]));
    const items = [...root.querySelectorAll('#card-view .vf-card')].map(card => ({
        id: card.dataset.volumeId,
        title: card.querySelector('.title-text')?.textContent.toLowerCase() || '',
        subtitle: card.querySelector('.subtitle-text')?.textContent.toLowerCase() || '',
    }));
    let matchingIds = new Set(items.map(item => item.id));
    const table = new DataTable(root.querySelector('#table-view table'), {
        pageLength: 25,
        order: [[1, 'asc']],
        columnDefs: [{ orderable: false, targets: [4, 5, 6] }],
    });

    function toggleView(selected) {
        if (!views.has(selected)) return;
        for (const [id, view] of views) view.style.display = id === selected ? 'block' : 'none';
        if (selected === 'table-view') table.columns.adjust();
    }

    function setGridColumns(columns) {
        if (![3, 4, 5].includes(columns)) return;
        root.querySelector('.grid-inner').style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        for (const panel of root.querySelectorAll('.size-bar, .cube-wrapper')) {
            panel.style.display = columns === 5 ? 'none' : '';
        }
    }

    function filterImages() {
        const query = searchBox.value.toLowerCase();
        matchingIds = new Set(items.filter(item => item.title.includes(query) || item.subtitle.includes(query))
            .map(item => item.id));
        for (const card of root.querySelectorAll('#card-view [data-volume-id], #grid-view [data-volume-id]')) {
            card.style.display = matchingIds.has(card.dataset.volumeId) ? '' : 'none';
        }
        root.querySelector('#visibleCount').textContent = query ? String(matchingIds.size) : 'all';
        table.draw();
    }

    // Keep the gallery filter independent of DataTables' native table search.
    table.search.fixed('volume-gallery', (_text, _row, index) =>
        matchingIds.has(table.row(index).node().dataset.volumeId));
    searchBox.addEventListener('input', filterImages);
    for (const radio of viewControls) radio.addEventListener('change', () => {
        if (radio.checked) toggleView(radio.value);
    });
    for (const radio of densityControls) radio.addEventListener('change', () => {
        if (radio.checked) setGridColumns(Number(radio.value));
    });
    root.querySelector('#totalCount').textContent = String(items.length);
    filterImages();
    toggleView(viewControls.find(radio => radio.checked)?.value ?? 'card-view');
    setGridColumns(Number(densityControls.find(radio => radio.checked)?.value ?? 4));
    for (const control of [searchBox, ...viewControls, ...densityControls]) control.disabled = false;
});
