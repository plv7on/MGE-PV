const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const exportCsvLink = document.getElementById("exportCsvLink");
const downloadZipLink = document.getElementById("downloadZipLink");
const logoutButton = document.getElementById("logoutButton");
const storageGrid = document.getElementById("storageGrid");
const statsGrid = document.getElementById("statsGrid");
const submissionsList = document.getElementById("submissionsList");
const documentSort = document.getElementById("documentSort");
const documentsList = document.getElementById("documentsList");
const documentsSummary = document.getElementById("documentsSummary");
const detailContent = document.getElementById("detailContent");
const detailPanel = document.getElementById("detailPanel");
const filterRow = document.getElementById("filterRow");
const queueSummary = document.getElementById("queueSummary");
const queueSearch = document.getElementById("queueSearch");

let submissions = [];
let storage = null;
let selectedId = null;
let activeFilter = "all";
let searchQuery = "";

loginForm.addEventListener("submit", onLogin);
logoutButton.addEventListener("click", onLogout);
filterRow.addEventListener("click", onFilterClick);
queueSearch.addEventListener("input", onSearchInput);
documentSort.addEventListener("change", renderDocuments);
documentsList.addEventListener("click", onDocumentAction);

checkSession();
setupMotion();

async function checkSession() {
  const response = await fetch("/api/admin/session");
  const session = await response.json();
  if (session.authenticated) {
    showAdmin();
    await loadDashboard();
    return;
  }
  showLogin();
}

async function onLogin(event) {
  event.preventDefault();
  loginStatus.textContent = "Signing in...";
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    loginStatus.textContent = data.error || "Unable to sign in.";
    return;
  }

  loginForm.reset();
  loginStatus.textContent = "";
  showAdmin();
  await loadDashboard();
}

async function onLogout() {
  await fetch("/api/admin/logout", { method: "POST" });
  submissions = [];
  storage = null;
  selectedId = null;
  showLogin();
}

async function loadDashboard() {
  const [submissionsResponse, storageResponse] = await Promise.all([
    fetch("/api/submissions"),
    fetch("/api/admin/storage")
  ]);

  if (submissionsResponse.status === 401 || storageResponse.status === 401) {
    showLogin();
    return;
  }

  submissions = await submissionsResponse.json();
  storage = await storageResponse.json();

  if (!selectedId && submissions.length) {
    selectedId = submissions[0].id;
  }
  if (selectedId && !submissions.some((item) => item.id === selectedId)) {
    selectedId = submissions[0] ? submissions[0].id : null;
  }

  renderStorage();
  renderStats(submissions);
  renderSubmissions();
  renderDocuments();
  renderDetail();
}

function renderStorage() {
  if (!storage) {
    storageGrid.innerHTML = '<p class="empty">Storage details are unavailable.</p>';
    return;
  }

  const sourceLabels = {
    DATA_DIR: "Using DATA_DIR",
    RAILWAY_VOLUME_MOUNT_PATH: "Using Railway volume mount path",
    default_local_data: "Using repo-local data directory"
  };
  const persistenceLabel = storage.hasRailwayVolume ? "Railway volume attached" : "Local container storage only";

  storageGrid.innerHTML = `
    <article class="storage-card">
      <span class="info-label">Persistence</span>
      <strong>${escapeHtml(persistenceLabel)}</strong>
      <p class="stat-copy">${escapeHtml(sourceLabels[storage.resolvedFrom] || storage.resolvedFrom)}. New uploads are written into the resolved data directory below.</p>
    </article>
    <article class="storage-card">
      <span class="info-label">Data directory</span>
      <strong class="storage-path">${escapeHtml(storage.dataDir)}</strong>
      <p class="stat-copy">This folder stores the submissions JSON file and the uploads subfolder.</p>
    </article>
    <article class="storage-card">
      <span class="info-label">Uploads folder</span>
      <strong class="storage-path">${escapeHtml(storage.uploadDir)}</strong>
      <p class="stat-copy">Protected documents are served through <code>/uploads/&lt;filename&gt;</code> after admin login.</p>
    </article>
    <article class="storage-card">
      <span class="info-label">Railway mount</span>
      <strong class="storage-path">${escapeHtml(storage.railwayVolumeMountPath || "Not set")}</strong>
      <p class="stat-copy">${escapeHtml(storage.hasRailwayVolume ? "This deployment can persist uploads on the attached Railway volume." : "No Railway volume path was detected for this deployment.")}</p>
    </article>
  `;
}

