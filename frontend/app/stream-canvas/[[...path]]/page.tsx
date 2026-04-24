import { permanentRedirect } from "next/navigation";

type StreamCanvasRedirectProps = {
  params: Promise<{ path?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StreamCanvasRedirect({
  params,
  searchParams,
}: StreamCanvasRedirectProps) {
  const { path } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const destination = new URL("https://moddrop.live/");

  if (path?.length) {
    destination.pathname = `/${path.map(encodeURIComponent).join("/")}`;
  }

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        destination.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      destination.searchParams.set(key, value);
    }
  }

  permanentRedirect(destination.toString());
}
