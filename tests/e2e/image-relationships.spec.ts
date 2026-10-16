import { test, expect } from '../support/browser';
import { relationshipImage, rootImage, intermediateImage, unknownPositionImage, segmentationImage } from '../fixtures/scenarios/image-relationships.mjs';

test('image relationships retain ordering, literal positions, zero sizes and named preview navigation', { tag: '@preservation' }, async ({ page }) => {
    await page.goto(`/bioimage-archive/image/${relationshipImage.uuid}`);
    const inputs = page.locator('#viewable_input_images_table');
    await expect(inputs.locator('tbody tr')).toHaveCount(2);
    await expect(inputs.locator('tbody td:nth-child(2)')).toHaveText([rootImage.uuid, intermediateImage.uuid]);
    const uuidHeading = page.locator('#viewable_input_images_table_wrapper')
        .getByRole('columnheader', { name: /UUID/ }).filter({ visible: true });
    await expect(uuidHeading).toHaveCount(1);
    await uuidHeading.click();
    await uuidHeading.click();
    await expect(inputs.locator('tbody td:nth-child(2)')).toHaveText([intermediateImage.uuid, rootImage.uuid]);
    for (const image of [intermediateImage, rootImage]) {
        await expect(inputs.getByRole('link', { name: `View image ${image.uuid}`, exact: true }))
            .toHaveAttribute('href', `/bioimage-archive/image/${image.uuid}`);
    }
    const track = page.locator('#specimen_track_table');
    await expect(track.locator('tbody td:first-child')).toHaveText(['constructor', 'Internal', 'Root']);
    await expect(track.locator('tbody td:nth-child(2)')).toHaveText(['Unclassified image', 'Intermediate & assay', 'Root <sample>']);
    await expect(track.locator('tbody td:nth-child(4)')).toHaveText(['1.00 B', '0.00 B', 'N/A']);
    await expect(track.locator('tbody td').first()).toHaveCSS('padding', '8px 12px');
    await expect(track.locator('tbody td').first()).toHaveCSS('font-size', '14px');
    const position = page.locator('#position_filter_cell select');
    await position.selectOption('constructor');
    await expect(track.locator('tbody tr')).toHaveCount(1);
    await expect(track.getByRole('link', { name: unknownPositionImage.uuid, exact: true })).toBeVisible();
    await position.selectOption('');
    await expect(track.locator('tbody tr')).toHaveCount(3);
    await expect(track.locator('tbody td').first()).toHaveCSS('padding', '8px 12px');
    const segmentation = page.locator('.specimen-track-table').filter({ hasNot: page.locator('#specimen_track_table') });
    await expect(segmentation.locator('tbody td').first()).toHaveCSS('padding', '8px 12px');
    await expect(segmentation.locator('tbody td').first()).toHaveCSS('font-size', '14px');
    await expect(segmentation.locator('tbody td')).toHaveText(['Segmentation', segmentationImage.uuid, segmentationImage.uuid, '10.00 B']);
    await inputs.getByRole('link', { name: `View image ${rootImage.uuid}`, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/image/${rootImage.uuid}$`));
    await expect(page.locator('.specimen-track-table').getByRole('link', { name: relationshipImage.uuid, exact: true })).toBeVisible();
});
