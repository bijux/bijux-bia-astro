import { escapeHtml } from '../../security/html.mjs';

/** Keep label precedence, path order and Unicode text intact in a redrawable table cell. */
export function renderFilePaths(image) {
    const value = image.label || image.file_path || '';
    const paths = (Array.isArray(value) ? value : [value]).filter(Boolean);
    if (!paths.length) return '';
    const render = (path, index) => `<div>${(String(path).match(/[\s\S]{1,40}/gu) ?? [])
        .map(escapeHtml).join('<wbr>')}${index < paths.length - 1 ? ',' : ''}</div>`;
    const visible = paths.slice(0, 2).map(render).join('');
    if (paths.length <= 2) return `<div class="file-path">${visible}</div>`;
    return `<div class="file-path">${visible}<div class="file-path-extra" hidden>${paths.slice(2)
        .map((path, index) => render(path, index + 2)).join('')}</div>
        <button type="button" class="file-path-toggle vf-button vf-button--link" aria-expanded="false">Expand</button></div>`;
}
