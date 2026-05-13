import test from "node:test";
import assert from "node:assert/strict";
import { resolveImageContentType } from "../src/productAssistant/imageDataUrl.js";

test("uses real image MIME type from Telegram response when present", () => {
  assert.equal(
    resolveImageContentType({
      filePath: "photos/file_12.jpg",
      responseContentType: "image/jpeg; charset=binary"
    }),
    "image/jpeg"
  );
});

test("falls back to file extension when Telegram returns octet-stream", () => {
  assert.equal(
    resolveImageContentType({
      filePath: "photos/file_12.jpg",
      responseContentType: "application/octet-stream"
    }),
    "image/jpeg"
  );
});
