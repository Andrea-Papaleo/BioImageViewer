/**
 * Find the bin that contains the percentage of pixels below it
 * @return {number}
 * @param {number} pct
 */
export function findBinOfPercentile(
  histogram: ArrayBuffer,
  pixelCount: number,
  pct: number,
): number {
  const bins = new Uint32Array(histogram);
  const limit = pixelCount * pct;

  let i = 0;
  let count = 0;
  for (i = 0; i < bins.length; ++i) {
    count += bins[i];
    if (count > limit) {
      break;
    }
  }
  return i;
}
export function findBinOfPercentiles(
  histogram: ArrayBuffer,
  pixelCount: number,
  pctMin: number,
  pctMax: number,
): [number, number] {
  const bins = new Uint32Array(histogram);
  const limitMin = pixelCount * pctMin;
  const limitMax = pixelCount * pctMax;

  let minBin = 0;
  let maxBin = 0;
  let i = 0;
  let count = 0;
  for (i = 0; i < bins.length; ++i) {
    count += bins[i];
    if (count <= limitMin) {
      minBin = i + 1;
    }
    if (count > limitMax) {
      maxBin = i;
      break;
    }
  }
  return [minBin, maxBin];
}

// Find bins at 10th / 90th percentile
export function findBestFitBins(
  histogram: ArrayBuffer,
  pixcount: number,
): [number, number] {
  const bins = new Uint32Array(histogram);
  const limit = pixcount / 10;

  let i = 0;
  let count = 0;
  for (i = 1; i < bins.length; ++i) {
    count += bins[i];
    if (count > limit) {
      break;
    }
  }
  const hmin = i;

  count = 0;
  for (i = bins.length - 1; i >= 1; --i) {
    count += bins[i];
    if (count > limit) {
      break;
    }
  }
  const hmax = i;

  return [hmin, hmax];
}

// Find min and max bins attempting to replicate ImageJ's "Auto" button
export function findAutoIJBins(
  histogram: ArrayBuffer,
  pixcount: number,
): [number, number] {
  // note that consecutive applications of this should modify the auto threshold. see:
  // https://github.com/imagej/ImageJ/blob/7746fcb0f5744a7a7758244c5dcd2193459e6e0e/ij/plugin/frame/ContrastAdjuster.java#L816
  const bins = new Uint32Array(histogram);
  const AUTO_THRESHOLD = 5000;
  //  const pixcount = this.imgData.data.length;
  const limit = pixcount / 10;
  const threshold = pixcount / AUTO_THRESHOLD;

  // this will skip the "zero" bin which contains pixels of zero intensity.
  let hmin = bins.length - 1;
  let hmax = 1;
  for (let i = 1; i < bins.length; ++i) {
    if (bins[i] > threshold && bins[i] <= limit) {
      hmin = i;
      break;
    }
  }
  for (let i = bins.length - 1; i >= 1; --i) {
    if (bins[i] > threshold && bins[i] <= limit) {
      hmax = i;
      break;
    }
  }

  if (hmax < hmin) {
    hmin = 0;
    hmax = 255;
  }

  return [hmin, hmax];
}

// // Find min and max bins using a percentile of the most commonly occurring value
// export function findAutoMinMax(
//   histogram: ArrayBuffer,
//   maxBin: number,
// ): [number, number] {
//   const bins = new Uint32Array(histogram);
//   // simple linear mapping cutting elements with small appearence
//   // get 10% threshold
//   const PERCENTAGE = 0.1;
//   const th = Math.floor(bins[maxBin] * PERCENTAGE);
//   let b = 0;
//   let e = bins.length - 1;
//   for (let x = 1; x < bins.length; ++x) {
//     if (bins[x] > th) {
//       b = x;
//       break;
//     }
//   }
//   for (let x = bins.length - 1; x >= 1; --x) {
//     if (bins[x] > th) {
//       e = x;
//       break;
//     }
//   }
//   return [b, e];
// }
