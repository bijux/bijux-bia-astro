import { parseNumericRange } from "./numeric-ranges.mjs";
export function formatBytesToHumanSize(sizeBytes) {
  var i = sizeBytes == 0 ? 0 : Math.floor(Math.log(sizeBytes) / Math.log(1000));
  return `${Number(sizeBytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`
}

function formatMetresToHumanSize(metres) {
  var i = metres == 0 ? 0 : Math.floor(Math.log(metres) / Math.log(1000)) * -1;
  var formatted = `${Number(metres / Math.pow(1000, i*-1)).toFixed(0)} ${['mm', 'µm', 'nm', "pm"][i-1]}`
  return formatted;
}

function formatValueHumanReadable(fieldName, value) {
  const nValue = Number(value);
  if(Number.isNaN(nValue)) {
    return value;
  }
  if (fieldName.endsWith("(m/px)") || fieldName.endsWith("(m)")) {
    return formatMetresToHumanSize(nValue);
  }
  else if (fieldName.endsWith("(bytes)")) {
    return formatBytesToHumanSize(nValue);
  }
  else {
    return nValue;
  }
}

export function formatFieldName(fieldName, fieldValue) {
  const bIsCompared = fieldValue.startsWith(">") || fieldValue.startsWith("<") || fieldValue.startsWith("≤") || fieldValue.startsWith("≥");
  const range = parseNumericRange(fieldValue);
  if(Number.isFinite(fieldValue)) {
    return formatValueHumanReadable(fieldName, fieldValue);
  }
  else if (bIsCompared) {
    const fieldValueNumeric = fieldValue.slice(1);
    return `${fieldValue[0]} ${formatValueHumanReadable(fieldName, fieldValueNumeric)}`;
  }
  else if (range) {
    const { start, end } = range;
    return `${formatValueHumanReadable(fieldName, start)} - ${formatValueHumanReadable(fieldName, end)}`;
  }
  else {
    return fieldValue;
  }

}

export function formatBytes(value, field){
  return field === "total_size_in_bytes"? formatBytesToHumanSize(value) : value
}

function formatPixelDimension(value, text) {
    if (text === "") {
        if (value != null && value !== 1) {
            return value
        } else {
            return text
        }
    } else {
        if (value != null && value !== 1) {
            return text + " x " + value
        } else {
            return text
        }
    }
}

export function formatPixelDimensions(img_rep) {
    const fields = [ "size_x", "size_y", "size_z"]
    return fields.reduce((text, field) => formatPixelDimension(img_rep[field], text), "") + " px"
}
