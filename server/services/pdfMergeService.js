'use strict';
// Merges two PDF files into one and writes it to a temp path.
// Keeps quality intact — pdf-lib does lossless page copying.
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Merge an ordered list of PDF file paths into a single PDF.
 * Returns the path to the merged file (written to system temp dir).
 * Caller is responsible for deleting the file when done.
 *
 * @param {string[]} pdfPaths  - Ordered array of PDF file paths to merge
 * @param {string}   outName   - Filename for the output (no path)
 * @returns {Promise<string>}  - Absolute path of the merged PDF
 */
async function mergePDFs(pdfPaths, outName = 'merged.pdf') {
  const validPaths = pdfPaths.filter((p) => p && fs.existsSync(p));
  if (validPaths.length === 0) throw new Error('No valid PDF files provided to merge');
  if (validPaths.length === 1) return validPaths[0]; // nothing to merge

  const merged = await PDFDocument.create();

  for (const filePath of validPaths) {
    const bytes = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  const outBytes = await merged.save({ useObjectStreams: true }); // useObjectStreams reduces file size
  const outPath = path.join(os.tmpdir(), outName);
  fs.writeFileSync(outPath, outBytes);
  return outPath;
}

module.exports = { mergePDFs };
