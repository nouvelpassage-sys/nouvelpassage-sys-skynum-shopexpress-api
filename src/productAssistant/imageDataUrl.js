export function resolveImageContentType({ filePath = "", responseContentType = "" }) {
  const normalized = String(responseContentType).split(";")[0].trim().toLowerCase();
  if (normalized.startsWith("image/")) {
    return normalized;
  }

  return guessImageContentType(filePath);
}

function guessImageContentType(filePath = "") {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/jpeg";
}
