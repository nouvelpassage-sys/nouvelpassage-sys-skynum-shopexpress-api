import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

export class NullImageStorage {
  get configured() {
    return false;
  }

  async storeProductImage() {
    return null;
  }
}

export class StaticPublicImageStorage {
  constructor({ dir, publicBaseUrl }) {
    this.dir = dir;
    this.publicBaseUrl = ensureTrailingSlash(publicBaseUrl);
  }

  get configured() {
    return Boolean(this.dir && this.publicBaseUrl);
  }

  async storeProductImage({ draftId, bytes, contentType, sourceFilePath }) {
    if (!this.configured || !bytes?.length) {
      return null;
    }

    await mkdir(this.dir, { recursive: true });
    const extension = getImageExtension({ contentType, sourceFilePath });
    const fileName = `${safeFilePart(draftId)}${extension}`;
    const path = join(this.dir, fileName);
    await writeFile(path, bytes);

    return {
      path,
      url: new URL(encodeURIComponent(fileName), this.publicBaseUrl).href,
      previewUrl: new URL(encodeURIComponent(fileName), this.publicBaseUrl).href,
      contentType
    };
  }
}

export class SalesBoxS3ImageStorage {
  constructor({
    apiBaseUrl = "https://prod.salesbox.me/api/",
    apiToken,
    companyId,
    itemType = "services",
    fetchImpl = fetch
  }) {
    this.apiBaseUrl = ensureTrailingSlash(apiBaseUrl);
    this.apiToken = apiToken;
    this.companyId = companyId;
    this.itemType = itemType;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.apiBaseUrl && this.apiToken && this.companyId);
  }

  async storeProductImage({ draftId, bytes, contentType, sourceFilePath }) {
    if (!this.configured || !bytes?.length) {
      return null;
    }

    const extension = getImageExtension({ contentType, sourceFilePath });
    const fileName = `${safeFilePart(draftId)}${extension}`;
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: contentType || "image/jpeg" }), fileName);
    form.append("companyId", this.companyId);
    form.append("itemType", this.itemType);

    const response = await this.fetch(new URL("companies/uploadToS3", this.apiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        accept: "application/json",
        lang: "uk"
      },
      body: form
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`SalesBox image upload failed: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
    }

    const data = payload?.data ?? payload;
    const originalUrl = data?.originalURL ?? data?.originalUrl ?? data?.url;
    const previewUrl = data?.previewURL ?? data?.previewUrl ?? originalUrl;
    if (!originalUrl || !previewUrl) {
      throw new Error(`SalesBox image upload failed: missing image URL in response ${JSON.stringify(payload).slice(0, 500)}`);
    }

    return {
      url: originalUrl,
      previewUrl,
      previewUrlBig: data?.previewURLBig ?? data?.previewUrlBig,
      contentType
    };
  }
}

export class CloudinaryUnsignedImageStorage {
  constructor({
    cloudName,
    uploadPreset,
    folder = "nouvel-amour/products",
    fetchImpl = fetch
  }) {
    this.cloudName = cloudName;
    this.uploadPreset = uploadPreset;
    this.folder = folder;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.cloudName && this.uploadPreset);
  }

  async storeProductImage({ draftId, bytes, contentType, sourceFilePath }) {
    if (!this.configured || !bytes?.length) {
      return null;
    }

    const extension = getImageExtension({ contentType, sourceFilePath });
    const fileName = `${safeFilePart(draftId)}${extension}`;
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: contentType || "image/jpeg" }), fileName);
    form.append("upload_preset", this.uploadPreset);
    if (this.folder) {
      form.append("folder", this.folder);
    }
    form.append("public_id", safeFilePart(draftId));

    const response = await this.fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/upload`, {
      method: "POST",
      body: form
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`Cloudinary image upload failed: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
    }

    const url = payload?.secure_url ?? payload?.url;
    if (!url) {
      throw new Error(`Cloudinary image upload failed: missing image URL in response ${JSON.stringify(payload).slice(0, 500)}`);
    }

    return {
      url,
      previewUrl: url,
      publicId: payload.public_id,
      contentType
    };
  }
}

export function createImageStorage(config = {}) {
  if (config.provider === "static-public") {
    return new StaticPublicImageStorage({
      dir: config.dir,
      publicBaseUrl: config.publicBaseUrl
    });
  }

  if (config.provider === "salesbox-s3") {
    return new SalesBoxS3ImageStorage({
      apiBaseUrl: config.salesBoxApiBaseUrl,
      apiToken: config.salesBoxApiToken,
      companyId: config.salesBoxCompanyId,
      itemType: config.salesBoxItemType
    });
  }

  if (config.provider === "cloudinary-unsigned") {
    return new CloudinaryUnsignedImageStorage({
      cloudName: config.cloudinaryCloudName,
      uploadPreset: config.cloudinaryUploadPreset,
      folder: config.cloudinaryFolder
    });
  }

  return new NullImageStorage();
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function ensureTrailingSlash(value) {
  if (!value) {
    return "";
  }
  return String(value).endsWith("/") ? String(value) : `${value}/`;
}

function getImageExtension({ contentType, sourceFilePath }) {
  const byContentType = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  }[String(contentType ?? "").toLowerCase()];
  if (byContentType) {
    return byContentType;
  }

  const extension = extname(sourceFilePath ?? "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension) ? extension : ".jpg";
}

function safeFilePart(value) {
  return String(value ?? "product")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "product";
}
