# SalesBox API notes

## What the admin panel shows

- Settings contain an `Інтеграція` section.
- The section has an API token, webhook configuration, and a `Методи` tab.
- The `Методи` tab currently shows `В розробці`, so the method documentation is not exposed in the admin UI yet.
- Webhook event types visible in the UI include user, order, chat, balance sync events. Product create/update webhooks were not visible in the first dropdown pass.

## What the admin app bundle reveals

The SalesBox admin app is a Flutter web app that calls REST endpoints under:

```text
https://prod.salesbox.me/api/
```

Relevant product/catalog endpoints found in the app bundle:

```text
GET    companies/{companyId}/offers/filter
GET    companies/{companyId}/offers/search
GET    companies/{companyId}/offers/{offerId}
POST   companies/{companyId}/offers
PUT    companies/{companyId}/offers/{offerId}
POST   companies/{companyId}/offers/changeAvailable
POST   companies/{companyId}/offers/changePrice
POST   companies/{companyId}/offers/create-description
POST   companies/{companyId}/offers/multiUpdate/
GET    companies/{companyId}/offers/exportXLSX
```

## Safe implementation decision

## Public API V2 discovery

The Personal Access Token works against the public API base URL:

```text
https://prod.salesbox.me/openapi/
```

Verified safe reads on 2026-05-11:

```text
GET /openapi/categories?lang=uk
GET /openapi/offers/filter?lang=uk&page=1&pageSize=5
GET /openapi/orders/all?lang=uk&page=1&pageSize=1
```

The public API does not use `companies/{companyId}` in the URL for these token-based requests. The company id from the token/data is `nouvelflowersnow`, but it is not inserted into the public endpoint path.

Product creation endpoint from the official SalesBox Postman docs:

```text
POST /openapi/offers/createMany?lang=uk
```

Important required fields:

```text
offers
offers.*.price
offers.*.names
offers.*.descriptions
offers.*.photos
```

Current local implementation still defaults to dry-run. Real writes should stay disabled until we have a safe public image URL flow, because `photos` requires image URLs and Telegram file URLs must not be exposed with the bot token.

## Image upload discovery

Manual upload in the SalesBox admin product form stores images on public S3 URLs:

```text
https://sales-box-photos.s3-eu-central-1.amazonaws.com/{company}/preview/services/{uuid}.jpg
https://sales-box-photos.s3-eu-central-1.amazonaws.com/{company}/original/services/{uuid}.jpg
```

The admin Flutter bundle points product/banner/chat uploads at:

```text
POST https://prod.salesbox.me/api/companies/uploadToS3
multipart fields: file, companyId, itemType
itemType for product/service photos: services
response data fields: originalURL, previewURL, previewURLBig
```

The public Personal Access Token that works for `/openapi/*` does not appear to authorize this admin upload endpoint. A direct test with that token returned `COMPANY_NOT_FOUND`, so the upload flow likely needs the admin session token and the internal SalesBox company id, not only the public `openapiId` value `nouvelflowersnow`.

Local code now has a disabled `salesbox-s3` image storage provider ready for this endpoint once those two values are confirmed.

The Telegram assistant should first create local draft JSON files and only write to SalesBox when all of these are confirmed:

- API token auth format;
- company ID;
- exact offer payload schema;
- image upload flow;
- duplicate matching rule by source ID, SKU, or name.

Until then `SALESBOX_WRITE_ENABLED=false` should remain the default.
