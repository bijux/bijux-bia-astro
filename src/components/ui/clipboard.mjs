const controls = new WeakMap();

/** Copy commands share pending/error feedback; repeat attempts retain the control's original label. */
export async function copyWithFeedback(control, value, { success = 'URI Copied', duration = 700, write = text => navigator.clipboard.writeText(text) } = {}) {
    if (!control || typeof value !== 'string') return false;
    const previous = controls.get(control);
    if (previous?.pending) return false;
    const state = previous ?? { label: control.textContent, disabled: control.disabled };
    clearTimeout(state.timer);
    state.pending = true;
    controls.set(control, state);
    const owner = control.ownerDocument;
    const hadFocus = owner?.activeElement === control;
    control.disabled = true;
    let copied = false;
    try {
        await write(value);
        copied = true;
        control.textContent = success;
    } catch {
        control.textContent = 'Copy unavailable';
    } finally {
        state.pending = false;
        control.disabled = state.disabled;
        // Native disabling can blur the button; preserve a later deliberate focus move.
        if (hadFocus && control.isConnected && owner.activeElement === owner.body) control.focus();
        state.timer = setTimeout(() => {
            if (controls.get(control) !== state || state.pending) return;
            control.textContent = state.label;
            controls.delete(control);
        }, duration);
    }
    return copied;
}
