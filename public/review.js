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
    submissionsList.innerHTML = '<p class="empty queue-empty">No verification submissions match the current filters.</p>';
    return;
  }

  for (const submission of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-pill team-pill-${submission.reviewStatus}${submission.id === selectedId ? " selected-team-pill" : ""}`;
    button.setAttribute("aria-pressed", submission.id === selectedId ? "true" : "false");
    button.title = `${submission.teamName} • ${capitalize(submission.reviewStatus)} • ${submission.player1Epic} / ${submission.player2Epic}`;
    button.innerHTML = `
      <span class="team-pill-dot" aria-hidden="true"></span>
      <span class="team-pill-name">${escapeHtml(submission.teamName)}</span>
      <span class="team-pill-status">${escapeHtml(submission.reviewStatus)}</span>
    `;
    const selectSubmission = () => {
      selectedId = submission.id;
      renderSubmissions();
      renderDetail();
    };
    button.addEventListener("click", selectSubmission);
    submissionsList.appendChild(button);
  }
}

function renderDetail() {
  const submission = submissions.find((item) => item.id === selectedId);
  if (!submission) {
    detailContent.innerHTML = '<p class="empty">Select a submission to review.</p>';
    return;
  }

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
            <span class="detail-meta-pill">${submission.files.length} document${submission.files.length === 1 ? "" : "s"}</span>
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
              <strong>${submission.files.length}</strong>
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
              ${renderPlayerCard("Player 1", "Primary", submission.player1Epic, submission.player1Discord, getFileLabel(submission.files, "player1Document"))}
              ${renderPlayerCard("Player 2", "Secondary", submission.player2Epic, submission.player2Discord, getFileLabel(submission.files, "player2Document"))}
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
              ${submission.files.map(renderFileCard).join("")}
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
    renderDetail();
  });
}

function renderPlayerCard(label, role, epic, discord, documentLabel) {
  return `
    <article class="info-card player-detail-card">
      <div class="player-card-head">
        <p class="info-label">${escapeHtml(label)}</p>
        <span class="player-chip">${escapeHtml(role)}</span>
      </div>
      <strong class="info-value">${escapeHtml(epic)}</strong>
      <div class="info-stack">
        <p class="info-row"><span class="info-key">Discord</span><span>${escapeHtml(discord)}</span></p>
        <p class="info-row"><span class="info-key">Document</span><span>${escapeHtml(documentLabel)}</span></p>
      </div>
    </article>
  `;
}

function renderFileCard(file) {
  const preview = file.contentType.startsWith("image/")
    ? `<img class="doc-preview" src="${file.url}" alt="${escapeHtml(file.originalName)}" />`
    : `<div class="doc-fallback">${escapeHtml(file.contentType.includes("pdf") ? "PDF" : "File")}</div>`;

  return `
    <article class="doc-card">
      <div class="doc-card-head">
        <p class="info-label">${escapeHtml(file.fieldName === "player1Document" ? "Player 1 Document" : "Player 2 Document")}</p>
        <span class="doc-type-pill">${escapeHtml(file.contentType.includes("pdf") ? "PDF" : file.contentType.split("/")[1] || "file")}</span>
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
