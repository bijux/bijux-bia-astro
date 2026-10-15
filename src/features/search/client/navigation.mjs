/** One active navigation: aborted or late work can never commit after a newer selection. */
export function createSearchNavigation({ load, commit, fail, busy }) {
    let sequence = 0, active, disposed = false;
    return {
        async navigate(url, options) {
            if (disposed) return;
            const current = ++sequence;
            active?.abort();
            const controller = new AbortController();
            active = controller;
            busy(true);
            try {
                const page = await load(url, controller.signal);
                if (current !== sequence || disposed) return;
                commit(page, url, options);
            } catch (error) {
                if (current !== sequence || disposed || controller.signal.aborted) return;
                fail(url, error);
            } finally {
                if (current === sequence && !disposed) busy(false);
            }
        },
        dispose() {
            if (disposed) return;
            disposed = true; sequence++;
            active?.abort(); busy(false);
        },
    };
}
