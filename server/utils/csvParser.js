/**
 * Lightweight RFC-4180 compliant CSV parser.
 * Supports:
 * - Commas inside quoted strings (e.g. "Array, Hash Table")
 * - Escaped double quotes ("" inside quoted fields)
 * - Both CRLF (\r\n) and LF (\n) line endings
 * - Empty line trimming and whitespace normalization
 */

/**
 * Parses raw CSV string content into an array of objects keyed by header names.
 * @param {string} csvText - The raw CSV content
 * @returns {Array<Record<string, string>>}
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== "string") {
    return [];
  }

  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped double quote ("")
        currentField += '"';
        i++; // skip next quote
      } else {
        // Toggle quote boundary
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      // Row separator
      if (char === "\r" && nextChar === "\n") {
        i++; // Skip \n in CRLF
      }
      currentRow.push(currentField.trim());
      currentField = "";

      // Push non-empty row
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  // Push remaining field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((h) => h.trim());
  const records = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const record = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c] !== undefined ? row[c] : "";
    }
    records.push(record);
  }

  return records;
}
