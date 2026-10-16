import { boundedMap } from '../../../api/http.mjs';
import { getFileReferences } from '../../../api/file-references.mjs';
import { escapeHtml } from '../../../security/html.mjs';
import { copyWithFeedback } from '../../../components/ui/clipboard.mjs';
import { selectTranscriptFiles } from './transcript-records.mjs';

type Dataset = { uuid: string; title?: string };
type FileRecord = { uuid?: string; file_path?: string; uri?: string };

/** Keep discovery order, current selection and request ownership independent of table redraws. */
export function initialiseTranscriptFiles(root: HTMLElement) {
    const datasets: Dataset[] = JSON.parse(root.dataset.datasets!);
    const api = root.dataset.apiUrl!;
    const selector = root.querySelector<HTMLSelectElement>('select')!;
    const discoveryStatus = root.querySelector<HTMLElement>('[data-discovery-status]')!;
    const filesStatus = root.querySelector<HTMLElement>('[data-files-status]')!;
    const retryDiscovery = root.querySelector<HTMLButtonElement>('[data-retry-discovery]')!;
    const retryFiles = root.querySelector<HTMLButtonElement>('[data-retry-files]')!;
    const tableContainer = root.querySelector<HTMLElement>('[data-file-table]')!;
    const table = root.querySelector<HTMLTableElement>('table')!;
    const eligible = new Set<string>();
    let pending = datasets;
    let activeRequest: AbortController | undefined;
    let generation = 0;

    function showFiles(files: FileRecord[]) {
        if ($.fn.dataTable.isDataTable(table)) $(table).DataTable().destroy();
        table.replaceChildren();
        tableContainer.hidden = false;
        $(table).DataTable({
            data: files,
            columns: [
                { data: 'uuid', defaultContent: '', title: 'File UUID', render: value => escapeHtml(value) },
                { data: 'file_path', defaultContent: '', title: 'File Name', render: value => escapeHtml(value) },
                { data: 'uri', defaultContent: '', title: 'Actions', render: value => typeof value === 'string' && value
                    ? `<button type="button" class="copy-btn bia-button" data-uri="${escapeHtml(value)}">Copy Url</button>` : 'URL not reported' },
            ],
            pageLength: 25, searching: true, ordering: true, processing: true, scrollX: true,
            columnDefs: [{ type: 'natural', targets: 0 }],
        });
        filesStatus.textContent = files.length ? '' : 'No transcript files were returned for this dataset.';
    }

    async function loadSelected() {
        const uuid = selector.value;
        if (!eligible.has(uuid)) return;
        activeRequest?.abort();
        const controller = activeRequest = new AbortController();
        const request = ++generation;
        if (document.activeElement === retryFiles) selector.focus();
        retryFiles.hidden = true;
        tableContainer.hidden = true;
        tableContainer.setAttribute('aria-busy', 'true');
        filesStatus.textContent = 'Loading transcript files…';
        try {
            const files = await getFileReferences(api, uuid, { signal: controller.signal });
            if (request !== generation) return;
            showFiles(selectTranscriptFiles(files));
        } catch {
            if (request !== generation) return;
            filesStatus.textContent = 'Transcript files are temporarily unavailable. Please try again.';
            retryFiles.hidden = false;
        } finally {
            if (request === generation) tableContainer.removeAttribute('aria-busy');
        }
    }

    async function discover() {
        retryDiscovery.hidden = true;
        retryDiscovery.disabled = true;
        discoveryStatus.textContent = 'Checking datasets for transcript files…';
        const failed: Dataset[] = [];
        const results = await boundedMap(pending, async (dataset: Dataset) => {
            try {
                const files = selectTranscriptFiles(await getFileReferences(api, dataset.uuid));
                if (files.length) eligible.add(dataset.uuid);
                return { uuid: dataset.uuid, files };
            } catch { failed.push(dataset); return null; }
        });
        pending = failed;
        const previous = selector.value;
        selector.replaceChildren(new Option('Select a Dataset', '', false, false));
        selector.options[0].disabled = true;
        for (const dataset of datasets.filter(dataset => eligible.has(dataset.uuid))) {
            selector.add(new Option(dataset.title || dataset.uuid, dataset.uuid));
        }
        selector.disabled = !eligible.size;
        if (eligible.has(previous)) selector.value = previous;
        else if (eligible.size) {
            selector.selectedIndex = 1;
            const initial = results.find(result => result?.uuid === selector.value);
            if (initial) showFiles(initial.files);
        }
        discoveryStatus.textContent = failed.length
            ? 'Some datasets could not be checked. Retry to include any missing datasets.'
            : eligible.size ? '' : 'No transcript files were found in the returned dataset inventories.';
        retryDiscovery.hidden = !failed.length;
        retryDiscovery.disabled = false;
    }

    root.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button.copy-btn') : null;
        if (target && root.contains(target)) void copyWithFeedback(target, target.dataset.uri!, { success: 'URL Copied' });
    });
    selector.addEventListener('change', () => { void loadSelected(); });
    retryFiles.addEventListener('click', () => { void loadSelected(); });
    retryDiscovery.addEventListener('click', () => { void discover(); });
    void discover();
}
