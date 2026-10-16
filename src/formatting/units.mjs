import { parseNumericRange } from "./numeric-ranges.mjs";

const byteUnits = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
const metreScales = [
  { symbol: 'm', divisor: 1 }, { symbol: 'mm', divisor: 1e-3 },
  { symbol: 'µm', divisor: 1e-6 }, { symbol: 'nm', divisor: 1e-9 },
  { symbol: 'pm', divisor: 1e-12 },
];

export function formatBytesToHumanSize(sizeBytes) {
  if (!['number', 'string'].includes(typeof sizeBytes) || String(sizeBytes).trim() === '') return 'Unknown';
  const value = Number(sizeBytes);
  if (!Number.isFinite(value) || value < 0) return 'Unknown';
  let index = 0;
  while (index < byteUnits.length - 1 && value >= 1000 ** (index + 1)) index++;
  return `${(value / 1000 ** index).toFixed(2)} ${byteUnits[index]}`;
}

function formatMetresToHumanSize(metres) {
  if (!Number.isFinite(metres)) return 'Unknown';
  if (metres === 0) return '0 m';
  const scale = metreScales.find(({ divisor }) => Math.abs(metres) >= divisor);
  // Preserve smaller values in metres rather than rounding them to zero picometres.
  return scale ? `${(metres / scale.divisor).toFixed(0)} ${scale.symbol}` : `${metres} m`;
}

function formatValueHumanReadable(fieldName, value) {
  const nValue = Number(value);
  if(Number.isNaN(nValue)) {
    return value;
  }
  if (fieldName.endsWith("(m/px)") || fieldName.endsWith("(m)")) {
    // Non-zero authored exponents can underflow Number; retain their text rather than inventing zero.
    if (nValue === 0 && /[1-9]/.test(String(value).split(/[eE]/)[0])) return `${value} m`;
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
  if (typeof fieldValue === 'number') {
    return Number.isFinite(fieldValue) ? formatValueHumanReadable(fieldName, fieldValue) : 'Unknown';
  }
  if (typeof fieldValue !== 'string') return fieldValue;
  const bIsCompared = fieldValue.startsWith(">") || fieldValue.startsWith("<") || fieldValue.startsWith("≤") || fieldValue.startsWith("≥");
  const range = parseNumericRange(fieldValue);
  if (bIsCompared) {
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
