# Night SalesBox implementation — 2026-11-21

## Baseline and production evidence

Owner chose the current production baseline, SalesBox only. Worktree branch:
`codex/2026-11-21-night-salesbox-live`, based on `c1d4c8d8930160fc770fa5a970a7f65ea833f750`.
The newer worktree and its prepared changes remain intact.

Railway workspace `nouvelpassage-sys`, project `adventurous-simplicity`
(`b4a38bbd-0b1d-4e96-b83a-d093257a2f7a`), service
`0811c129-523c-47db-a05c-e6c3a945cb4b`, production environment
`6c0a1a1a-c3b8-4440-b765-ef966dd9d88d`.
Active deployment observed: `44155935-d8e2-4ec8-95cb-ee2dd5f1da87`.
Live Node is **18.20.5**, start command `node src/product-assistant-runner.js`.
Persistent draft directory `/data/product-assistant`; 117 stored drafts observed.
`getMe` confirmed bot ID 8653239546, username NouvelProductAssistantBot,
`can_read_all_group_messages: false`. No getUpdates or webhook mutations were used.

Full read-only SalesBox scan returned 100 + 40 + 0 rows, 140 unique products.
API payload count/pagesCount are zero even when rows exist, so scan to empty page.
Observed image origins: res.cloudinary.com,
sales-box-photos.s3-eu-central-1.amazonaws.com, www.nouvelamour.kiev.ua,
d3og57k1dk4307.cloudfront.net.

## Local implementation (not deployed)

- SalesBox-only bot publication; existing private generation kept on old baseline.
- Persistent source-group queue and offset, atomic fsync/rename, heartbeat locks.
- Exact group ID allowlist; unrelated groups ignored silently.
- Captions/replies grouped by album; ambiguous or unlinked prices remain drafts.
- Kyiv 23:00–07:00 worker, one saved AI preparation, no automatic paid retry after an uncertain/crashed preparation.
- Up to two source photos in one AI request; one audited overall photo uploaded.
- Night-specific visible-composition description and substitution note; private prompt unchanged.
- Photo fingerprint caching and conservative manual-product duplicate review.
- Full catalog identity/price/copy/photo/availability verification; write acknowledgement alone remains publication-pending.
- Unknown write outcomes reconciled with five-minute backoff, never blindly recreated.
- Night-owned drafts cannot bypass queue via a private publish button.
- Runtime modes: NIGHT_CONTENT_MODE=off (default), collect, prepare, publish.
  Enabled modes require a verified negative NIGHT_CONTENT_CHAT_ID.

## Verification

Node tests pass locally and with Node 18.20.5. Latest full suite: 123 tests.
No separate lint, type-check or build scripts exist in package.json.
`git diff --check` passes; npm audit has no reported vulnerabilities.
Dependencies pinned: proper-lockfile 4.1.2, jpeg-js 0.4.4, pngjs 7.0.0.
No live AI generation, image upload, product creation, deployment, push, or polling was performed.

## Remaining release gates and limitations

1. Exact numeric group ID still unverified. Native Telegram is open in “Квіти Контент”.
   Five human members observed; bot not present. Privacy is enabled, so group access must be configured.
   Keyboard navigation and AX setValue work; native pointer actions were unreliable.
   User explicitly prefers native Telegram; do not ask for Web login again.
2. Photo hashes catch recompression/resizing of the same image; different angles/crops can evade them.
   Similar hashes are held, not automatically treated as the same product.
   Unsupported formats, missing photos, unverified origins/redirects fail closed.
   Validate the actual 140-product photo set before enabling publish.
3. Albums with more than two photos currently remain for photo selection, without an AI call.
4. No private UI yet for resolving night holds or resuming an interrupted preparation.
5. Existing image upload client has no explicit timeout; worker may wait for a stalled upload.
6. Confirm group access and source identity, back up persistent data, then deploy to the existing single service.
   Start with collect, inspect real durable ingestion and silence, then prepare, then publish.
   Never start a second poller or change deployment source to the newer 963eccc branch.
7. No LOKO/GetOrder/ShopExpress publishing. GetOrder export is deferred until a product-only import schema is verified.
