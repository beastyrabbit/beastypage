import { describe, expect, it } from "vitest";
import {
  PageRecordType,
  createTLStore,
  createShapeId,
  type IndexKey,
} from "tldraw";
import { syncShapeUtils } from "@/components/stream-canvas/shapes/shared";

const testPageId = PageRecordType.create({
  name: "Test Page",
  index: "a1" as IndexKey,
}).id;

function makeYouTubeShape() {
  return {
    id: createShapeId("youtube-embed"),
    typeName: "shape" as const,
    type: "youtube-embed" as const,
    x: 0,
    y: 0,
    rotation: 0,
    index: "a1" as IndexKey,
    parentId: testPageId,
    isLocked: false,
    opacity: 1,
    props: {
      w: 480,
      h: 270,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      volume: 1,
      editorAudioEnabled: false,
    },
    meta: {},
  };
}

function makeAudioShape() {
  return {
    id: createShapeId("audio-player"),
    typeName: "shape" as const,
    type: "audio-player" as const,
    x: 0,
    y: 0,
    rotation: 0,
    index: "a2" as IndexKey,
    parentId: testPageId,
    isLocked: false,
    opacity: 1,
    props: {
      w: 300,
      h: 80,
      url: "https://example.com/audio.mp3",
      volume: 0.8,
      loop: false,
      editorAudioEnabled: false,
    },
    meta: {},
  };
}

describe("stream canvas tldraw sync schema", () => {
  it("accepts youtube embed shapes when custom shape utils are registered", () => {
    const store = createTLStore({
      shapeUtils: syncShapeUtils,
    });
    const shape = makeYouTubeShape();

    expect(
      store.schema.validateRecord(store, shape, "tests", null),
    ).toEqual(shape);
  });

  it("accepts audio player shapes when custom shape utils are registered", () => {
    const store = createTLStore({
      shapeUtils: syncShapeUtils,
    });
    const shape = makeAudioShape();

    expect(
      store.schema.validateRecord(store, shape, "tests", null),
    ).toEqual(shape);
  });

  it("rejects custom shapes when the store uses the default schema only", () => {
    const store = createTLStore();

    expect(() =>
      store.schema.validateRecord(store, makeYouTubeShape(), "tests", null),
    ).toThrow();
    expect(() =>
      store.schema.validateRecord(store, makeAudioShape(), "tests", null),
    ).toThrow();
  });
});
