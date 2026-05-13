const state = {
  draft: null,
  config: null
};

const elements = {
  statusStrip: document.querySelector("#statusStrip"),
  productText: document.querySelector("#productText"),
  photoFile: document.querySelector("#photoFile"),
  fileNote: document.querySelector("#fileNote"),
  publicPhotoUrl: document.querySelector("#publicPhotoUrl"),
  sourceCategory: document.querySelector("#sourceCategory"),
  revisionInstruction: document.querySelector("#revisionInstruction"),
  generateButton: document.querySelector("#generateButton"),
  clearButton: document.querySelector("#clearButton"),
  refreshDraftsButton: document.querySelector("#refreshDraftsButton"),
  draftList: document.querySelector("#draftList"),
  draftState: document.querySelector("#draftState"),
  emptyState: document.querySelector("#emptyState"),
  draftView: document.querySelector("#draftView"),
  draftEditor: document.querySelector("#draftEditor"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  reviseDraftButton: document.querySelector("#reviseDraftButton"),
  editNameUk: document.querySelector("#editNameUk"),
  editNameEn: document.querySelector("#editNameEn"),
  editCategory: document.querySelector("#editCategory"),
  editPrice: document.querySelector("#editPrice"),
  editProductTypeUk: document.querySelector("#editProductTypeUk"),
  editDescriptionUk: document.querySelector("#editDescriptionUk"),
  editPhotoUrl: document.querySelector("#editPhotoUrl"),
  draftImage: document.querySelector("#draftImage"),
  imagePlaceholder: document.querySelector("#imagePlaceholder"),
  draftCategory: document.querySelector("#draftCategory"),
  draftPrice: document.querySelector("#draftPrice"),
  draftName: document.querySelector("#draftName"),
  draftType: document.querySelector("#draftType"),
  draftDescription: document.querySelector("#draftDescription"),
  draftNameEn: document.querySelector("#draftNameEn"),
  draftSeoTitle: document.querySelector("#draftSeoTitle"),
  draftSlug: document.querySelector("#draftSlug"),
  issuesBox: document.querySelector("#issuesBox"),
  writeState: document.querySelector("#writeState"),
  storageSummary: document.querySelector("#storageSummary"),
  storageSnippet: document.querySelector("#storageSnippet"),
  copyStorageSnippetButton: document.querySelector("#copyStorageSnippetButton"),
  telegramSummary: document.querySelector("#telegramSummary"),
  telegramChecklist: document.querySelector("#telegramChecklist"),
  publishButton: document.querySelector("#publishButton"),
  copyPayloadButton: document.querySelector("#copyPayloadButton"),
  publishResult: document.querySelector("#publishResult"),
  payloadBox: document.querySelector("#payloadBox"),
  copyYmlLinkButton: document.querySelector("#copyYmlLinkButton"),
  refreshYmlStatusButton: document.querySelector("#refreshYmlStatusButton"),
  downloadYmlLink: document.querySelector("#downloadYmlLink"),
  ymlFeedUrl: document.querySelector("#ymlFeedUrl"),
  ymlExportStats: document.querySelector("#ymlExportStats"),
  ymlExportIssues: document.querySelector("#ymlExportIssues")
};

await loadConfig();
await loadDraftList();

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.productText.value = button.dataset.example;
    elements.productText.focus();
  });
});

elements.clearButton.addEventListener("click", () => {
  state.draft = null;
  elements.productText.value = "";
  elements.photoFile.value = "";
  elements.publicPhotoUrl.value = "";
  elements.fileNote.textContent =
    "Локальне фото допоможе GPT розпізнати товар, але для публікації в SalesBox потрібне публічне посилання.";
  elements.revisionInstruction.value = "";
  elements.sourceCategory.value = "";
  elements.publishResult.textContent = "";
  renderDraft(null, null, null);
});

elements.refreshDraftsButton.addEventListener("click", loadDraftList);

elements.generateButton.addEventListener("click", async () => {
  await withBusy(elements.generateButton, "Генерую...", async () => {
    elements.publishResult.textContent = "";
    const imageDataUrl = await readSelectedImageDataUrl();
    if (!imageDataUrl && !elements.publicPhotoUrl.value.trim() && !hasImageUrl(elements.productText.value)) {
      elements.publishResult.textContent = "Додай фото: локальний файл або public image URL.";
      return;
    }
    const result = await postJson("/api/drafts", {
      text: elements.productText.value,
      imageDataUrl,
      imageFileName: elements.photoFile.files?.[0]?.name,
      publicPhotoUrl: elements.publicPhotoUrl.value || undefined,
      sourceCategory: elements.sourceCategory.value || undefined,
      revisionInstruction: elements.revisionInstruction.value || undefined
    });
    state.draft = result.draft;
    renderDraft(result.draft, result.salesBox, imageDataUrl);
    await loadDraftList();
    await loadYmlExportStatus();
  });
});

