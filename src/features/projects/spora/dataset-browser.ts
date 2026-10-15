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
    let visible = datasets;

    const selected = (name) => checks.filter((x) => x.name === name && x.checked).map((x) => x.value);
    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
    const pillClassMap = {
      tc: 'pill pill--tc',
      roi: 'pill pill--roi',
      wsi: 'pill pill--wsi',
      if: 'pill pill--if',
      codex: 'pill pill--codex',
      imc: 'pill pill--imc',
      orion: 'pill pill--orion',
      mibi: 'pill pill--mibi',
      'h&e': 'pill pill--he',
    };
    const pillClass = (value) => pillClassMap[String(value).toLowerCase()] || 'pill';
    const renderPill = (value) => `<span class="${escapeHtml(pillClass(value))}">${escapeHtml(value)}</span>`;
    const renderCancers = (cancers) => cancers.map(escapeHtml).join(', ');
    const renderModalities = (dataset) => `${dataset.modalities.map(renderPill).join(' ')}${dataset.hasHE ? ` ${renderPill('H&E')}` : ''}`;
    const buildRcloneCommand = (name) => `rclone copy ":s3,endpoint='https://livingobjects.ebi.ac.uk',secret_access_key=:bioimaging-01-pub/spora-submissions/${name}" ./${name} -P`;
    const buildDownloadCommandBlock = (selectedName) => selectedName ? buildRcloneCommand(selectedName) : '';
    function render() {
      const term = search.value.trim().toLowerCase();
      const cancer = selected('cancer');
      const modality = selected('modality');
      const type = selected('type');
      visible = filterDatasets(datasets, { term, cancer, modality, type });
      body.innerHTML = visible.map((d) => `<tr class="vf-table__row"><td class="vf-table__cell"><strong>${escapeHtml(d.name)}</strong><p><a class="vf-link" href="${escapeHtml(d.publicationUrl)}" target="_blank"><small>${escapeHtml(d.citation)}</small></a></p></td><td class="vf-table__cell">${d.patients.toLocaleString()}</td><td class="vf-table__cell">${d.images.toLocaleString()}</td><td class="vf-table__cell">${renderPill(d.type)}</td><td class="vf-table__cell">${renderModalities(d)}</td><td class="vf-table__cell">${renderCancers(d.cancer)}</td><td class="vf-table__cell"><button class="vf-button vf-button--link row-button cite" data-name="${escapeHtml(d.name)}">Cite</button><button class="vf-button vf-button--link row-button download" data-name="${escapeHtml(d.name)}">Download</button></td></tr>`).join('');
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
