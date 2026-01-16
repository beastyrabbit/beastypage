/**
 * Image loading and processing utilities
 */

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 1200; // Max width/height for processing

/**
 * Load an image from a File
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
 * Load an image from a URL
 * Detects CORS/tainted canvas issues immediately after load
 */
export async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // Test for CORS/tainted canvas by trying to read pixel data
      try {
        const testCanvas = document.createElement("canvas");
        testCanvas.width = 1;
        testCanvas.height = 1;
        const testCtx = testCanvas.getContext("2d");
        if (!testCtx) {
          reject(new Error("Could not create canvas context"));
          return;
        }
        testCtx.drawImage(img, 0, 0, 1, 1);
        // This will throw SecurityError if canvas is tainted
        testCtx.getImageData(0, 0, 1, 1);
        resolve(img);
      } catch (error) {
        if (error instanceof DOMException && error.name === "SecurityError") {
          reject(
            new Error(
              "Cannot access image data due to CORS restrictions. " +
                "The image server must include Access-Control-Allow-Origin headers. " +
                "Try downloading the image first and uploading it locally."
            )
          );
        } else {
          reject(error);
        }
      }
    };

    img.onerror = () =>
      reject(new Error("Failed to load image from URL. Try downloading it first."));
    img.src = url;
  });
}

/**
 * Convert image to data URL
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
 * Get pixel data from an image
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
 * Get color at a specific position in the image
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
 * Get scaled dimensions for display
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
