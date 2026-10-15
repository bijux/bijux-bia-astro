import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { copyWithFeedback } from '../../../src/components/ui/clipboard.mjs';

test('copying preserves supplied text, prevents overlapping writes and restores the original label', async () => {
    const button = { textContent: 'Copy URI', disabled: false }, writes = [];
    let finish;
    const write = value => { writes.push(value); return new Promise(resolve => { finish = resolve; }); };
    const operation = copyWithFeedback(button, 'https://example.org/image?x=<value>', { write, duration: 0 });
    assert.equal(button.disabled, true);
    assert.equal(await copyWithFeedback(button, 'ignored', { write }), false);
    finish(); assert.equal(await operation, true);
    assert.deepEqual(writes, ['https://example.org/image?x=<value>']);
    assert.equal(button.textContent, 'URI Copied'); assert.equal(button.disabled, false);
    await delay(5); assert.equal(button.textContent, 'Copy URI');
});

test('rejected copying stays retryable and retries never restore a stale feedback label', async () => {
    const button = { textContent: 'Copy BibTeX', disabled: false };
    assert.equal(await copyWithFeedback(button, 'citation', { write: async () => { throw new Error('Denied'); }, duration: 0 }), false);
    assert.equal(button.textContent, 'Copy unavailable'); assert.equal(button.disabled, false);
    assert.equal(await copyWithFeedback(button, 'citation', { write: async () => {}, success: 'Copied!', duration: 0 }), true);
    assert.equal(button.textContent, 'Copied!');
    await delay(5); assert.equal(button.textContent, 'Copy BibTeX');
    assert.equal(await copyWithFeedback(null, 'unused'), false);
});
