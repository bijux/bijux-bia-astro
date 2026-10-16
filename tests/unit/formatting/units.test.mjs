import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBytesToHumanSize, formatFieldName } from '../../../src/formatting/units.mjs';

test('byte labels retain valid units at zero, fractional and larger-than-petabyte boundaries', () => {
    for (const [value, expected] of [[0, '0.00 B'], ['0', '0.00 B'], [0.5, '0.50 B'],
        [1000, '1.00 kB'], [2.5e6, '2.50 MB'], [1e18, '1000.00 PB']]) {
        assert.equal(formatBytesToHumanSize(value), expected);
    }
    for (const value of [undefined, null, '', 'unreported', false, {}, NaN, Infinity, -1]) {
        assert.equal(formatBytesToHumanSize(value), 'Unknown');
    }
});

test('physical facet comparisons and intervals retain units at zero, metre and sub-picometre scales', () => {
    for (const field of ['Physical size (m)', 'Voxel size (m/px)']) {
        for (const [value, expected] of [['>0', '> 0 m'], ['>1', '> 1 m'], ['≥1000', '≥ 1000 m'],
            ['≤-1e-9', '≤ -1 nm'], ['>1e-15', '> 1e-15 m'], ['>1e-400', '> 1e-400 m'],
            ['1e-9-2e-9', '1 nm - 2 nm'],
            ['0-1', '0 m - 1 m'], ['1e-15-2e-15', '1e-15 m - 2e-15 m']]) {
            assert.equal(formatFieldName(field, value), expected, `${field}: ${value}`);
        }
        assert.equal(formatFieldName(field, 0), '0 m');
    }
});

test('plain scientific tokens, malformed intervals and non-numeric facet labels retain their text', () => {
    for (const value of ['1e-9', '1-2-3', 'A-B', 'Not reported']) {
        assert.equal(formatFieldName('Physical size (m)', value), value);
    }
    assert.equal(formatFieldName('Time steps', '1-10'), '1 - 10');
});