function hasImageUrl(value) {
  return /https?:\/\/[^\s<>"']+\.(?:jpe?g|png|webp|gif)(?:\?[^\s<>"']*)?/i.test(String(value ?? ""));
}

elements.publishButton.addEventListener("click", async () => {
  if (!state.draft) {
    return;
  }

  await withBusy(elements.publishButton, "Відправляю...", async () => {
    const result = await postJson(`/api/drafts/${encodeURIComponent(state.draft.id)}/publish`, {});
    elements.publishResult.textContent = result.result.dryRun
      ? "Dry-run: запис у SalesBox вимкнено."
      : "SalesBox прийняв товар.";
    elements.payloadBox.textContent = JSON.stringify(result.result, null, 2);
    elements.copyPayloadButton.disabled = false;
  });
});

elements.copyPayloadButton.addEventListener("click", async () => {
  const value = elements.payloadBox.textContent;
  if (!value || value === "{}") {
    return;
  }

  await navigator.clipboard.writeText(value);
  elements.publishResult.textContent = "JSON скопійовано.";
});

elements.copyYmlLinkButton.addEventListener("click", async () => {
  const url = new URL(elements.downloadYmlLink.getAttribute("href"), window.location.href);
  await navigator.clipboard.writeText(url.href);
  elements.publishResult.textContent = "SalesBox YML link copied.";
});

elements.refreshYmlStatusButton.addEventListener("click", loadYmlExportStatus);

elements.draftEditor.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.draft) {
    return;
  }

  await withBusy(elements.saveDraftButton, "Зберігаю...", async () => {
    const result = await patchJson(`/api/drafts/${encodeURIComponent(state.draft.id)}`, {
      nameUk: elements.editNameUk.value,
      nameEn: elements.editNameEn.value,
      category: elements.editCategory.value,
      price: elements.editPrice.value,
      productTypeUk: elements.editProductTypeUk.value,
      descriptionUk: elements.editDescriptionUk.value,
      photoUrl: elements.editPhotoUrl.value
    });
    state.draft = result.draft;
    renderDraft(result.draft, result.salesBox);
    await loadDraftList();
    elements.publishResult.textContent = "Правки збережено.";
  });
});

elements.reviseDraftButton.addEventListener("click", async () => {
  if (!state.draft) {
    return;
  }

  const instruction =
    elements.revisionInstruction.value ||
    "Перепиши картку преміально, без технічного тону, без складу букета, з креативною назвою.";

  await withBusy(elements.reviseDraftButton, "AI пише...", async () => {
    const result = await postJson(`/api/drafts/${encodeURIComponent(state.draft.id)}/revise`, {
      revisionInstruction: instruction
    });
    state.draft = result.draft;
    renderDraft(result.draft, result.salesBox);
    await loadDraftList();
    elements.publishResult.textContent = "Створено нову AI-версію чернетки.";
  });
});

async function loadConfig() {
  try {
    const config = await getJson("/api/config");
    state.config = config;
    const ready = config.openAi.configured && config.salesBox.configured;
    elements.statusStrip.innerHTML = `
      <span class="status-dot ${ready ? "" : "warn"}"></span>
      <span>GPT: ${config.openAi.configured ? config.openAi.model : "немає ключа"} · SalesBox: ${
        config.salesBox.writeEnabled ? "live" : "dry-run"
      } · Фото: ${config.imageStorage.configured ? config.imageStorage.provider : "тільки preview"}</span>
    `;
    elements.writeState.textContent = config.salesBox.writeEnabled ? "Live" : "Dry-run";
    elements.writeState.style.background = config.salesBox.writeEnabled ? "#e6f4ec" : "#f0ece7";
    elements.writeState.style.color = config.salesBox.writeEnabled ? "#1d7b4f" : "#6c6560";
    const ymlUrl = new URL("/api/salesbox-feed.yml", window.location.href);
    elements.downloadYmlLink.href = ymlUrl.href;
    elements.ymlFeedUrl.textContent = ymlUrl.href;
    renderStorageStatus(config.imageStorage);
    renderTelegramStatus(config.telegram);
    await loadYmlExportStatus();
  } catch (error) {
    elements.statusStrip.innerHTML = `<span class="status-dot warn"></span><span>${error.message}</span>`;
  }
}

