/** Strip the data URL prefix (e.g. `data:image/png;base64,`) to get raw base64. */
export function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Invalid data URL: missing comma separator");
  }
  return dataUrl.slice(commaIndex + 1);
}
