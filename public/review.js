const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const exportCsvLink = document.getElementById("exportCsvLink");
const logoutButton = document.getElementById("logoutButton");
const statsGrid = document.getElementById("statsGrid");
const submissionsList = document.getElementById("submissionsList");
const detailContent = document.getElementById("detailContent");
const filterRow = document.getElementById("filterRow");
const queueSummary = document.getElementById("queueSummary");
const queueSearch = document.getElementById("queueSearch");

let submissions = [];
let selectedId = null;
let activeFilter = "all";
let searchQuery = "";

loginForm.addEventListener("submit", onLogin);
logoutButton.addEventListener("click", onLogout);
filterRow.addEventListener("click", onFilterClick);
queueSearch.addEventListener("input", onSearchInput);

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
  selectedId = null;
  showLogin();
}

async function loadDashboard() {
  const response = await fetch("/api/submissions");
  if (response.status === 401) {
    showLogin();
    return;
  }
  submissions = await response.json();
  if (!selectedId && submissions.length) {
    selectedId = submissions[0].id;
  }
  if (selectedId && !submissions.some((item) => item.id === selectedId)) {
    selectedId = submissions[0] ? submissions[0].id : null;
  }
  renderStats(submissions);
  renderSubmissions();
  renderDetail();
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
    submissionsList.innerHTML = '<p class="empty">No verification submissions yet.</p>';
    return;
  }

  for (const submission of filtered) {
    const article = document.createElement("article");
    article.className = `review-card review-list-card${submission.id === selectedId ? " selected-card" : ""}`;
    article.innerHTML = `
      <div class="review-top">
        <div>
          <h3>${escapeHtml(submission.teamName)}</h3>
          <p class="queue-player-line">${escapeHtml(submission.player1Epic)} and ${escapeHtml(submission.player2Epic)}</p>
        </div>
        <span class="badge badge-${submission.reviewStatus}">${escapeHtml(submission.reviewStatus)}</span>
      </div>
      <div class="queue-meta">
        <span class="queue-meta-item">Submitted ${formatDate(submission.createdAt)}</span>
        <span class="queue-meta-item">2 documents</span>
      </div>
    `;
    article.addEventListener("click", () => {
      selectedId = submission.id;
      renderSubmissions();
      renderDetail();
    });
    submissionsList.appendChild(article);
  }
}

