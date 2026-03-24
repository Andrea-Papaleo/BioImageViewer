import { fromArrayBuffer, GeoTIFFImage } from "geotiff";
import type {
  ITiffReader,
  OMEDims,
  TiffIFDEntry,
  AnalyzeTiffOutput,
} from "./types";
import { XMLParser } from "fast-xml-parser";
import { parseError } from "../../utils";

function trimNull(xml: string | undefined): string | undefined {
  // trim trailing unicode zeros?
  return xml && xml.trim().replace(/\0/g, "").trim();
}

function getOME(xml: string | undefined): Record<string, any> | undefined {
  if (typeof xml !== "string") {
    return undefined;
  }

  const parser = new XMLParser({
    ignoreAttributes: false, // keep attributes like SizeT, SizeC
    attributeNamePrefix: "", // no @_ prefix — cleaner access
  });

  try {
    const parsed = parser.parse(xml);
    return parsed?.OME;
  } catch {
    return undefined;
  }
}
const defaultOMEDims: Partial<OMEDims> = {
  name: undefined,
  sizex: 0,
  sizey: 0,
  sizez: undefined,
  sizec: undefined,
  sizet: undefined,
  unit: undefined,
  pixeltype: undefined,
  dimensionorder: undefined,
  pixelsizex: undefined,
  pixelsizey: undefined,
  pixelsizez: undefined,
  channelnames: undefined,
};

function getOMEDims(imageObj: Record<string, any>): Partial<OMEDims> {
  const dims = defaultOMEDims;
  const pixels = imageObj.Pixels;

  dims.name = imageObj.Name ?? "";
  dims.sizex = Number(pixels.SizeX);
  dims.sizey = Number(pixels.SizeY);
  dims.sizez = Number(pixels.SizeZ);
  dims.sizec = Number(pixels.SizeC);
  dims.sizet = Number(pixels.SizeT);
  dims.unit = pixels.PhysicalSizeXUnit ?? "";
  dims.pixeltype = pixels.Type ?? "";
  dims.dimensionorder = pixels.DimensionOrder ?? "xyzct";
  dims.pixelsizex = Number(pixels.PhysicalSizeX);
  dims.pixelsizey = Number(pixels.PhysicalSizeY);
  dims.pixelsizez = Number(pixels.PhysicalSizeZ);

  // Channel can be single object or array
  const channels = Array.isArray(pixels.Channel)
    ? pixels.Channel
    : pixels.Channel
      ? [pixels.Channel]
      : [];

  dims.channelnames = channels.map(
    (ch: any, i: number) => ch.Name ?? ch.ID ?? `Channel${i}`,
  );

  return dims;
}

function getImageJDims(imageDescription: string): Partial<OMEDims> | undefined {
  const splitDescription = imageDescription.split("\n");

  if (splitDescription[0].includes("ImageJ")) {
    const dims = defaultOMEDims;
    splitDescription.forEach((detail) => {
      const [key, val] = detail.split("=");
      switch (key) {
        case "channels":
          dims.sizec = Number(val);
          break;
        case "slices":
          dims.sizez = Number(val);
          break;
        case "unit":
          dims.unit = val;
          break;
        default:
          break;
      }
    });
    console.log(dims);
    return dims;
  }
}
/**
 * TiffAnalyzer
 *
 * Parses TIFF file headers to detect multi-frame images
 * and infer the frame interpretation (time series, z-stack, etc.).
 *
 * This runs in a Web Worker via the analyzeTiff task.
 * It only reads headers — it does NOT decode pixel data.
 *
 * TIFF Structure Basics:
 * - Header: 8 bytes (byte order + magic number + first IFD offset)
 * - IFD: array of tag entries, each pointing to image data
 * - Multi-frame TIFFs chain IFDs (each IFD has "next IFD offset")
 *
 * Detection Heuristics:
 * 1. OME-TIFF: XML in ImageDescription tag → parse for dimensions
 * 2. DateTime tags with consistent intervals → time series
 * 3. Z-spacing metadata → z-stack
 * 4. Multiple IFDs with same dimensions → likely time/z series
 * 5. Different dimensions across IFDs → separate images
 */
