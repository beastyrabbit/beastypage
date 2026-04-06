import assert from "node:assert/strict";
import test from "node:test";
import { TLSocketRoom } from "@tldraw/sync-core";
import {
  DocumentRecordType,
  type IndexKey,
  PageRecordType,
  TLDOCUMENT_ID,
  createShapeId,
  createTLStore,
  createTLSchema,
  defaultShapeSchemas,
  type TLParentId,
} from "tldraw";
import { streamCanvasSchema } from "./tldraw-schema.ts";

const legacySchema = createTLSchema({
  shapes: defaultShapeSchemas,
});

function makeYouTubeShape(parentId: TLParentId) {
  return {
    id: createShapeId("youtube-embed"),
    typeName: "shape" as const,
    type: "youtube-embed" as const,
    x: 0,
    y: 0,
    rotation: 0,
    index: "a1" as IndexKey,
    parentId,
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

function makeAudioShape(parentId: TLParentId) {
  return {
    id: createShapeId("audio-player"),
    typeName: "shape" as const,
    type: "audio-player" as const,
    x: 24,
    y: 24,
    rotation: 0,
    index: "a2" as IndexKey,
    parentId,
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

test("streamCanvasSchema serializes the custom stream canvas shapes", () => {
  const serialized = JSON.stringify(streamCanvasSchema.serialize());

  assert.match(serialized, /youtube-embed/);
  assert.match(serialized, /audio-player/);
});

test("streamCanvasSchema validates persisted youtube and audio shape records", () => {
  const store = createTLStore({ schema: streamCanvasSchema });
  const pageId = PageRecordType.create({
    name: "Validation Page",
    index: "a1" as IndexKey,
  }).id;

  assert.deepEqual(
    streamCanvasSchema.validateRecord(
      store,
      makeYouTubeShape(pageId),
      "tests",
      null,
    ),
    makeYouTubeShape(pageId),
  );
  assert.deepEqual(
    streamCanvasSchema.validateRecord(
      store,
      makeAudioShape(pageId),
      "tests",
      null,
    ),
    makeAudioShape(pageId),
  );
});

test("TLSocketRoom loads a legacy snapshot containing custom shapes without throwing", () => {
  const page = PageRecordType.create({
    name: "Page 1",
    index: "a1" as IndexKey,
  });

  const youtubeShape = makeYouTubeShape(page.id);
  const audioShape = makeAudioShape(page.id);
  const store = createTLStore({ schema: streamCanvasSchema });

  store.put([
    DocumentRecordType.create({ id: TLDOCUMENT_ID }),
    page,
    youtubeShape,
    audioShape,
  ]);

  const room = new TLSocketRoom({
    schema: streamCanvasSchema,
    initialSnapshot: {
      ...store.getStoreSnapshot(),
      schema: legacySchema.serialize(),
    },
  });

  try {
    const snapshot = room.getCurrentSnapshot();
    const restoredYouTubeShape = snapshot.documents.find(
      (doc) => doc.state.id === youtubeShape.id,
    );
    const restoredAudioShape = snapshot.documents.find(
      (doc) => doc.state.id === audioShape.id,
    );

    assert.ok(restoredYouTubeShape);
    assert.ok(restoredAudioShape);
    assert.deepEqual(restoredYouTubeShape.state, youtubeShape);
    assert.deepEqual(restoredAudioShape.state, audioShape);
  } finally {
    room.close();
  }
});
