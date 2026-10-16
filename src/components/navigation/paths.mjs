/** Treat an optional terminal slash as the same navigation destination. */
export const normaliseNavigationPath = path => path.replace(/\/+$/, '') || '/';
