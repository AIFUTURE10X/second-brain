const DEFAULT_MAX_LONG_SIDE = 2000;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MIN_SIZE_BYTES = 1024 * 1024;
const JPEG_TYPE = "image/jpeg";

const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
]);

export interface ImageLike {
  type: string;
  size: number;
}

export interface ImageCompressionOptions {
  maxLongSide?: number;
  quality?: number;
  minSizeBytes?: number;
}

export function shouldCompressImage(
  file: ImageLike,
  options: ImageCompressionOptions = {}
): boolean {
  const minSizeBytes = options.minSizeBytes ?? DEFAULT_MIN_SIZE_BYTES;
  return COMPRESSIBLE_TYPES.has(file.type) && file.size >= minSizeBytes;
}

export function calculateResizeDimensions(
  width: number,
  height: number,
  maxLongSide = DEFAULT_MAX_LONG_SIDE
): { width: number; height: number } {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxLongSide) return { width, height };

  const scale = maxLongSide / longestSide;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function compressedImageName(name: string): string {
  const baseName = name.trim() || "shared-photo";
  const withoutExtension = baseName.replace(/\.[^.]+$/, "");
  return `${withoutExtension}.jpg`;
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image for compression"));
    };
    image.src = objectUrl;
  });
}

export async function compressImageForUpload(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  if (!shouldCompressImage(file, options)) return file;

  try {
    const maxLongSide = options.maxLongSide ?? DEFAULT_MAX_LONG_SIDE;
    const quality = options.quality ?? DEFAULT_QUALITY;
    const image = await fileToImage(file);
    const { width, height } = calculateResizeDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxLongSide
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, JPEG_TYPE, quality);
    });
    if (!compressedBlob || compressedBlob.size >= file.size) return file;

    return new File([compressedBlob], compressedImageName(file.name), {
      type: JPEG_TYPE,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
