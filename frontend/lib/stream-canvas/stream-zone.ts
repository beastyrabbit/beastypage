/** The stream zone rectangle — the area that maps to the OBS browser source. */
export const STREAM_ZONE = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
} as const;

type StreamZonePoint = {
  x: number;
  y: number;
};

type StreamZoneCamera = {
  z: number;
};

type StreamZoneRect = {
  x: number;
  y: number;
};

/**
 * tldraw camera x/y are page-space offsets, so the stream zone has to be
 * converted to viewport coordinates before applying the CSS transform.
 */
export function getStreamZoneViewportPlacement(
  pageToViewport: (point: StreamZonePoint) => StreamZonePoint,
  camera: StreamZoneCamera,
  zone: StreamZoneRect = STREAM_ZONE,
) {
  const topLeft = pageToViewport({ x: zone.x, y: zone.y });

  return {
    topLeft,
    scale: camera.z,
    transform: `translate(${topLeft.x}px, ${topLeft.y}px) scale(${camera.z})`,
  };
}
