/** Preserve the full catalogue; append names absent from it to exercise unknown-category fallbacks. */
export function withCategoryBoundaries(datasets) {
    return [...datasets, ...['constructor', '__proto__', 'toString'].map(category => ({
        ...datasets[0], name: `Category ${category}`, type: category, modalities: [category], cancer: [category], hasHE: false,
    }))];
}
