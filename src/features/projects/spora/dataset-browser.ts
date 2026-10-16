import { copyWithFeedback } from "../../../components/ui/clipboard.mjs";
import { filterDatasets } from "./catalogue.mjs";
  const root = document.querySelector<HTMLElement>('.browser');
  if (root) {
    const datasets = JSON.parse(root.dataset.datasets || '[]');
    const body = root.querySelector('tbody');
    const count = root.querySelector<HTMLElement>('.count');
    const empty = root.querySelector<HTMLElement>('.empty');
    const search = root.querySelector<HTMLInputElement>('#dataset-search');
    const checks = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const citeDialog = document.querySelector<HTMLDialogElement>('.cite-dialog');
    const globusDialog = document.querySelector<HTMLDialogElement>('.globus-dialog');
    const rows = new Map<object, HTMLTableRowElement>(datasets.map((dataset, index) => [dataset, body.rows[index]]));

    const selected = (name) => checks.filter((x) => x.name === name && x.checked).map((x) => x.value);
    const buildRcloneCommand = (name) => `rclone copy ":s3,endpoint='https://livingobjects.ebi.ac.uk',secret_access_key=:bioimaging-01-pub/spora-submissions/${name}" ./${name} -P`;
    const buildDownloadCommandBlock = (selectedName) => selectedName ? buildRcloneCommand(selectedName) : '';
    function render() {
      const term = search.value.trim().toLowerCase();
      const cancer = selected('cancer');
      const modality = selected('modality');
      const type = selected('type');
      const visible = filterDatasets(datasets, { term, cancer, modality, type });
      // Retain the server's content and controls instead of rendering a second HTML template.
      body.replaceChildren(...visible.map(dataset => rows.get(dataset)));
      count.textContent = visible.length;
      empty.hidden = visible.length !== 0;
    }
    search.addEventListener('input', render);
    checks.forEach((check) => check.addEventListener('change', render));
    root.querySelector('.clear').addEventListener('click', () => { search.value = ''; checks.forEach((x) => x.checked = false); render(); });
    body.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.cite') : null;
      if (!button) return;
      const dataset = datasets.find((d) => d.name === button.dataset.name);
      citeDialog.querySelector('code').textContent = dataset?.bibtex || '';
      citeDialog.showModal();
    });
    body.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.download') : null;
      if (!button) return;
      globusDialog.querySelector('code').textContent = buildDownloadCommandBlock(button.dataset.name);
      globusDialog.showModal();
    });
    document.querySelector('.copy-commands').addEventListener('click', event => copyWithFeedback(event.currentTarget, globusDialog.querySelector('code').textContent, { success: 'Copied!' }));
    document.querySelector('.copy-citation').addEventListener('click', event => copyWithFeedback(event.currentTarget, citeDialog.querySelector('code').textContent, { success: 'Copied!' }));
    render();
  }
