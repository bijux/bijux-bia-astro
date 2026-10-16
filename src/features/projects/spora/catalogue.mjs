/** Apply OR within each filter and AND between independent filter groups. */
export function filterDatasets(datasets, { term = '', cancer = [], modality = [], type = [] } = {}) {
    const query = term.trim().toLowerCase();
    return datasets.filter(dataset => {
        const text = `${dataset.name} ${dataset.citation} ${dataset.cancer.join(' ')}`.toLowerCase();
        return (!query || text.includes(query)) &&
            (!cancer.length || dataset.cancer.some(value => cancer.includes(value))) &&
            (!modality.length || dataset.modalities.some(value => modality.includes(value))) &&
            (!type.length || type.includes(dataset.type));
    });
}

export function getCategoryCounts(datasets, key) {
  const counts = datasets
    .flatMap((d) => d[key])
    .reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, Object.create(null));

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => ({ category, count }));
}
