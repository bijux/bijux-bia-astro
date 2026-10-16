import assert from 'node:assert/strict';
import test from 'node:test';
import { imagePositionLabel, isRootImage } from '../../../src/features/images/relationships/position.mjs';

test('relationship positions retain supplied labels and require explicit root ancestry', () => {
    for (const [position, expected] of [['internal', 'Internal'], ['terminal', 'Terminal'],
        ['segmentation', 'Segmentation'], ['constructor', 'constructor'], ['toString', 'toString'],
        ['custom <position>', 'custom <position>'], [undefined, undefined], [null, null]]) {
        const image = Object.freeze({ specimen_track_position: position, upstream_image_uuids: Object.freeze(['ancestor']) });
        assert.equal(isRootImage(image), false);
        assert.equal(imagePositionLabel(image), expected);
    }
    for (const ancestors of [undefined, null]) {
        const image = Object.freeze({ specimen_track_position: 'terminal', upstream_image_uuids: ancestors });
        assert.equal(isRootImage(image), false);
        assert.equal(imagePositionLabel(image), 'Terminal');
    }
    const root = Object.freeze({ specimen_track_position: 'terminal', upstream_image_uuids: Object.freeze([]),
        segmentation_image_uuids: Object.freeze(['mask']) });
    assert.equal(isRootImage(root), true);
    assert.equal(imagePositionLabel(root), 'Root');
});
