import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CloudinaryUnsignedImageStorage,
  SalesBoxS3ImageStorage,
  StaticPublicImageStorage,
  createImageStorage
} from "../src/productAssistant/imageStorage.js";

test("static public storage writes an image and returns a public URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "product-images-"));
  try {
    const storage = new StaticPublicImageStorage({
      dir,
      publicBaseUrl: "https://cdn.example.com/products"
    });

    const result = await storage.storeProductImage({
      draftId: "draft 123",
      bytes: Buffer.from("image-bytes"),
      contentType: "image/png"
    });

    assert.equal(result.url, "https://cdn.example.com/products/draft-123.png");
    assert.equal(await readFile(result.path, "utf8"), "image-bytes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("image storage stays disabled without a public base URL", async () => {
  const storage = createImageStorage({
    provider: "static-public",
    dir: "data/product-assistant/public-images"
  });

  assert.equal(storage.configured, false);
  assert.equal(
    await storage.storeProductImage({
      draftId: "draft-test",
      bytes: Buffer.from("image-bytes"),
      contentType: "image/jpeg"
    }),
    null
  );
});

test("salesbox s3 storage uploads image bytes and returns SalesBox URLs", async () => {
  let request;
  const storage = new SalesBoxS3ImageStorage({
    apiBaseUrl: "https://prod.salesbox.me/api/",
    apiToken: "admin-token",
    companyId: "company-uuid",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            originalURL: "https://sales-box-photos.example/original/services/photo.jpg",
            previewURL: "https://sales-box-photos.example/preview/services/photo.jpg",
            previewURLBig: "https://sales-box-photos.example/preview-big/services/photo.jpg"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  const result = await storage.storeProductImage({
    draftId: "draft test",
    bytes: Buffer.from("image-bytes"),
    contentType: "image/jpeg"
  });

  assert.equal(request.url, "https://prod.salesbox.me/api/companies/uploadToS3");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, "Bearer admin-token");
  assert.ok(request.options.body instanceof FormData);
  assert.equal(result.url, "https://sales-box-photos.example/original/services/photo.jpg");
  assert.equal(result.previewUrl, "https://sales-box-photos.example/preview/services/photo.jpg");
  assert.equal(result.previewUrlBig, "https://sales-box-photos.example/preview-big/services/photo.jpg");
});

test("salesbox s3 storage stays disabled until admin upload credentials are present", async () => {
  const storage = createImageStorage({
    provider: "salesbox-s3",
    salesBoxApiToken: "",
    salesBoxCompanyId: ""
  });

  assert.equal(storage.configured, false);
  assert.equal(
    await storage.storeProductImage({
      draftId: "draft-test",
      bytes: Buffer.from("image-bytes"),
      contentType: "image/jpeg"
    }),
    null
  );
});

test("cloudinary unsigned storage uploads image bytes and returns secure URL", async () => {
  let request;
  const storage = new CloudinaryUnsignedImageStorage({
    cloudName: "demo-cloud",
    uploadPreset: "nouvel_unsigned",
    folder: "nouvel-amour/products",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(
        JSON.stringify({
          public_id: "nouvel-amour/products/draft-test",
          secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/nouvel-amour/products/draft-test.jpg"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  const result = await storage.storeProductImage({
    draftId: "draft test",
    bytes: Buffer.from("image-bytes"),
    contentType: "image/jpeg"
  });

  assert.equal(request.url, "https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
  assert.equal(request.options.method, "POST");
  assert.ok(request.options.body instanceof FormData);
  assert.equal(result.url, "https://res.cloudinary.com/demo-cloud/image/upload/v1/nouvel-amour/products/draft-test.jpg");
  assert.equal(result.previewUrl, result.url);
});

test("cloudinary unsigned storage stays disabled until cloud name and preset are present", async () => {
  const storage = createImageStorage({
    provider: "cloudinary-unsigned",
    cloudinaryCloudName: "",
    cloudinaryUploadPreset: ""
  });

  assert.equal(storage.configured, false);
  assert.equal(
    await storage.storeProductImage({
      draftId: "draft-test",
      bytes: Buffer.from("image-bytes"),
      contentType: "image/jpeg"
    }),
    null
  );
});
