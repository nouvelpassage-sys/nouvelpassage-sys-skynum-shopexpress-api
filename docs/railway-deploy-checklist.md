# Railway Deploy Checklist (Telegram bot 24/7)

Use this checklist to run the product assistant bot on Railway without dependency on a local PC.

## 1) Create project and service

1. Railway -> `New Project` -> `Empty Project`.
2. Add service from GitHub repository with this codebase.
3. Ensure service start command is:

```text
node src/product-assistant-runner.js
```

If `railway.json` is present, Railway reads it automatically.
The runner now serves `/health` automatically when Railway injects `PORT`.

## 2) Add persistent volume (required)

Bot drafts and ShopExpress queue CSV must survive restarts.

1. In service settings, add a volume and mount path:

```text
/data
```

2. Add env var:

```text
PRODUCT_ASSISTANT_DATA_DIR=/data/product-assistant
```

3. Add env var for ShopExpress queue path inside the volume:

```text
SHOP_EXPRESS_IMPORT_QUEUE_PATH=/data/product-assistant/shopexpress-pending-import.csv
```

## 3) Required environment variables

Minimum required set:

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_CHAT_IDS=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4

SALESBOX_API_TOKEN=...
SALESBOX_COMPANY_ID=...
SALESBOX_WRITE_ENABLED=true

IMAGE_STORAGE_PROVIDER=cloudinary-unsigned
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_UPLOAD_PRESET=...
CLOUDINARY_FOLDER=nouvel-amour/products

SHOP_EXPRESS_CHANNEL_ENABLED=true
SHOP_EXPRESS_WRITE_ENABLED=false
SHOP_EXPRESS_IMPORT_LINK_ENABLED=true
SHOP_EXPRESS_BASE_URL=https://www.nouvelamour.kiev.ua/
SHOP_EXPRESS_USERNAME=...
SHOP_EXPRESS_PASSWORD=...
```

Optional but recommended:

```text
TELEGRAM_API_BASE_URL=https://api.telegram.org/
TELEGRAM_AUTO_PUBLISH_READY=false
SHOP_EXPRESS_IMPORT_CLOUDINARY_FOLDER=nouvel-amour/products/imports
```

## 4) Security notes

Do not use this variable in production:

```text
NODE_TLS_REJECT_UNAUTHORIZED=0
```

If TLS issues appear on Railway, fix certificate trust chain instead of disabling TLS verification.

## 5) Post-deploy smoke test

Before Telegram checks, run config preflight in Railway shell:

```bash
node scripts/verify-bot-config.mjs
```

Optional but recommended in Railway service settings:

- Healthcheck Path: `/health`

1. Send `/start` to Telegram bot.
2. Send `/status`.
3. Send a product photo with caption `2500 букет у ніжній гамі`.
4. Publish one draft and confirm SalesBox success.
5. Run `/shopstatus`, then `/shopimport`, import via ShopExpress URL, then `/shopdone`.

## 6) Cutover from local PC

1. Stop local process `src/product-assistant-runner.js`.
2. Keep only Railway bot active.
3. Rotate API keys that were previously shared in chat/logs.