function renderStats(items) {
  const pending = items.filter((item) => item.reviewStatus === "pending").length;
  const approved = items.filter((item) => item.reviewStatus === "approved").length;
  const rejected = items.filter((item) => item.reviewStatus === "rejected").length;
  statsGrid.innerHTML = `
    <article class="stat-card"><span class="stat-label">Total</span><strong>${items.length}</strong><p class="stat-copy">All submitted verification packages.</p></article>
    <article class="stat-card"><span class="stat-label">Pending</span><strong>${pending}</strong><p class="stat-copy">Still waiting for a decision.</p></article>
    <article class="stat-card"><span class="stat-label">Approved</span><strong>${approved}</strong><p class="stat-copy">Cleared for tournament review.</p></article>
    <article class="stat-card"><span class="stat-label">Rejected</span><strong>${rejected}</strong><p class="stat-copy">Requires correction or follow-up.</p></article>
  `;
}

function renderSubmissions() {
  submissionsList.innerHTML = "";
  const filtered = getVisibleSubmissions();
  const filterLabel = activeFilter === "all" ? "the queue" : activeFilter;
  queueSummary.textContent = `${filtered.length} submission${filtered.length === 1 ? "" : "s"} in ${filterLabel}${searchQuery ? ` matching "${searchQuery}"` : ""}.`;

  if (!filtered.length) {
    submissionsList.innerHTML = '<p class="empty queue-empty">No verification submissions match the current filters.</p>';
    return;
  }

  for (const submission of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-pill team-pill-${submission.reviewStatus}${submission.id === selectedId ? " selected-team-pill" : ""}`;
    button.setAttribute("aria-pressed", submission.id === selectedId ? "true" : "false");
    button.title = `${submission.teamName} | ${capitalize(submission.reviewStatus)} | ${submission.player1Epic} / ${submission.player2Epic}`;
    button.innerHTML = `
      <span class="team-pill-dot" aria-hidden="true"></span>
      <span class="team-pill-name">${escapeHtml(submission.teamName)}</span>
      <span class="team-pill-status">${escapeHtml(submission.reviewStatus)}</span>
    `;
    button.addEventListener("click", () => {
      selectedId = submission.id;
      renderSubmissions();
      renderDetail();
    });
    submissionsList.appendChild(button);
  }
}

function renderDocuments() {
  documentsList.innerHTML = "";
  const visibleSubmissions = getVisibleSubmissions();
  const documents = sortDocuments(flattenDocuments(visibleSubmissions), documentSort.value);

  if (!documents.length) {
    documentsSummary.textContent = "No documents match the current queue filters.";
    documentsList.innerHTML = '<p class="empty queue-empty">No uploaded documents match the current filters.</p>';
    return;
  }

  documentsSummary.textContent = `${documents.length} document${documents.length === 1 ? "" : "s"} available from ${visibleSubmissions.length} visible submission${visibleSubmissions.length === 1 ? "" : "s"}.`;
  documentsList.innerHTML = documents.map(renderDocumentBrowserCard).join("");
}

function renderDetail() {
  const submission = submissions.find((item) => item.id === selectedId);
  if (!submission) {
    detailContent.innerHTML = '<p class="empty">Select a submission to review.</p>';
    return;
  }

  const submissionFiles = submission.files || [];

  detailContent.innerHTML = `
    <div class="detail-dossier">
      <section class="detail-hero-card">
        <div class="detail-hero-main">
          <p class="eyebrow">Submission dossier</p>
          <p class="detail-kicker">Fortnite team review</p>
          <h3>${escapeHtml(submission.teamName)}</h3>
          <p class="detail-hero-copy">Validate both players, inspect the uploaded identity files, and record the final decision without losing the timeline.</p>
          <div class="detail-meta-line">
            <span class="detail-meta-pill">Submitted ${formatDate(submission.createdAt)}</span>
            <span class="detail-meta-pill">${submissionFiles.length} document${submissionFiles.length === 1 ? "" : "s"}</span>
            <span class="detail-meta-pill">${submission.reviewedBy ? `Reviewer ${escapeHtml(submission.reviewedBy)}` : "Reviewer not assigned"}</span>
          </div>
        </div>
        <div class="detail-hero-side">
          <span class="badge badge-${submission.reviewStatus}">${escapeHtml(submission.reviewStatus)}</span>
          <div class="detail-status-note">
            <strong>${submission.reviewedAt ? "Review saved" : "Awaiting decision"}</strong>
            <p class="muted-line">${submission.reviewedAt ? `Last updated ${formatDate(submission.reviewedAt)}` : "No review has been stored for this submission yet."}</p>
          </div>
          <div class="detail-hero-stats">
            <article class="detail-stat-chip">
              <span class="detail-stat-label">Files</span>
              <strong>${submissionFiles.length}</strong>
            </article>
            <article class="detail-stat-chip">
              <span class="detail-stat-label">Notes</span>
              <strong>${submission.adminNotes?.trim() ? "Saved" : "Empty"}</strong>
            </article>
          </div>
        </div>
      </section>

      <div class="detail-dossier-grid">
        <div class="detail-main-column">
          <section class="detail-section detail-section-first">
            <div class="section-heading detail-section-head">
              <div>
                <p class="eyebrow">Players</p>
                <h3>Identity snapshot</h3>
              </div>
            </div>
            <div class="detail-grid detail-grid-players">
              ${renderPlayerCard("Player 1", "Primary", submission.player1Epic, submission.player1Discord, getFileLabel(submissionFiles, "player1Document"), submission.player1DocumentType)}
              ${renderPlayerCard("Player 2", "Secondary", submission.player2Epic, submission.player2Discord, getFileLabel(submissionFiles, "player2Document"), submission.player2DocumentType)}
            </div>
          </section>

          <section class="detail-section">
            <div class="section-heading detail-section-head">
              <div>
                <p class="eyebrow">Documents</p>
                <h3>Identity files</h3>
              </div>
            </div>
            <div class="documents-grid documents-grid-review">
              ${submissionFiles.map(renderFileCard).join("")}
            </div>
          </section>
        </div>

        <aside class="detail-side-column">
          <section class="detail-decision-card">
            <div class="section-heading detail-section-head">
              <div>
                <p class="eyebrow">Decision</p>
                <h3>Review controls</h3>
              </div>
            </div>
            <form id="reviewForm" class="stack review-form review-form-side">
              <div class="field">
                <span class="field-label">Review status</span>
                <div class="status-pill-group" role="radiogroup" aria-label="Review status">
                  ${renderStatusPills(submission.reviewStatus)}
                </div>
                <input type="hidden" name="reviewStatus" value="${escapeHtml(submission.reviewStatus)}" />
              </div>
              <label class="field">
                <span class="field-label">Admin notes</span>
                <textarea name="adminNotes" rows="8" placeholder="Internal review notes">${escapeHtml(submission.adminNotes || "")}</textarea>
              </label>
              <div class="review-side-meta">
                <p class="review-side-line"><span>Reviewer</span><strong>${escapeHtml(submission.reviewedBy || "Not assigned")}</strong></p>
                <p class="review-side-line"><span>Last change</span><strong>${submission.reviewedAt ? formatDate(submission.reviewedAt) : "Not reviewed"}</strong></p>
              </div>
              <div class="submit-row">
                <button class="button" type="submit">Save review</button>
                <button class="button button-secondary danger-button" id="deleteSubmissionButton" type="button">Delete submission</button>
                <p class="status" id="reviewStatusText">${submission.reviewedAt ? `Last reviewed ${formatDate(submission.reviewedAt)}` : ""}</p>
              </div>
            </form>
          </section>
        </aside>
      </div>
    </div>
  `;

  document.getElementById("reviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const statusText = document.getElementById("reviewStatusText");
    statusText.textContent = "Saving review...";
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch(`/api/submissions/${submission.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      statusText.textContent = data.error || "Unable to save review.";
      return;
    }
    statusText.textContent = "Review saved.";
    await loadDashboard();
  });

  detailContent.querySelectorAll("[data-review-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const hiddenInput = document.querySelector('#reviewForm input[name="reviewStatus"]');
      hiddenInput.value = button.dataset.reviewStatus;
      detailContent.querySelectorAll("[data-review-status]").forEach((item) => {
        item.classList.toggle("active-status-pill", item === button);
        item.setAttribute("aria-checked", item === button ? "true" : "false");
      });
    });
  });

  document.getElementById("deleteSubmissionButton").addEventListener("click", async () => {
    const confirmed = window.confirm(`Delete ${submission.teamName}? This will permanently remove the submission and both uploaded documents.`);
    if (!confirmed) {
      return;
    }

    const statusText = document.getElementById("reviewStatusText");
    statusText.textContent = "Deleting submission...";
    const response = await fetch(`/api/submissions/${submission.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      statusText.textContent = data.error || "Unable to delete submission.";
      return;
    }

    submissions = submissions.filter((item) => item.id !== submission.id);
    const visible = getVisibleSubmissions();
    selectedId = visible[0] ? visible[0].id : null;
    renderStats(submissions);
    renderSubmissions();
    renderDocuments();
    renderDetail();
  });
}

function renderPlayerCard(label, role, epic, discord, documentLabel, documentType) {
  return `
    <article class="info-card player-detail-card">
      <div class="player-card-head">
        <p class="info-label">${escapeHtml(label)}</p>
        <span class="player-chip">${escapeHtml(role)}</span>
      </div>
      <strong class="info-value">${escapeHtml(epic)}</strong>
      <div class="info-stack">
        <p class="info-row"><span class="info-key">Discord</span><span>${escapeHtml(discord)}</span></p>
        <p class="info-row"><span class="info-key">Type</span><span>${escapeHtml(formatDocumentType(documentType))}</span></p>
        <p class="info-row"><span class="info-key">Document</span><span>${escapeHtml(documentLabel)}</span></p>
      </div>
    </article>
  `;
}

function renderFileCard(file) {
  const contentType = String(file.contentType || "");
  const preview = contentType.startsWith("image/")
    ? `<img class="doc-preview" src="${file.url}" alt="${escapeHtml(file.originalName)}" />`
    : `<div class="doc-fallback">${escapeHtml(contentType.includes("pdf") ? "PDF" : "File")}</div>`;

  return `
    <article class="doc-card">
      <div class="doc-card-head">
        <p class="info-label">${escapeHtml(file.fieldName === "player1Document" ? "Player 1 Document" : "Player 2 Document")}</p>
        <span class="doc-type-pill">${escapeHtml(contentType.includes("pdf") ? "PDF" : contentType.split("/")[1] || "file")}</span>
      </div>
      ${preview}
      <p class="doc-name">${escapeHtml(file.originalName)}</p>
      <div class="file-links">
        <a class="button button-secondary" href="${file.url}" target="_blank" rel="noreferrer">Open</a>
        <a class="button button-secondary" href="${file.url}" download>Download</a>
      </div>
    </article>
  `;
}

function renderStatusPills(currentStatus) {
  return ["pending", "approved", "rejected"]
    .map((status) => {
      const isActive = status === currentStatus;
      return `
        <button
          class="status-pill status-pill-${status}${isActive ? " active-status-pill" : ""}"
          type="button"
          role="radio"
          aria-checked="${isActive ? "true" : "false"}"
          data-review-status="${status}"
        >
          ${capitalize(status)}
        </button>
      `;
    })
    .join("");
}

function onFilterClick(event) {
  const button = event.target.closest("[data-filter]");
  if (!button) {
    return;
  }

  activeFilter = button.dataset.filter;
  filterRow.querySelectorAll("[data-filter]").forEach((item) => {
    item.classList.toggle("active-filter", item === button);
  });

  const filtered = getVisibleSubmissions();
  if (filtered.length && !filtered.some((item) => item.id === selectedId)) {
    selectedId = filtered[0].id;
  }
  if (!filtered.length) {
    selectedId = null;
  }

  renderSubmissions();
  renderDocuments();
  renderDetail();
}

function onSearchInput(event) {
  searchQuery = event.target.value.trim().toLowerCase();
  const filtered = getVisibleSubmissions();
  if (filtered.length && !filtered.some((item) => item.id === selectedId)) {
    selectedId = filtered[0].id;
  }
  if (!filtered.length) {
    selectedId = null;
  }

  renderSubmissions();
  renderDocuments();
  renderDetail();
}

function onDocumentAction(event) {
  const button = event.target.closest("[data-select-submission]");
  if (!button) {
    return;
  }

  selectedId = button.dataset.selectSubmission;
  renderSubmissions();
  renderDetail();
  detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  exportCsvLink.classList.add("hidden");
  downloadZipLink.classList.add("hidden");
  logoutButton.classList.add("hidden");
  storageGrid.innerHTML = '<p class="empty">Sign in to inspect the active storage path.</p>';
  documentsSummary.textContent = "Open or download any file without switching between team records.";
  documentsList.innerHTML = "";
  detailContent.innerHTML = "";
  requestAnimationFrame(() => loginPanel.classList.add("revealed"));
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  exportCsvLink.classList.remove("hidden");
  downloadZipLink.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
  requestAnimationFrame(() => adminPanel.classList.add("revealed"));
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getVisibleSubmissions() {
  const statusOrder = { pending: 0, approved: 1, rejected: 2 };
  return submissions
    .filter((item) => {
      const matchesFilter = activeFilter === "all" || item.reviewStatus === activeFilter;
      if (!matchesFilter) {
        return false;
      }
      if (!searchQuery) {
        return true;
      }
      const haystack = [
        item.teamName,
        item.player1Epic,
        item.player1Discord,
        item.player2Epic,
        item.player2Discord
      ].join(" ").toLowerCase();
      return haystack.includes(searchQuery);
    })
    .sort((left, right) => {
      const statusDelta = (statusOrder[left.reviewStatus] ?? 99) - (statusOrder[right.reviewStatus] ?? 99);
      if (activeFilter === "all" && statusDelta !== 0) {
        return statusDelta;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}

function flattenDocuments(items) {
  return items.flatMap((submission) =>
    (submission.files || []).map((file) => ({
      ...file,
      submissionId: submission.id,
      teamName: submission.teamName,
      reviewStatus: submission.reviewStatus,
      createdAt: submission.createdAt,
      playerEpic: file.fieldName === "player1Document" ? submission.player1Epic : submission.player2Epic,
      playerDiscord: file.fieldName === "player1Document" ? submission.player1Discord : submission.player2Discord,
      documentType: file.fieldName === "player1Document" ? submission.player1DocumentType : submission.player2DocumentType
    }))
  );
}

function sortDocuments(items, mode) {
  const statusOrder = { pending: 0, approved: 1, rejected: 2 };
  const sorted = [...items];
  sorted.sort((left, right) => {
    if (mode === "oldest") {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }
    if (mode === "team") {
      return left.teamName.localeCompare(right.teamName) || left.originalName.localeCompare(right.originalName);
    }
    if (mode === "status") {
      return (statusOrder[left.reviewStatus] ?? 99) - (statusOrder[right.reviewStatus] ?? 99) || left.teamName.localeCompare(right.teamName);
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  return sorted;
}

function renderDocumentBrowserCard(file) {
  const documentLabel = file.fieldName === "player1Document" ? "Player 1" : "Player 2";
  return `
    <article class="doc-browser-card doc-browser-${escapeHtml(file.reviewStatus)}">
      <div class="doc-browser-head">
        <div>
          <p class="info-label">${escapeHtml(documentLabel)}</p>
          <h3>${escapeHtml(file.teamName)}</h3>
        </div>
        <span class="badge badge-${file.reviewStatus}">${escapeHtml(file.reviewStatus)}</span>
      </div>
      <div class="doc-browser-meta">
        <p class="info-row"><span class="info-key">Player</span><span>${escapeHtml(file.playerEpic)}</span></p>
        <p class="info-row"><span class="info-key">Discord</span><span>${escapeHtml(file.playerDiscord)}</span></p>
        <p class="info-row"><span class="info-key">Document type</span><span>${escapeHtml(formatDocumentType(file.documentType))}</span></p>
        <p class="info-row"><span class="info-key">Submitted</span><span>${formatDate(file.createdAt)}</span></p>
      </div>
      <p class="doc-name">${escapeHtml(file.originalName)}</p>
      <div class="file-links">
        <a class="button button-secondary" href="${file.url}" target="_blank" rel="noreferrer">Open</a>
        <a class="button button-secondary" href="${file.url}" download>Download</a>
        <button class="button button-secondary" type="button" data-select-submission="${file.submissionId}">Review team</button>
      </div>
    </article>
  `;
}

function getFileLabel(files, fieldName) {
  const match = files.find((file) => file.fieldName === fieldName);
  return match ? match.originalName : "Missing";
}

function formatDocumentType(value) {
  const labels = {
    cin: "CIN",
    passport: "Passport",
    drivers_license: "Driver's license",
    birth_certificate: "Birth certificate"
  };
  return labels[value] || "Not specified";
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