async function loadYmlExportStatus() {
  try {
    const report = await getJson("/api/salesbox-feed-status");
    renderYmlExportStatus(report);
  } catch (error) {
    elements.ymlExportStats.innerHTML = `<span class="export-stat warn">YML status unavailable</span>`;
    elements.ymlExportIssues.textContent = error.message;
  }
}

function renderYmlExportStatus(report) {
  const stats = report.stats ?? { total: 0, exportable: 0, skipped: 0 };
  elements.ymlExportStats.innerHTML = [
    ["Ready", stats.exportable, "ok"],
    ["Skipped", stats.skipped, stats.skipped ? "warn" : "ok"],
    ["Total", stats.total, ""]
  ]
    .map(([label, value, tone]) => `<span class="export-stat ${tone}"><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`)
    .join("");

  if (!report.skipped?.length) {
    elements.ymlExportIssues.innerHTML = `<div class="export-empty">All recent drafts with enough data are ready for YML export.</div>`;
    return;
  }

  const rows = report.skipped
    .slice(0, 6)
    .map(
      (item) => `
        <li data-fix-draft-id="${escapeHtml(item.id || "")}">
          <strong>${escapeHtml(item.nameUk || item.id || "Unnamed draft")}</strong>
          <span>${escapeHtml(item.reasons.join(" · "))}</span>
        </li>
      `
    )
    .join("");
  elements.ymlExportIssues.innerHTML = `<ul>${rows}</ul>`;
  elements.ymlExportIssues.querySelectorAll("[data-fix-draft-id]").forEach((item) => {
    item.addEventListener("click", async () => {
      await loadDraft(item.dataset.fixDraftId);
      elements.editPhotoUrl.focus();
      elements.editPhotoUrl.classList.add("attention");
      elements.publishResult.textContent = "Paste the public photo URL, then save the draft.";
    });
  });
}

