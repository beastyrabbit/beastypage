/**
 * Fetch random images from Wikimedia Commons
 */

const FETCH_TIMEOUT_MS = 15000; // 15 second timeout

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface WikiSearchResult {
  query?: {
    search?: Array<{
      title: string;
    }>;
  };
}

interface WikiImageInfoResult {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        url: string;
      }>;
    }>;
  };
}

type ImageCategory = "nature" | "city";

const CATEGORY_MAP: Record<ImageCategory, string[]> = {
  nature: [
    "Nature photographs",
    "Landscapes",
    "Mountains",
    "Forests",
    "Lakes",
    "Flowers",
  ],
  city: [
    "Cityscapes",
    "Skylines",
    "Urban landscapes",
    "Street photography",
    "Architecture",
  ],
};

/**
 * Search for images in a Wikimedia Commons category
 */
async function searchImages(category: string, limit = 50): Promise<string[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srnamespace", "6"); // File namespace
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("srsearch", `incategory:"${category}" filetype:bitmap`);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to search Wikimedia Commons: ${response.status}`);
    }
    const data = (await response.json()) as WikiSearchResult;
    return data.query?.search?.map((item) => item.title) ?? [];
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out - Wikimedia Commons may be slow");
    }
    throw error;
  }
}

/**
 * Get the actual image URL from a Wikimedia file title
 */
async function getImageUrl(fileTitle: string): Promise<string> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", fileTitle);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to get image info: ${response.status}`);
    }

    const data = (await response.json()) as WikiImageInfoResult;
    const pages = data.query?.pages;
    if (!pages) {
      throw new Error("No image info found");
    }

    // Get the first page result
    const page = Object.values(pages)[0];
    const imageUrl = page?.imageinfo?.[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL found");
    }

    return imageUrl;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out - Wikimedia Commons may be slow");
    }
    throw error;
  }
}

const MAX_RETRIES = 10;

/**
 * Fetch a random image URL from Wikimedia Commons.
 * Retries with different random categories up to MAX_RETRIES times.
 */
export async function fetchRandomWikimediaImage(
  type: ImageCategory = "nature"
): Promise<string> {
  const categories = CATEGORY_MAP[type];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const randomCategory = categories[Math.floor(Math.random() * categories.length)]!;

    try {
      const titles = await searchImages(randomCategory);
      if (titles.length === 0) {
        console.warn(`[wikimedia] Category "${randomCategory}" returned no results (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }

      const randomTitle = titles[Math.floor(Math.random() * titles.length)]!;
      return await getImageUrl(randomTitle);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[wikimedia] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError.message);
      continue;
    }
  }

  throw lastError ?? new Error(`No images found after ${MAX_RETRIES} attempts — try again`);
}

/**
 * Available image categories
 */
export const IMAGE_CATEGORIES: Array<{ id: ImageCategory; label: string }> = [
  { id: "nature", label: "Nature" },
  { id: "city", label: "City" },
];

export type { ImageCategory };