function renderDetail() {
  const submission = submissions.find((item) => item.id === selectedId);
  if (!submission) {
    detailContent.innerHTML = '<p class="empty">Select a submission to review.</p>';
    return;
  }

  detailContent.innerHTML = `
    <div class="detail-head detail-summary">
      <div class="detail-title-block">
        <p class="eyebrow">Submission</p>
        <h3>${escapeHtml(submission.teamName)}</h3>
        <div class="detail-meta-line">
          <span class="detail-meta-pill">Submitted ${formatDate(submission.createdAt)}</span>
          <span class="detail-meta-pill">${submission.files.length} document${submission.files.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div class="detail-status-block">
        <span class="badge badge-${submission.reviewStatus}">${escapeHtml(submission.reviewStatus)}</span>
        <p class="muted-line">${submission.reviewedAt ? `Last reviewed ${formatDate(submission.reviewedAt)}` : "No review saved yet."}</p>
      </div>
    </div>

    <section class="detail-section detail-section-compact">
      <div class="summary-strip">
        <article class="summary-pill-card">
          <p class="info-label">Team</p>
          <strong class="info-value">${escapeHtml(submission.teamName)}</strong>
        </article>
        <article class="summary-pill-card">
          <p class="info-label">Documents</p>
          <strong class="info-value">${submission.files.length}</strong>
        </article>
        <article class="summary-pill-card">
          <p class="info-label">Reviewed By</p>
          <strong class="info-value">${escapeHtml(submission.reviewedBy || "Not assigned")}</strong>
        </article>
      </div>
    </section>

    <div class="detail-grid detail-grid-players">
      <article class="info-card">
        <div class="player-card-head">
          <p class="info-label">Player 1</p>
          <span class="player-chip">Primary</span>
        </div>
        <strong class="info-value">${escapeHtml(submission.player1Epic)}</strong>
        <div class="info-stack">
          <p class="info-row"><span class="info-key">Discord</span><span>${escapeHtml(submission.player1Discord)}</span></p>
          <p class="info-row"><span class="info-key">Document</span><span>${escapeHtml(getFileLabel(submission.files, "player1Document"))}</span></p>
        </div>
      </article>
      <article class="info-card">
        <div class="player-card-head">
          <p class="info-label">Player 2</p>
          <span class="player-chip">Secondary</span>
        </div>
        <strong class="info-value">${escapeHtml(submission.player2Epic)}</strong>
        <div class="info-stack">
          <p class="info-row"><span class="info-key">Discord</span><span>${escapeHtml(submission.player2Discord)}</span></p>
          <p class="info-row"><span class="info-key">Document</span><span>${escapeHtml(getFileLabel(submission.files, "player2Document"))}</span></p>
        </div>
      </article>
    </div>

    <section class="detail-section">
      <div class="section-heading detail-section-head">
        <div>
          <p class="eyebrow">Documents</p>
          <h3>Identity files</h3>
        </div>
      </div>
      <div class="documents-grid">
        ${submission.files.map(renderFileCard).join("")}
      </div>
    </section>

    <section class="detail-section">
      <div class="section-heading detail-section-head">
        <div>
          <p class="eyebrow">Decision</p>
          <h3>Review controls</h3>
        </div>
      </div>
      <form id="reviewForm" class="stack review-form">
        <div class="field">
          <span class="field-label">Review status</span>
          <div class="status-pill-group" role="radiogroup" aria-label="Review status">
            ${renderStatusPills(submission.reviewStatus)}
          </div>
          <input type="hidden" name="reviewStatus" value="${escapeHtml(submission.reviewStatus)}" />
        </div>
        <label class="field">
          <span class="field-label">Admin notes</span>
          <textarea name="adminNotes" rows="5" placeholder="Internal review notes">${escapeHtml(submission.adminNotes || "")}</textarea>
        </label>
        <div class="submit-row">
          <button class="button" type="submit">Save review</button>
          <button class="button button-secondary danger-button" id="deleteSubmissionButton" type="button">Delete submission</button>
          <p class="status" id="reviewStatusText">${submission.reviewedAt ? `Last reviewed ${formatDate(submission.reviewedAt)}` : ""}</p>
        </div>
      </form>
    </section>
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
    renderDetail();
  });
}

function renderFileCard(file) {
  const preview = file.contentType.startsWith("image/")
    ? `<img class="doc-preview" src="${file.url}" alt="${escapeHtml(file.originalName)}" />`
    : `<div class="doc-fallback">${escapeHtml(file.contentType.includes("pdf") ? "PDF" : "File")}</div>`;

  return `
    <article class="doc-card">
      <p class="info-label">${escapeHtml(file.fieldName === "player1Document" ? "Player 1 Document" : "Player 2 Document")}</p>
      ${preview}
      <p class="doc-name">${escapeHtml(file.originalName)}</p>
      <div class="file-links">
        <a class="button button-secondary" href="${file.url}" target="_blank" rel="noreferrer">Open</a>
        <a class="button button-secondary" href="${file.url}" download>Download</a>
      </div>
    </article>
  `;
}

function renderStatusOptions(currentStatus) {
  return ["pending", "approved", "rejected"]
    .map((status) => `<option value="${status}"${status === currentStatus ? " selected" : ""}>${capitalize(status)}</option>`)
    .join("");
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
  renderSubmissions();
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
  renderDetail();
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  exportCsvLink.classList.add("hidden");
  logoutButton.classList.add("hidden");
  detailContent.innerHTML = "";
  requestAnimationFrame(() => loginPanel.classList.add("revealed"));
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  exportCsvLink.classList.remove("hidden");
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
  return submissions.filter((item) => {
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
  });
}

function getFileLabel(files, fieldName) {
  const match = files.find((file) => file.fieldName === fieldName);
  return match ? match.originalName : "Missing";
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
