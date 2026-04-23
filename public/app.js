const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".pdf", ".webp"]);
const DOCUMENT_TYPE_LABELS = {
  cin: "CIN",
  passport: "Passport",
  drivers_license: "Driver's license",
  birth_certificate: "Birth certificate"
};

const form = document.getElementById("verificationForm");
const formStatus = document.getElementById("formStatus");
const submitButton = document.getElementById("submitButton");
const teamNameCounter = document.getElementById("teamNameCounter");
const readinessPill = document.getElementById("formReadinessPill");

const summaryFields = {
  teamName: document.getElementById("summaryTeamName"),
  player1: document.getElementById("summaryPlayer1"),
  player1Doc: document.getElementById("summaryPlayer1Doc"),
  player2: document.getElementById("summaryPlayer2"),
  player2Doc: document.getElementById("summaryPlayer2Doc")
};

const previewElements = {
  player1Document: document.getElementById("player1DocumentPreview"),
  player2Document: document.getElementById("player2DocumentPreview")
};

const trackedFieldNames = [
  "teamName",
  "player1Epic",
  "player1Discord",
  "player2Epic",
  "player2Discord",
  "player1DocumentType",
  "player2DocumentType",
  "player1Document",
  "player2Document",
  "consent"
];

const touchedFields = new Set();
const previewUrls = new Map();
const previewSignatures = new Map();
let isSubmitting = false;

if (form) {
  form.addEventListener("submit", submitVerificationForm);
  form.addEventListener("input", onFormInteraction);
  form.addEventListener("change", onFormInteraction);
  window.addEventListener("beforeunload", clearPreviewUrls);
  syncFormUi();
}

setupMotion();

function onFormInteraction(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !("name" in target) || !target.name) {
    return;
  }

  touchedFields.add(target.name);
  if (!isSubmitting) {
    formStatus.textContent = "";
  }
  syncFormUi();
}

