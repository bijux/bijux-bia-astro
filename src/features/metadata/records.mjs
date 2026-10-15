
export function getSimpleAttributeValue(obj, attrName) {
    // For attributes of structure: { "name": "AttributeName", "value": { "AttributeName": <value> } }
    return obj?.additional_metadata
      ?.find(attr => attr.name === attrName)
      ?.value[attrName] ?? null;
}

export function getDatasetStatsByUUID(study) {
    return aggregateDatasetStats(study?.dataset || []);
}

function aggregateDatasetStats(datasets) {
    const dataset_uuids = []
    for (var dataset of datasets) {
      dataset_uuids.push([dataset.uuid,dataset.file_reference_count,dataset.title])
    }
    return dataset_uuids
}

export function getAnnotationType(datasets) {
  const annotationTypes = new Set();

  datasets.forEach(dataset => {
    // 1. Process annotation_type from additional_metadata
    const annotationMetaData = dataset.additional_metadata?.find(md => md.name === "annotation_type");

    if (annotationMetaData) {
      if (Array.isArray(annotationMetaData.value?.annotation_type)) {
        // Case 1: It's an array of arrays!
        // We need to iterate through the outer array, and then through the inner array.
        annotationMetaData.value.annotation_type.forEach(innerArray => {
          if (Array.isArray(innerArray)) {
            innerArray.forEach(type => {
              if (typeof type === 'string') {
                annotationTypes.add(type.replace(/_/g, ' ').trim().toLowerCase());
              }
            });
          } else if (typeof innerArray === 'string') {
            annotationTypes.add(innerArray.replace(/_/g, ' ').trim().toLowerCase());
          }
        });
      } else if (typeof annotationMetaData.value === 'string') {
        // Case 2: It's a direct string (e.g., "type1,type2" or just "type1")
        annotationMetaData.value.split(',').forEach(typePart => {
          const cleanedType = typePart.replace(/_/g, ' ').trim().toLowerCase();
          if (cleanedType) {
            annotationTypes.add(cleanedType);
          }
        });
      }
    }

    // 2. Fallback to method_type from annotation_process
    // This comes from the logic in [accessionID].astro page
    if (dataset.annotation_process && dataset.annotation_process.length > 0) {
      dataset.annotation_process.forEach(process => {
        if (process.method_type && Array.isArray(process.method_type) && process.method_type.length > 0) {
          process.method_type.forEach(type => {
            if (typeof type === 'string') {
              const cleanedType = type.replace(/_/g, ' ').trim().toLowerCase();
              if (cleanedType) {
                annotationTypes.add(cleanedType);
              }
            }
          });
        }
      });
    }
  });

  // Convert Set to Array and sort for consistent display
  return Array.from(annotationTypes).sort();
}

export function getMetadataValue(mdArray, key, field = null) {
  const md = mdArray?.find(md => md.name === key)?.value;
  return field && md ? md[field]?.[0] : md;
}