function renderTelegramStatus(telegram) {
  if (!telegram?.configured) {
    elements.telegramSummary.textContent = "Bot token не налаштований.";
  } else if (!telegram.running) {
    elements.telegramSummary.textContent = "Bot token є, але процес Telegram-бота зараз не запущений.";
  } else {
    elements.telegramSummary.textContent = "Telegram-бот запущений і готовий приймати фото + ціну.";
  }

  const rows = [
    ["Bot process", telegram?.running ? "running" : "stopped"],
    ["Photo storage", telegram?.imageStorageConfigured ? telegram.imageStorageProvider : "not configured"],
    ["SalesBox write", telegram?.salesBoxWriteEnabled ? "live" : "dry-run"]
  ];
  elements.telegramChecklist.innerHTML = rows
    .map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`)
    .join("");
}

elements.copyStorageSnippetButton.addEventListener("click", async () => {
  const value = elements.storageSnippet.textContent;
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  elements.publishResult.textContent = ".env шаблон скопійовано.";
});

function renderStorageStatus(imageStorage) {
  const recommended =
    imageStorage.options?.find((option) => option.provider === imageStorage.recommendedProvider) ??
    imageStorage.options?.[0];
  const current = imageStorage.options?.find((option) => option.provider === imageStorage.provider);
  const activeLabel = current?.label ?? imageStorage.provider;

  if (imageStorage.configured) {
    elements.storageSummary.textContent = `${activeLabel} налаштовано. Локальні фото будуть автоматично отримувати публічний URL.`;
  } else if (imageStorage.provider === "none") {
    elements.storageSummary.textContent =
      "Зараз фото працює тільки для preview/GPT. Для SalesBox увімкни Cloudinary: він дасть прямий public URL.";
  } else {
    elements.storageSummary.textContent = `${activeLabel} ще не налаштовано. Бракує: ${imageStorage.missingFields.join(", ")}.`;
  }

  elements.storageSnippet.textContent = (recommended?.env ?? []).join("\n");
}

function renderDraft(draft, salesBox, localPreviewUrl = null) {
  if (!draft) {
    elements.emptyState.classList.remove("hidden");
    elements.draftView.classList.add("hidden");
    elements.draftEditor.classList.add("hidden");
    elements.issuesBox.classList.add("hidden");
    elements.draftState.textContent = "Немає";
    elements.publishButton.disabled = true;
    elements.copyPayloadButton.disabled = true;
    elements.payloadBox.textContent = "{}";
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.draftView.classList.remove("hidden");
  elements.draftEditor.classList.remove("hidden");
  elements.draftState.textContent = draft.qualityIssues?.length ? "Є зауваження" : "Готово";
  elements.publishButton.disabled = false;
  elements.copyPayloadButton.disabled = false;

  elements.draftImage.src = draft.previewUrl || draft.photoUrl || localPreviewUrl || "";
  elements.draftImage.classList.toggle("hidden", !elements.draftImage.src);
  elements.imagePlaceholder.classList.toggle("hidden", Boolean(elements.draftImage.src));
  elements.draftCategory.textContent = draft.category || "Без категорії";
  elements.draftPrice.textContent = draft.price ? `${draft.price} ${draft.currency || "UAH"}` : "Без ціни";
  elements.draftName.textContent = draft.nameUk || "";
  elements.draftType.textContent = draft.productTypeUk || "";
  elements.draftDescription.textContent = draft.descriptionUk || "";
  elements.draftNameEn.textContent = draft.nameEn || "";
  elements.draftSeoTitle.textContent = draft.seo?.titleUk || "";
  elements.draftSlug.textContent = draft.seo?.slug || "";
  populateEditor(draft);

  const notices = [
    ...(draft.qualityIssues ?? []),
    draft.imageStorageWarning ? `Фото не завантажилось у сховище: ${draft.imageStorageWarning}` : null
  ].filter(Boolean);

  if (notices.length) {
    elements.issuesBox.classList.remove("hidden");
    elements.issuesBox.innerHTML = notices.map((issue) => `<div>${escapeHtml(issue)}</div>`).join("");
  } else {
    elements.issuesBox.classList.add("hidden");
  }

  elements.payloadBox.textContent = JSON.stringify(salesBox ?? {}, null, 2);
  if (salesBox?.missingRequiredFields?.length) {
    elements.publishResult.textContent = `Бракує: ${salesBox.missingRequiredFields.join(", ")}`;
  }
}

function populateEditor(draft) {
  elements.editNameUk.value = draft.nameUk ?? "";
  elements.editNameEn.value = draft.nameEn ?? "";
  elements.editCategory.value = draft.category ?? "";
  elements.editPrice.value = draft.price ?? "";
  elements.editProductTypeUk.value = draft.productTypeUk ?? "";
  elements.editDescriptionUk.value = draft.descriptionUk ?? "";
  elements.editPhotoUrl.value = draft.photoUrl ?? "";
}

async function loadDraftList() {
  try {
    const result = await getJson("/api/drafts?limit=12");
    if (!result.drafts.length) {
      elements.draftList.innerHTML = `<div class="file-note">Ще немає збережених чернеток.</div>`;
      return;
    }

    elements.draftList.innerHTML = result.drafts.map(renderDraftListItem).join("");
    elements.draftList.querySelectorAll("[data-draft-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadDraft(button.dataset.draftId);
      });
    });
  } catch (error) {
    elements.draftList.innerHTML = `<div class="file-note">${escapeHtml(error.message)}</div>`;
  }
}

async function loadDraft(id) {
  const result = await getJson(`/api/drafts/${encodeURIComponent(id)}`);
  state.draft = result.draft;
  elements.productText.value = result.draft.sourceText ?? "";
  elements.publicPhotoUrl.value = result.draft.photoUrl ?? "";
  elements.photoFile.value = "";
  renderDraft(result.draft, result.salesBox);
}

function renderDraftListItem(draft) {
  const title = escapeHtml(draft.nameUk || "Без назви");
  const meta = escapeHtml([draft.category, draft.productTypeUk].filter(Boolean).join(" · "));
  const price = draft.price ? `${escapeHtml(draft.price)} ${escapeHtml(draft.currency || "UAH")}` : "";
  const image = draft.photoUrl
    ? `<img src="${escapeHtml(draft.photoUrl)}" alt="" />`
    : `<span class="draft-thumb"></span>`;

  return `
    <button type="button" data-draft-id="${escapeHtml(draft.id)}">
      ${image}
      <span>
        <span class="draft-row-title">${title}</span>
        <span class="draft-row-meta">${meta}</span>
      </span>
      <span class="draft-row-price">${price}</span>
    </button>
  `;
}

async function readSelectedImageDataUrl() {
  const file = elements.photoFile.files?.[0];
  if (!file) {
    return null;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Обери файл зображення.");
  }

  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Фото завелике. Спробуй файл до 8 MB.");
  }

  elements.fileNote.textContent = `Вибрано: ${file.name}`;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("Не вдалося прочитати фото.")));
    reader.readAsDataURL(file);
  });
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

async function patchJson(url, payload) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

async function withBusy(button, label, task) {
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await task();
  } catch (error) {
    elements.publishResult.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