export class TiffReader implements ITiffReader {
  /**
   * Analyze a TIFF file buffer without fully decoding it.
   *
   * Steps:
   * 1. Parse TIFF header (byte order, first IFD offset)
   * 2. Walk IFD chain, counting frames
   * 3. Extract metadata tags from each IFD
   * 4. Apply heuristics to suggest interpretation
   */
  analyze(buffer: ArrayBuffer): AnalyzeTiffOutput {
    const view = new DataView(buffer);

    // Parse header
    const byteOrder = TiffReader.parseByteOrder(view);
    if (!byteOrder) {
      return TiffReader.unknownResult();
    }

    const littleEndian = byteOrder === "little";

    // Verify TIFF magic number (42)
    const magic = view.getUint16(2, littleEndian);
    if (magic !== 42) {
      return TiffReader.unknownResult();
    }

    // Get first IFD offset
    let ifdOffset = view.getUint32(4, littleEndian);

    // Walk IFD chain
    const ifds: TiffIFDEntry[] = [];
    const maxIFDs = 10000; // Safety limit

    while (ifdOffset !== 0 && ifds.length < maxIFDs) {
      if (ifdOffset >= buffer.byteLength) break;

      const ifd = TiffReader.parseIFD(view, ifdOffset, littleEndian);
      ifds.push(ifd.entry);
      ifdOffset = ifd.nextOffset;
    }

    const frameCount = ifds.length;

    if (frameCount <= 1) {
      return {
        frameCount,
        isMultiFrame: false,
        suggestedType: "unknown",
        confidence: 1.0,
        metadata: {},
      };
    }

    // Apply detection heuristics
    return TiffReader.classifyFrames(ifds);
  }
  async analyzeGeoTiff(buffer: ArrayBuffer): Promise<AnalyzeTiffOutput> {
    let output: AnalyzeTiffOutput;
    try {
      const tiff = await fromArrayBuffer(buffer);
      const imageCount = await tiff.getImageCount();
      //console.log("Image Count: \n", imageCount);
      //console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
      const image: GeoTIFFImage = await tiff.getImage();

      const tiffFileDirectory = image.getFileDirectory();
      //console.log("Tiff File Directory: ", tiffFileDirectory);
      //console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
      const image0DescriptionRaw: string = (await tiffFileDirectory.loadValue(
        "ImageDescription",
      )) as string;

      //console.log("Raw image 0 description: \n", image0DescriptionRaw);
      //console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
      // Get rid of null terminator, if it's there (`JSON.parse` doesn't know what to do with it)
      const image0Description = trimNull(image0DescriptionRaw);
      //console.log("Image 0 description: \n", image0Description);
      //console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
      const omeEl = getOME(image0Description);
      let dims: Partial<OMEDims>;
      if (omeEl !== undefined) {
        const image0El = Array.isArray(omeEl.Image)
          ? omeEl.Image[0]
          : omeEl.Image;
        //console.log("image 0 El: \n", image0El);
        //console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
        dims = getOMEDims(image0El);
        // console.log("OME dims: \n", dims);
        //console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
        output = {
          frameCount: imageCount,
          isMultiFrame: true,
          suggestedType: "unknown",
          confidence: 1.0,
          OMEDims: dims,
          metadata: {},
        };
      } else {
        console.warn(
          "Could not read OME-TIFF metadata from file. Doing our best with base TIFF metadata.",
        );
        dims = defaultOMEDims;
        let shape: number[] = [];
        if (typeof image0Description === "string") {
          try {
            const imageJDims = getImageJDims(image0Description);
            if (imageJDims) dims = imageJDims;
            else {
              const parsed = JSON.parse(image0Description);
              if ("shape" in parsed) {
                shape = parsed.shape as number[];
              }
            }

            // if (Array.isArray(description.shape)) {
            //   shape = description.shape;
            // }
          } catch (_e) {
            console.warn("Could not parse image description: ", _e);
          }
        }

        // if `ImageDescription` is valid JSON with a `shape` field, we expect it to be an array of [t?, c?, z?, y, x].
        dims.sizex = shape[shape.length - 1] ?? image.getWidth();
        dims.sizey = shape[shape.length - 2] ?? image.getHeight();
        if (imageCount > 1) {
          output = {
            frameCount: imageCount,
            isMultiFrame: true,
            suggestedType: "unknown",
            confidence: 1.0,
            OMEDims: dims,
            metadata: {},
          };
        } else {
          output = {
            frameCount: imageCount,
            isMultiFrame: false,
            suggestedType: "unknown",
            confidence: 1.0,
            metadata: { ...dims },
          };
        }
      }
    } catch (error) {
      throw parseError(error);
    }
    return output;
  }

