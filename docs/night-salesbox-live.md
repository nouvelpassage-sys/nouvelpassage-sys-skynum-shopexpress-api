# Night SalesBox implementation — 2026-11-21

## Baseline and production evidence

Owner chose the current production baseline, SalesBox only. Worktree branch:
`codex/2026-11-21-night-salesbox-live`, based on `c1d4c8d8930160fc770fa5a970a7f65ea833f750`.
The newer worktree and its prepared changes remain intact.

Railway workspace `nouvelpassage-sys`, project `adventurous-simplicity`
(`b4a38bbd-0b1d-4e96-b83a-d093257a2f7a`), service
`0811c129-523c-47db-a05c-e6c3a945cb4b`, production environment
`6c0a1a1a-c3b8-4440-b765-ef966dd9d88d`.
Initial night-code deployment: `64bb2f70-d65c-4bc1-a35f-e6a8250d2f4d`, main `5c4c5a5`, verified healthy with mode off.
Live Node is **18.20.5**, start command `node src/product-assistant-runner.js`.
Persistent draft directory `/data/product-assistant`; 117 stored drafts observed.
`getMe` confirmed bot ID 8653239546, username NouvelProductAssistantBot,
`can_read_all_group_messages: false`. No getUpdates or webhook mutations were used.

Full read-only SalesBox scan returned 100 + 40 + 0 rows, 140 unique products.
API payload count/pagesCount are zero even when rows exist, so scan to empty page.
Observed image origins: res.cloudinary.com,
sales-box-photos.s3-eu-central-1.amazonaws.com, www.nouvelamour.kiev.ua,
d3og57k1dk4307.cloudfront.net.

## Implementation

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

Node tests pass locally and with Node 18.20.5. Latest full suite: 125 tests.
No separate lint, type-check or build scripts exist in package.json.
`git diff --check` passes; npm audit has no reported vulnerabilities.
Dependencies pinned: proper-lockfile 4.1.2, jpeg-js 0.4.4, pngjs 7.0.0.
No live AI generation, image upload or product creation was performed. PR #2 was merged and the existing single Railway service deployed; no second poller was started. All 117 drafts survived and were backed up in `/data/backups/product-assistant-before-night-20261121`.

## Remaining release gates and limitations

1. Group ID confirmed by live bot log on addition at 08:39:41 Kyiv: `-1003882742249`, title “Квіти Контент”, supergroup. Native Telegram confirms six members including the bot. Group Privacy is enabled; enabling access and real ingestion verification remain pending.
2. Photo hashes catch recompression/resizing of the same image; different angles/crops can evade them.
   Similar hashes are held, not automatically treated as the same product.
   Unsupported formats, missing photos, unverified origins/redirects fail closed.
   Read-only audit: 116 fingerprints cached, 23 legacy HTTP-404 photos and one 4032px-class JPEG blocked. Owner explicitly approved excluding only those 23 offer IDs, persisted in `/data/product-assistant/night-content/photo-review-exclusions.json`. Identity comparisons still include them; new broken images still block. Follow-up code adds exact-ID exclusions and bounded 16MP / 256MB JPEG decoding. Container memory limit observed: 8,000,000,000 bytes. Re-audit after follow-up deployment.
3. Albums with more than two photos currently remain for photo selection, without an AI call.
4. No private UI yet for resolving night holds or resuming an interrupted preparation.
5. Night image upload has a 20-second timeout; private upload behavior remains unchanged.
6. Finish group reading access, deploy the photo-audit follow-up to the existing single service.
   Start with collect, inspect real durable ingestion and silence, then prepare, then publish.
   Never start a second poller or change deployment source to the newer 963eccc branch.
7. No LOKO/GetOrder/ShopExpress publishing. GetOrder export is deferred until a product-only import schema is verified.

## Owner price rule — 2026-11-21

New photo intake without a recognizable price uses 1500 UAH for SalesBox and persists `priceSource: default-1500`. A recognized caption or linked reply uses its actual amount and `priceSource: publication`. Conflicting explicit amounts remain held. Unlinked text does not become a product.

Fallback-priced products must NOT be sent to LOKO or GetOrder/Uklon, including any future export file. Only products with a recognized source price are eligible for those destinations, with +20%. These destinations and their exports remain disabled/unimplemented in this release. Existing prepared/published jobs are not repriced.

Validation: 128 tests pass on Node 18.20.5, covering fallback persistence, recognized/reply price priority, and 1500 reaching the night SalesBox adapter.

## Editorial v2

Replaces conflicting AI instructions and automatic canned rewrites. One response includes structured visual evidence, eight naming candidates and bilingual factual copy. Before generation the runner reads the complete SalesBox catalog and saved drafts; normalized names and high word-overlap descriptions are checked deterministically. Failed checks remain quality-blocked. This is a conservative similarity heuristic, not proof of uniqueness or botanical accuracy. Existing cards are not bulk rewritten.

New cards require structured evidence, all four SEO fields and English copy. Only already-supported SalesBox payload fields are sent; no speculative measurements/barcodes/API fields are added. Photo Studio integration remains pending; original source images continue to drive recognition.

132 local Node 18.20.5 tests pass. Live AI copy acceptance still requires an actual source bouquet.

## Photo Studio processing (2026-11-21)

Night preparation now requires NightPhotoStudio. It uses the exact Minimal White / preserve_original prompt and gpt-image-2 1024x1024 settings read from the running Photo Studio service (not the divergent GitHub checkout). The user explicitly authorized automatic publication after automated checks on 2026-11-21.

The original remains the source for copy and duplicate recognition. A single image edit and a separate original/output vision comparison precede upload. Any missing/uncertain/failed review holds the draft. Both original and processed fingerprints are compared against catalog images. Files are stored under night-content/studio/<source+profile+review hash> with durable claim-before-request and checksummed cached result. Interrupted or unknown paid requests require review, never automatic retry. Existing private-chat image handling is unchanged. Collect mode spends no image API calls.

138 Node 18.20.5 tests passed. AI preservation is a probabilistic check, not a guarantee. The image API credit grant and real-photo output have not yet been verified. No new provider, subscription, polling process, or public endpoint is introduced.
