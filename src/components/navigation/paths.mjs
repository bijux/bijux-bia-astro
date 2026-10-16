/** @param {string} path Navigation destination with optional terminal slashes. */
export const normaliseNavigationPath = path => path.replace(/\/+$/, '') || '/';