async function submitVerificationForm(event) {
  event.preventDefault();
  if (isSubmitting) {
    return;
  }

  trackedFieldNames.forEach((name) => touchedFields.add(name));
  const validation = validateForm();
  syncFormUi({ forceErrors: true, validation });
  if (!validation.valid) {
    formStatus.textContent = "Please fix the highlighted fields before submitting.";
    focusFirstInvalidField(validation.errors);
    return;
  }

  setSubmittingState(true);
  formStatus.textContent = "Submitting verification package...";

  try {
    const response = await fetch("/api/submissions", {
      method: "POST",
      body: new FormData(form)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to submit verification.");
    }
    clearPreviewUrls();
    window.location.href = `/submitted.html?team=${encodeURIComponent(data.submission.teamName)}`;
  } catch (error) {
    formStatus.textContent = error.message;
    setSubmittingState(false);
  }
}

function syncFormUi(options = {}) {
  const validation = options.validation || validateForm();
  updateTeamNameCounter();
  updateFilePreview("player1Document");
  updateFilePreview("player2Document");
  updateSummary(validation);
  syncFieldErrors(validation.errors, Boolean(options.forceErrors));
  updateSubmitState(validation.valid);
}

function validateForm() {
  const errors = {};
  const teamName = getTrimmedValue("teamName");
  const player1Epic = getTrimmedValue("player1Epic");
  const player1Discord = getTrimmedValue("player1Discord");
  const player2Epic = getTrimmedValue("player2Epic");
  const player2Discord = getTrimmedValue("player2Discord");
  const player1DocumentType = getTrimmedValue("player1DocumentType");
  const player2DocumentType = getTrimmedValue("player2DocumentType");

  if (!teamName) {
    errors.teamName = "Team name is required.";
  } else if (teamName.length < 3) {
    errors.teamName = "Team name must be at least 3 characters.";
  } else if (teamName.length > 40) {
    errors.teamName = "Team name must stay under 40 characters.";
  }

  validatePlayerTextField("player1Epic", player1Epic, "Player 1 Epic username", errors);
  validatePlayerTextField("player2Epic", player2Epic, "Player 2 Epic username", errors);
  validateDiscordField("player1Discord", player1Discord, "Player 1 Discord username", errors);
  validateDiscordField("player2Discord", player2Discord, "Player 2 Discord username", errors);

  if (normalizeValue(player1Epic) && normalizeValue(player1Epic) === normalizeValue(player2Epic)) {
    errors.player1Epic = "Player 1 and player 2 cannot use the same Epic username.";
    errors.player2Epic = "Player 1 and player 2 cannot use the same Epic username.";
  }

  if (normalizeValue(player1Discord) && normalizeValue(player1Discord) === normalizeValue(player2Discord)) {
    errors.player1Discord = "Player 1 and player 2 cannot use the same Discord username.";
    errors.player2Discord = "Player 1 and player 2 cannot use the same Discord username.";
  }

  if (!DOCUMENT_TYPE_LABELS[player1DocumentType]) {
    errors.player1DocumentType = "Select the document type for player 1.";
  }

  if (!DOCUMENT_TYPE_LABELS[player2DocumentType]) {
    errors.player2DocumentType = "Select the document type for player 2.";
  }

  validateFileField("player1Document", "Player 1 document", errors);
  validateFileField("player2Document", "Player 2 document", errors);

  if (!isCheckboxChecked("consent")) {
    errors.consent = "You must confirm the verification consent before submission.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

function validatePlayerTextField(fieldName, value, label, errors) {
  if (!value) {
    errors[fieldName] = `${label} is required.`;
    return;
  }
  if (value.length < 2) {
    errors[fieldName] = `${label} must be at least 2 characters.`;
    return;
  }
  if (value.length > 32) {
    errors[fieldName] = `${label} must stay under 32 characters.`;
  }
}

function validateDiscordField(fieldName, value, label, errors) {
  validatePlayerTextField(fieldName, value, label, errors);
  if (errors[fieldName]) {
    return;
  }
  if (/\s/.test(value)) {
    errors[fieldName] = `${label} cannot contain spaces.`;
  }
}

function validateFileField(fieldName, label, errors) {
  const input = form.elements.namedItem(fieldName);
  const file = input && input.files ? input.files[0] : null;
  if (!file) {
    errors[fieldName] = `${label} is required.`;
    return;
  }

  if (input.files.length !== 1) {
    errors[fieldName] = `Upload exactly one file for ${label.toLowerCase()}.`;
    return;
  }

  const extension = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    errors[fieldName] = "Use PNG, JPG, WEBP, or PDF only.";
    return;
  }

  if (!file.size) {
    errors[fieldName] = "The selected file appears to be empty.";
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    errors[fieldName] = "Each document must be 8 MB or smaller.";
  }
}

function syncFieldErrors(errors, forceErrors) {
  trackedFieldNames.forEach((name) => {
    const field = form.elements.namedItem(name);
    const errorElement = document.querySelector(`[data-error-for="${name}"]`);
    const shouldShow = forceErrors || touchedFields.has(name);
    const errorMessage = shouldShow ? errors[name] || "" : "";

    if (errorElement) {
      errorElement.textContent = errorMessage;
    }

    if (!field) {
      return;
    }

    if ("checked" in field && field.type === "checkbox") {
      const row = field.closest(".consent-row");
      if (row) {
        row.classList.toggle("field-invalid", Boolean(errorMessage));
      }
      return;
    }

    field.classList.toggle("input-invalid", Boolean(errorMessage));
  });
}

function updateSubmitState(isValid) {
  submitButton.disabled = isSubmitting || !isValid;
  submitButton.textContent = isSubmitting ? "Submitting..." : "Submit verification";
}

function setSubmittingState(nextState) {
  isSubmitting = nextState;
  form.classList.toggle("is-submitting", nextState);
  submitButton.setAttribute("aria-busy", nextState ? "true" : "false");
  updateSubmitState(validateForm().valid);
}

function updateTeamNameCounter() {
  const teamName = getTrimmedValue("teamName");
  teamNameCounter.textContent = `${teamName.length} / 40`;
}

function updateFilePreview(fieldName) {
  const preview = previewElements[fieldName];
  const input = form.elements.namedItem(fieldName);
  if (!preview || !input || !input.files) {
    return;
  }

  const file = input.files[0];
  const signature = file ? `${file.name}:${file.size}:${file.lastModified}` : "";
  if (previewSignatures.get(fieldName) === signature) {
    return;
  }

  revokePreviewUrl(fieldName);
  previewSignatures.set(fieldName, signature);
  if (!file) {
    preview.className = "file-preview";
    preview.textContent = "No file selected yet.";
    return;
  }

  const meta = formatFileSize(file.size);
  preview.className = "file-preview file-preview-ready";

  if (file.type.startsWith("image/")) {
    const objectUrl = URL.createObjectURL(file);
    previewUrls.set(fieldName, objectUrl);
    preview.innerHTML = `
      <img class="file-preview-thumb" src="${objectUrl}" alt="${escapeHtml(file.name)}" />
      <div class="file-preview-copy">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(meta)}</span>
      </div>
    `;
    return;
  }

  preview.classList.add("file-preview-file");
  preview.innerHTML = `
    <div class="file-preview-icon">${escapeHtml(file.type.includes("pdf") ? "PDF" : "FILE")}</div>
    <div class="file-preview-copy">
      <strong>${escapeHtml(file.name)}</strong>
      <span>${escapeHtml(meta)}</span>
    </div>
  `;
}

function updateSummary(validation) {
  const teamName = getTrimmedValue("teamName");
  const player1Epic = getTrimmedValue("player1Epic");
  const player1Discord = getTrimmedValue("player1Discord");
  const player2Epic = getTrimmedValue("player2Epic");
  const player2Discord = getTrimmedValue("player2Discord");

  summaryFields.teamName.textContent = teamName || "Not set";
  summaryFields.player1.textContent = player1Epic || "Missing";
  summaryFields.player2.textContent = player2Epic || "Missing";
  summaryFields.player1Doc.textContent = buildPlayerSummaryLine("player1DocumentType", "player1Document", player1Discord);
  summaryFields.player2Doc.textContent = buildPlayerSummaryLine("player2DocumentType", "player2Document", player2Discord);

  readinessPill.textContent = validation.valid ? "Ready to submit" : "Incomplete";
  readinessPill.classList.toggle("is-ready", validation.valid);
  readinessPill.classList.toggle("is-blocked", !validation.valid);
}

function buildPlayerSummaryLine(documentTypeFieldName, documentFieldName, discordValue) {
  const documentType = getDocumentTypeLabel(getTrimmedValue(documentTypeFieldName));
  const file = getSelectedFile(documentFieldName);
  const parts = [];

  parts.push(discordValue ? `Discord: ${discordValue}` : "Discord missing");
  parts.push(documentType ? `${documentType}` : "Type missing");
  parts.push(file ? file.name : "File missing");

  return parts.join(" • ");
}

function focusFirstInvalidField(errors) {
  const firstFieldName = trackedFieldNames.find((name) => errors[name]);
  if (!firstFieldName) {
    return;
  }
  const field = form.elements.namedItem(firstFieldName);
  if (field && typeof field.focus === "function") {
    field.focus();
  }
}

function getTrimmedValue(name) {
  const field = form.elements.namedItem(name);
  return field && "value" in field ? field.value.trim() : "";
}

function getSelectedFile(name) {
  const field = form.elements.namedItem(name);
  return field && field.files ? field.files[0] || null : null;
}

function isCheckboxChecked(name) {
  const field = form.elements.namedItem(name);
  return Boolean(field && field.checked);
}

function getDocumentTypeLabel(value) {
  return DOCUMENT_TYPE_LABELS[value] || "";
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getFileExtension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function revokePreviewUrl(fieldName) {
  const objectUrl = previewUrls.get(fieldName);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    previewUrls.delete(fieldName);
  }
}

function clearPreviewUrls() {
  for (const fieldName of previewUrls.keys()) {
    revokePreviewUrl(fieldName);
  }
  previewSignatures.clear();
}

function setupMotion() {
  const reveals = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18 }
  );

  reveals.forEach((element) => observer.observe(element));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
