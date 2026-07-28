# Qjo Step 7: OCR + File Intelligence

Version: `qjo-ocr-file-intelligence-2026-07-20-16`

## Completed
Added OCR support for images and scanned PDFs.

## Image OCR
Added Tesseract.js from jsDelivr:
```html
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js" defer></script>
```

When an image is uploaded:
1. Qjo compresses the image for vision analysis.
2. Qjo attempts OCR in Arabic + English:
   ```text
   ara+eng
   ```
3. If text is found, it is attached as extracted text:
   ```text
   OCR text extracted from image (...)
   ```
4. The image remains available for vision analysis.

## Scanned PDF OCR fallback
`readPdfFile()` now:
1. Tries embedded PDF text extraction first.
2. If text is missing or too short, renders up to 4 pages.
3. Runs OCR on rendered pages.
4. Marks extraction method in the attachment context:
   ```text
   Extraction method: OCR fallback on rendered pages
   ```

## CSP updates
Added worker support for OCR:
```text
worker-src 'self' blob: https://cdn.jsdelivr.net
```

Added `cdn.jsdelivr.net` to connect-src for OCR worker/language data.

## Preserved
- Auth untouched.
- Prompt preserved.
- Search/source cards preserved.
- Code ZIP builder preserved.
- Memory controls preserved.
- Chat management preserved.
- Location/time awareness preserved.
- Diagnostic page preserved.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-ocr-file-intelligence-2026-07-20-16"
```

Local page includes:
```html
https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
```

CSP includes:
```text
worker-src 'self' blob: https://cdn.jsdelivr.net
```
