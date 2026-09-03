type UploadProgress = {
  loaded: number;
  total: number;
};

type UploadBlobOptions = {
  headers?: HeadersInit;
  onProgress?: (progress: UploadProgress) => void;
  createRequest?: () => XMLHttpRequest;
};

function responseBody(request: XMLHttpRequest): unknown {
  if (!request.responseText) return null;
  try {
    return JSON.parse(request.responseText);
  } catch {
    return null;
  }
}

export function uploadBlobWithProgress<T>(
  path: string,
  body: Blob,
  options: UploadBlobOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = options.createRequest?.() ?? new XMLHttpRequest();
    request.open("PUT", path);
    new Headers(options.headers).forEach((value, name) => {
      request.setRequestHeader(name, value);
    });

    request.upload.addEventListener("progress", (event) => {
      options.onProgress?.({
        loaded: Math.min(event.loaded, body.size),
        total: body.size,
      });
    });

    request.addEventListener("load", () => {
      const parsed = responseBody(request);
      if (request.status >= 200 && request.status < 300) {
        resolve(parsed as T);
        return;
      }
      const message =
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        typeof parsed.error === "string"
          ? parsed.error
          : `Request failed (${request.status})`;
      reject(new Error(message));
    });
    request.addEventListener("error", () => {
      reject(new Error("Upload failed because the connection was lost."));
    });
    request.addEventListener("abort", () => {
      reject(new Error("Upload was cancelled."));
    });

    request.send(body);
  });
}