  private static parseByteOrder(view: DataView): "little" | "big" | null {
    const byte0 = view.getUint8(0);
    const byte1 = view.getUint8(1);

    if (byte0 === 0x49 && byte1 === 0x49) return "little"; // "II"
    if (byte0 === 0x4d && byte1 === 0x4d) return "big"; // "MM"
    return null;
  }

  private static parseIFD(
    view: DataView,
    offset: number,
    littleEndian: boolean,
  ): { entry: TiffIFDEntry; nextOffset: number } {
    const entryCount = view.getUint16(offset, littleEndian);
    const entry: TiffIFDEntry = {
      width: 0,
      height: 0,
      bitsPerSample: [],
      samplesPerPixel: 1,
    };
    console.log("Tiff Analyzer Service: parseIFD");
    for (let i = 0; i < entryCount; i++) {
      const tagOffset = offset + 2 + i * 12;
      if (tagOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(tagOffset, littleEndian);
      const type = view.getUint16(tagOffset + 2, littleEndian);
      const count = view.getUint32(tagOffset + 4, littleEndian);
      const valueOffset = tagOffset + 8;

      switch (tag) {
        case 256: // ImageWidth
          entry.width = TiffReader.readValue(
            view,
            type,
            valueOffset,
            littleEndian,
          );
          break;
        case 257: // ImageLength (height)
          entry.height = TiffReader.readValue(
            view,
            type,
            valueOffset,
            littleEndian,
          );
          break;
        case 258: // BitsPerSample
          entry.bitsPerSample = [
            TiffReader.readValue(view, type, valueOffset, littleEndian),
          ];
          break;
        case 277: // SamplesPerPixel
          entry.samplesPerPixel = TiffReader.readValue(
            view,
            type,
            valueOffset,
            littleEndian,
          );
          break;
        case 270: // ImageDescription
          entry.imageDescription = TiffReader.readString(
            view,
            valueOffset,
            count,
            littleEndian,
          );
          break;
        case 306: // DateTime
          entry.dateTime = TiffReader.readString(
            view,
            valueOffset,
            count,
            littleEndian,
          );
          break;
        case 305: // Software
          entry.software = TiffReader.readString(
            view,
            valueOffset,
            count,
            littleEndian,
          );
          break;
      }

      //console.log("Entry ", i, " : ", entry);
    }

    // Next IFD offset
    const nextOffsetPos = offset + 2 + entryCount * 12;
    const nextOffset =
      nextOffsetPos + 4 <= view.byteLength
        ? view.getUint32(nextOffsetPos, littleEndian)
        : 0;

    return { entry, nextOffset };
  }

  private static readValue(
    view: DataView,
    type: number,
    offset: number,
    littleEndian: boolean,
  ): number {
    switch (type) {
      case 1:
        return view.getUint8(offset); // BYTE
      case 3:
        return view.getUint16(offset, littleEndian); // SHORT
      case 4:
        return view.getUint32(offset, littleEndian); // LONG
      default:
        return view.getUint32(offset, littleEndian);
    }
  }

  private static readString(
    view: DataView,
    valueOffset: number,
    count: number,
    littleEndian: boolean,
  ): string {
    // If string is <= 4 bytes, it's inline; otherwise value is an offset
    let strOffset = valueOffset;
    if (count > 4) {
      strOffset = view.getUint32(valueOffset, littleEndian);
    }

    if (strOffset + count > view.byteLength) return "";

    const bytes = new Uint8Array(view.buffer, strOffset, Math.min(count, 256));
    return new TextDecoder().decode(bytes).replace(/\0/g, "");
  }

  private static classifyFrames(ifds: TiffIFDEntry[]): AnalyzeTiffOutput {
    const frameCount = ifds.length;
    console.log("IFDs: \n");
    ifds.forEach((ifd) => {
      console.log(ifd);
    });
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
    const metadata: AnalyzeTiffOutput["metadata"] = {};

    // Check for OME-TIFF
    const firstDesc = ifds[0].imageDescription ?? "";
    console.log("First Desc: \n:", firstDesc);
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
    if (firstDesc.includes("<OME") || firstDesc.includes("ome.xsd")) {
      // OME-TIFF — try to parse dimensions from XML
      return TiffReader.parseOMEMetadata(firstDesc, frameCount);
    }

    // Check if all frames have same dimensions
    const allSameDims = ifds.every(
      (ifd) => ifd.width === ifds[0].width && ifd.height === ifds[0].height,
    );
    console.log("All same Dims: \n", allSameDims);
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

    if (!allSameDims) {
      return {
        frameCount,
        isMultiFrame: true,
        suggestedType: "unknown",
        confidence: 0.3,
        metadata,
      };
    }

    // Check for DateTime tags with consistent intervals
    const dateTimes = ifds
      .map((ifd) => ifd.dateTime)
      .filter((dt): dt is string => !!dt);
    console.log("Date Times: \n", dateTimes);
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
    if (dateTimes.length > 1) {
      metadata.dateTime = dateTimes;
      return {
        frameCount,
        isMultiFrame: true,
        suggestedType: "timeSeries",
        confidence: 0.7,
        metadata,
      };
    }

    // Default: same dimensions, no time info — could be z-stack or time
    return {
      frameCount,
      isMultiFrame: true,
      suggestedType: "unknown",
      confidence: 0.3,
      metadata,
    };
  }

  private static parseOMEMetadata(
    xml: string,
    frameCount: number,
  ): AnalyzeTiffOutput {
    // Basic OME XML parsing for SizeT, SizeZ, SizeC
    const sizeT = TiffReader.extractXMLAttr(xml, "SizeT");
    const sizeZ = TiffReader.extractXMLAttr(xml, "SizeZ");
    const sizeC = TiffReader.extractXMLAttr(xml, "SizeC");
    console.log(
      "Parsed OME: \n",
      `sizeT: ${sizeT} sizeZ: ${sizeZ} sizeC: ${sizeC}`,
    );
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
    if (sizeT && parseInt(sizeT) > 1) {
      return {
        frameCount,
        isMultiFrame: true,
        suggestedType: "timeSeries",
        confidence: 0.95,
        metadata: {},
      };
    }

    if (sizeZ && parseInt(sizeZ) > 1) {
      return {
        frameCount,
        isMultiFrame: true,
        suggestedType: "zStack",
        confidence: 0.95,
        metadata: { zSpacing: undefined },
      };
    }

    if (sizeC && parseInt(sizeC) > 1) {
      return {
        frameCount,
        isMultiFrame: true,
        suggestedType: "channels",
        confidence: 0.9,
        metadata: {},
      };
    }

    return {
      frameCount,
      isMultiFrame: true,
      suggestedType: "unknown",
      confidence: 0.5,
      metadata: {},
    };
  }

  private static extractXMLAttr(xml: string, attr: string): string | null {
    const regex = new RegExp(`${attr}="([^"]*)"`, "i");
    const match = xml.match(regex);
    return match?.[1] ?? null;
  }

  private static unknownResult(): AnalyzeTiffOutput {
    return {
      frameCount: 1,
      isMultiFrame: false,
      suggestedType: "unknown",
      confidence: 0,
      metadata: {},
    };
  }
}
