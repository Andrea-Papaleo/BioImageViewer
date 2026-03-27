# TIFF Explorer

A browser-based scientific image viewer for multi-dimensional image files. Supports multi-channel, z-stack, and time-series data with interactive visualization, per-channel color mapping, and contrast adjustment.

## Supported Formats

- **TIFF** — including multi-frame OME-TIFF with XML metadata and ImageJ format
- **PNG / JPEG** — standard single images
- **DICOM**, **CZI** — in progress

## Development

```bash
npm install
npm run dev
```

Other commands:

```bash
npm run build    # Type-check + bundle
npm run lint     # ESLint
npm run test     # Vitest (watch mode)
npm run preview  # Preview production build
```

## Architecture

Files are decoded in a Web Worker and pixel buffers stored in IndexedDB, keeping large datasets out of main-thread memory. Redux holds metadata and UI state; the rendering pipeline composites multi-channel images on the fly using per-channel LUTs (colormap + contrast ramp).
