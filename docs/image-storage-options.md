# Product image storage options

## Current decision

Do not buy another storage product yet.

The bot now has a storage abstraction:

```text
IMAGE_STORAGE_PROVIDER=static-public
IMAGE_STORAGE_DIR=...
IMAGE_STORAGE_PUBLIC_BASE_URL=...
```

When configured, Telegram image bytes are saved to `IMAGE_STORAGE_DIR`, and the bot adds the matching public URL to the product draft. SalesBox then receives that URL in `offers.*.photos`.

## Best no-new-cost options

1. Existing Nouvel Amour hosting/site storage
   - Best production option if we can upload files to a public folder on the domain.
   - Example URL shape: `https://www.nouvelamour.kiev.ua/media/salesbox/draft-id.jpg`.

2. Google Drive / Google One
   - Good storage capacity, already paid.
   - Needs a reliable public direct image URL. Drive share links may redirect or return preview HTML, so it must be tested with SalesBox before using live.

3. GitHub Pages
   - Useful for small test batches.
   - Not ideal as the main commercial image host because GitHub Pages is not intended as a free web-hosting service for online business assets and has site/bandwidth limits.

4. Vercel Blob
   - Technically strong and easy to automate.
   - Use only if the existing no-cost options fail.

5. SalesBox S3 upload
   - Manual SalesBox upload already creates direct public image URLs.
   - The local bot has a `salesbox-s3` provider prepared for this flow.
   - It still needs confirmed admin upload credentials: `SALESBOX_ADMIN_API_TOKEN` and the internal `SALESBOX_ADMIN_COMPANY_ID`.
   - The existing public OpenAPI token is not enough for this upload endpoint.

## Next test

Configure a real public folder and send one Telegram photo with a price. Press the SalesBox button and check that dry-run no longer reports `offers.*.photos` as missing.
## Recommended Options For Product Assistant

### 1. Cloudinary unsigned upload

Best first option for the local dashboard. It returns a direct public `https` image URL, so SalesBox can use it in `photos`.

Required `.env`:

```env
IMAGE_STORAGE_PROVIDER=cloudinary-unsigned
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset
CLOUDINARY_FOLDER=nouvel-amour/products
```

Use an unsigned upload preset only while the dashboard stays local/private. If the dashboard becomes public, switch to signed uploads.

### 2. SalesBox S3

Best long-term option if SalesBox gives the correct admin upload token and internal company id. The code already supports it:

```env
IMAGE_STORAGE_PROVIDER=salesbox-s3
SALESBOX_ADMIN_API_TOKEN=admin_upload_token
SALESBOX_ADMIN_COMPANY_ID=internal_company_uuid
SALESBOX_UPLOAD_ITEM_TYPE=services
```

### 3. Static public hosting

Works if a folder is served by a public URL:

```env
IMAGE_STORAGE_PROVIDER=static-public
IMAGE_STORAGE_DIR=data/product-assistant/public-images
IMAGE_STORAGE_PUBLIC_BASE_URL=https://example.com/product-images/
```

This is simple, but requires a real public web server/CDN in front of the folder.

### Not First Choice

Google Drive/Google One is useful for storage, but not ideal for SalesBox product photos because share links usually point to a Drive viewer page rather than a stable direct image file URL.

GitHub Pages can serve static files, but it is better as a fallback or temporary catalog CDN, not as the main upload pipeline for day-to-day product photos.
