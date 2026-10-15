/** Physical image extent is the pixel count multiplied by the voxel pitch in metres. */
export function imageSizeMicrometres(rep) {
    return ['x', 'y'].map(axis => {
        const count = rep?.[`size_${axis}`], pitch = rep?.[`voxel_physical_size_${axis}`];
        const extent = count * pitch * 1e6;
        return Number.isFinite(count) && count >= 0 && Number.isFinite(pitch) && pitch >= 0 && Number.isFinite(extent)
            ? extent.toPrecision(2) : 'Not reported';
    });
}
