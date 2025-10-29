import { createClient } from "https://cdn.jsdelivr.net/npm/convex@1.28.0/dist/esm/browser/index.js?module";

function deriveConvexUrl() {
  if (typeof window === "undefined") return "";
  if (window.__CONVEX_URL__) return window.__CONVEX_URL__;
  const attr = document.documentElement.getAttribute("data-convex-url");
  if (attr) return attr;
  const href = window.location.origin;
  const match = href.match(/^(https?:\/\/[^:]+)(?::(\d+))?/i);
  if (match) {
    const base = match[1];
    const port = match[2];
    if (port === "8080") return `${base}:3210`;
    if (!port) return `${base}:3210`;
  }
  return href.replace(/:\d+$/, ":3210");
}

const convexUrl = deriveConvexUrl();
const convex = createClient(convexUrl);
convex.setAuth(() => Promise.resolve(null));

async function uploadFile(file) {
  const uploadUrl = await convex.storage.getUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }
  const { storageId } = await response.json();
  return storageId;
}

export { convex, convexUrl, uploadFile };
