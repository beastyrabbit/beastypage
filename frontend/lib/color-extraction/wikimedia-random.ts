/**
 * Fetch random images from Wikimedia Commons
 */

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

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to search Wikimedia Commons: ${response.status}`);
  }

  const data = (await response.json()) as WikiSearchResult;
  return data.query?.search?.map((item) => item.title) ?? [];
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

  const response = await fetch(url.toString());
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
}

/**
 * Fetch a random image URL from Wikimedia Commons
 */
export async function fetchRandomWikimediaImage(
  type: ImageCategory = "nature"
): Promise<string> {
  // Pick a random category from the type
  const categories = CATEGORY_MAP[type];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];

  // Search for images in that category
  const titles = await searchImages(randomCategory);
  if (titles.length === 0) {
    throw new Error(`No images found in category: ${randomCategory}`);
  }

  // Pick a random title
  const randomTitle = titles[Math.floor(Math.random() * titles.length)];

  // Get the actual image URL
  return getImageUrl(randomTitle);
}

/**
 * Available image categories
 */
export const IMAGE_CATEGORIES: Array<{ id: ImageCategory; label: string }> = [
  { id: "nature", label: "Nature" },
  { id: "city", label: "City" },
];

export type { ImageCategory };
