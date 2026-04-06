import { describe, expect, it } from "vitest";
import {
  STREAM_ZONE,
  getStreamZoneViewportPlacement,
} from "@/lib/stream-canvas/stream-zone";

function createPageToViewport(camera: { x: number; y: number; z: number }) {
  return (point: { x: number; y: number }) => ({
    x: (point.x + camera.x) * camera.z,
    y: (point.y + camera.y) * camera.z,
  });
}

describe("getStreamZoneViewportPlacement", () => {
  it("keeps the stream zone anchored at the origin with a default camera", () => {
    const camera = { x: 0, y: 0, z: 1 };

    const placement = getStreamZoneViewportPlacement(
      createPageToViewport(camera),
      camera,
    );

    expect(placement.topLeft).toEqual({ x: 0, y: 0 });
    expect(placement.scale).toBe(1);
    expect(placement.transform).toBe("translate(0px, 0px) scale(1)");
  });

  it("uses viewport math when zoomed out with a panned camera", () => {
    const camera = { x: 120, y: -80, z: 0.5 };

    const placement = getStreamZoneViewportPlacement(
      createPageToViewport(camera),
      camera,
    );

    expect(placement.topLeft).toEqual({
      x: (STREAM_ZONE.x + camera.x) * camera.z,
      y: (STREAM_ZONE.y + camera.y) * camera.z,
    });
    expect(placement.topLeft).not.toEqual({
      x: STREAM_ZONE.x * camera.z + camera.x,
      y: STREAM_ZONE.y * camera.z + camera.y,
    });
  });

  it("uses the same viewport math when zoomed in", () => {
    const camera = { x: -64, y: 32, z: 2 };

    const placement = getStreamZoneViewportPlacement(
      createPageToViewport(camera),
      camera,
    );

    expect(placement.topLeft).toEqual({
      x: (STREAM_ZONE.x + camera.x) * camera.z,
      y: (STREAM_ZONE.y + camera.y) * camera.z,
    });
  });

  it("preserves relative offsets inside the stream zone while panning", () => {
    const pointInZone = { x: STREAM_ZONE.x + 320, y: STREAM_ZONE.y + 180 };
    const cameraA = { x: -150, y: 90, z: 0.75 };
    const cameraB = { x: 240, y: -60, z: 0.75 };

    const placementA = getStreamZoneViewportPlacement(
      createPageToViewport(cameraA),
      cameraA,
    );
    const placementB = getStreamZoneViewportPlacement(
      createPageToViewport(cameraB),
      cameraB,
    );
    const pointViewportA = createPageToViewport(cameraA)(pointInZone);
    const pointViewportB = createPageToViewport(cameraB)(pointInZone);

    expect({
      x: pointViewportA.x - placementA.topLeft.x,
      y: pointViewportA.y - placementA.topLeft.y,
    }).toEqual({
      x: pointInZone.x * cameraA.z,
      y: pointInZone.y * cameraA.z,
    });
    expect({
      x: pointViewportB.x - placementB.topLeft.x,
      y: pointViewportB.y - placementB.topLeft.y,
    }).toEqual({
      x: pointInZone.x * cameraB.z,
      y: pointInZone.y * cameraB.z,
    });
  });
});
