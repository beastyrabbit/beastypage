/**
 * Image loading and processing utilities
 */

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 1200; // Max width/height for processing

/**
 * Create an HTMLImageElement from a local File after validating size and MIME type.
 *
 * @param file - The image File to load
 * @returns The loaded `HTMLImageElement`
 * @throws Error if `file.size` exceeds 10 MB
 * @throws Error if `file.type` is not one of: PNG, JPEG, WebP, or GIF
 * @throws Error if reading the file or decoding the image fails
 */
export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Image file is too large (max 10MB)");
  }

  const validTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid image format. Use PNG, JPEG, WebP, or GIF.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Loads an image from the provided URL and resolves when it has finished loading.
 *
 * The created image has its `crossOrigin` attribute set to `"anonymous"` to allow CORS-safe canvas operations.
 *
 * @param url - The source URL of the image
 * @returns The loaded `HTMLImageElement`
 */
export async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Failed to load image from URL. Try downloading it first."));
    img.src = url;
  });
}

/**
 * Create a PNG data URL of the provided image, scaled to fit within `maxDimension`.
 *
 * @param img - Source HTMLImageElement to convert
 * @param maxDimension - Maximum allowed width or height; image will be scaled down to fit if either dimension exceeds this value (default: MAX_DIMENSION)
 * @returns A PNG data URL representing the (possibly scaled) image
 * @throws Error if a 2D canvas rendering context cannot be obtained
 */
export function imageToDataUrl(
  img: HTMLImageElement,
  maxDimension = MAX_DIMENSION
): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Calculate scaled dimensions
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/png");
}

/**
 * Extracts RGBA pixel data and the pixel dimensions from an HTMLImageElement, scaling the image down to MAX_DIMENSION if needed.
 *
 * @returns An object with `data` containing the image's RGBA values as a `Uint8ClampedArray`, and `width` and `height` reflecting the resulting pixel dimensions (after any scaling).
 */
export function getImagePixels(img: HTMLImageElement): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Use same scaling logic
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  return {
    data: imageData.data,
    width,
    height,
  };
}

/**
 * Retrieve the RGB color of the pixel at the given coordinates in the image's display-scaled dimensions.
 *
 * @param img - Image to sample from.
 * @param x - X coordinate (in pixels) relative to the image as displayed after scaling to the module's maximum dimension.
 * @param y - Y coordinate (in pixels) relative to the image as displayed after scaling to the module's maximum dimension.
 * @returns An object with `r`, `g`, and `b` values (0–255) for the sampled pixel.
 * @throws If a 2D canvas rendering context cannot be obtained.
 */
export function getColorAtPosition(
  img: HTMLImageElement,
  x: number,
  y: number
): { r: number; g: number; b: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Get scaled dimensions to match what we display
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  // Clamp coordinates
  const clampedX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(height - 1, Math.round(y)));

  const pixel = ctx.getImageData(clampedX, clampedY, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

/**
 * Compute dimensions that fit within a square of `maxDimension` pixels while preserving aspect ratio.
 *
 * @param img - Source image element
 * @param maxDimension - Maximum allowed width or height in pixels; defaults to `MAX_DIMENSION`
 * @returns Width and height scaled to fit within `maxDimension`, rounded to the nearest integer
 */
export function getScaledDimensions(
  img: HTMLImageElement,
  maxDimension = MAX_DIMENSION
): { width: number; height: number } {
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  return { width, height };
}