const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "mge2026admin");
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");

if (IS_PRODUCTION && !process.env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD must be set in production.");
}

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);
ensureJsonFile(SUBMISSIONS_FILE);
const sessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf"
};
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["cin", "passport", "drivers_license", "birth_certificate"]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/admin/session") {
      const session = getAdminSession(req);
      return sendJson(res, 200, {
        authenticated: Boolean(session),
        username: session ? session.username : null
      });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      const payload = await readJsonBody(req);
      if (!isValidAdminCredential(payload.username, payload.password)) {
        return sendJson(res, 401, { error: "Invalid admin credentials." });
      }
      const sessionToken = crypto.randomUUID();
      sessions.set(sessionToken, {
        username: ADMIN_USERNAME,
        createdAt: Date.now()
      });
      return sendJson(res, 200, { authenticated: true }, {
        "Set-Cookie": createSessionCookie(sessionToken)
      });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
      const token = getSessionToken(req);
      if (token) {
        sessions.delete(token);
      }
      return sendJson(res, 200, { authenticated: false }, {
        "Set-Cookie": expireSessionCookie()
      });
    }

    if (req.method === "GET" && url.pathname === "/api/submissions") {
      if (!requireAdmin(req, res)) {
        return;
      }
      return sendJson(res, 200, readJson(SUBMISSIONS_FILE));
    }

    if (req.method === "GET" && url.pathname === "/api/submissions.csv") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const submissions = readJson(SUBMISSIONS_FILE);
      const csv = submissionsToCsv(submissions);
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[".csv"],
        "Content-Disposition": "attachment; filename=\"mge-submissions.csv\"",
        "Cache-Control": "no-store"
      });
      res.end(csv);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/submissions") {
      const form = await readMultipartForm(req);
      const submissions = readJson(SUBMISSIONS_FILE);
      const validationError = validateSubmission(form.fields, form.files, submissions);
      if (validationError) {
        return sendJson(res, 400, { error: validationError });
      }

      const storedFiles = saveUploadedFiles(form.files);
      const submission = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        reviewStatus: "pending",
        teamName: normalizeSubmissionValue(form.fields.teamName),
        player1Epic: normalizeSubmissionValue(form.fields.player1Epic),
        player1Discord: normalizeSubmissionValue(form.fields.player1Discord),
        player1DocumentType: normalizeSubmissionValue(form.fields.player1DocumentType),
        player2Epic: normalizeSubmissionValue(form.fields.player2Epic),
        player2Discord: normalizeSubmissionValue(form.fields.player2Discord),
        player2DocumentType: normalizeSubmissionValue(form.fields.player2DocumentType),
        consentAt: new Date().toISOString(),
        files: storedFiles
      };

      submissions.push(submission);
      writeJson(SUBMISSIONS_FILE, submissions);
      return sendJson(res, 201, { submission });
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/submissions/") && url.pathname.endsWith("/review")) {
      if (!requireAdmin(req, res)) {
        return;
      }
      const id = url.pathname.split("/")[3];
      const payload = await readJsonBody(req);
      if (!["pending", "approved", "rejected"].includes(payload.reviewStatus)) {
        return sendJson(res, 400, { error: "Invalid review status." });
      }

      const submissions = readJson(SUBMISSIONS_FILE);
      const entry = submissions.find((item) => item.id === id);
      if (!entry) {
        return sendJson(res, 404, { error: "Submission not found." });
      }

      entry.reviewStatus = payload.reviewStatus;
      entry.adminNotes = typeof payload.adminNotes === "string" ? payload.adminNotes.trim() : entry.adminNotes || "";
      entry.reviewedBy = ADMIN_USERNAME;
      entry.reviewedAt = new Date().toISOString();
      writeJson(SUBMISSIONS_FILE, submissions);
      return sendJson(res, 200, { submission: entry });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/submissions/")) {
      if (!requireAdmin(req, res)) {
        return;
      }
      const id = url.pathname.split("/")[3];
      const submissions = readJson(SUBMISSIONS_FILE);
      const index = submissions.findIndex((item) => item.id === id);
      if (index === -1) {
        return sendJson(res, 404, { error: "Submission not found." });
      }

      const [removed] = submissions.splice(index, 1);
      deleteUploadedFiles(removed.files || []);
      writeJson(SUBMISSIONS_FILE, submissions);
      return sendJson(res, 200, { deleted: true, submissionId: id });
    }

    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      if (!requireAdmin(req, res)) {
        return;
      }
      const targetPath = path.normalize(path.join(UPLOAD_DIR, url.pathname.replace("/uploads/", "")));
      if (!targetPath.startsWith(UPLOAD_DIR)) {
        return sendText(res, 403, "Forbidden");
      }
      return serveFile(res, targetPath);
    }

    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Server error", details: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MGE verification system running on ${HOST}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function ensureJsonFile(target) {
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, "[]\n", "utf8");
  }
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    ...extraHeaders
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function requireAdmin(req, res) {
  if (getAdminSession(req)) {
    return true;
  }
  sendJson(res, 401, { error: "Admin authentication required." });
  return false;
}

function getAdminSession(req) {
  const token = getSessionToken(req);
  if (!token) {
    return null;
  }
  return sessions.get(token) || null;
}

function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies.mge_admin_session || null;
}

function parseCookies(header) {
  return header.split(";").reduce((accumulator, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }
    accumulator[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return accumulator;
  }, {});
}

function createSessionCookie(token) {
  const secure = shouldUseSecureCookies() ? "; Secure" : "";
  return `mge_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`;
}

function expireSessionCookie() {
  const secure = shouldUseSecureCookies() ? "; Secure" : "";
  return `mge_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function shouldUseSecureCookies() {
  return process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

function isValidAdminCredential(username, password) {
  if (typeof username !== "string" || typeof password !== "string") {
    return false;
  }
  const providedUsername = Buffer.from(username, "utf8");
  const expectedUsername = Buffer.from(ADMIN_USERNAME, "utf8");
  const providedPassword = Buffer.from(password, "utf8");
  const expectedPassword = Buffer.from(ADMIN_PASSWORD, "utf8");

  return sameBuffer(providedUsername, expectedUsername) && sameBuffer(providedPassword, expectedPassword);
}

function sameBuffer(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(res, 404, "Not found");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const targetPath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    return sendText(res, 403, "Forbidden");
  }
  return serveFile(res, targetPath);
}

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRequestBuffer(req);
  return JSON.parse(raw.toString("utf8") || "{}");
}

async function readMultipartForm(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    throw new Error("Missing multipart boundary.");
  }

  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const body = await readRequestBuffer(req);
  const parts = splitBuffer(body, boundary).slice(1, -1);
  const fields = {};
  const files = [];

  for (const part of parts) {
    const cleanPart = trimCrlf(part);
    const headerEnd = cleanPart.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) {
      continue;
    }

    const headerText = cleanPart.subarray(0, headerEnd).toString("utf8");
    const content = cleanPart.subarray(headerEnd + 4);
    const disposition = headerText.split("\r\n").find((line) => line.toLowerCase().startsWith("content-disposition")) || "";
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      continue;
    }

    const fieldName = nameMatch[1];
    const fileNameMatch = disposition.match(/filename="([^"]*)"/i);
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);

    if (fileNameMatch && fileNameMatch[1]) {
      files.push({
        fieldName,
        originalName: path.basename(fileNameMatch[1]),
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : "application/octet-stream",
        buffer: content
      });
    } else {
      fields[fieldName] = content.toString("utf8");
    }
  }

  return { fields, files };
}

function splitBuffer(buffer, separator) {
  const result = [];
  let start = 0;
  let index;
  while ((index = buffer.indexOf(separator, start)) !== -1) {
    result.push(buffer.subarray(start, index));
    start = index + separator.length;
  }
  result.push(buffer.subarray(start));
  return result;
}

function trimCrlf(buffer) {
  let start = 0;
  let end = buffer.length;
  while (start < end && (buffer[start] === 13 || buffer[start] === 10)) {
    start += 1;
  }
  while (end > start && (buffer[end - 1] === 13 || buffer[end - 1] === 10)) {
    end -= 1;
  }
  return buffer.subarray(start, end);
}

function saveUploadedFiles(files) {
  return files.map((file) => {
    const ext = path.extname(file.originalName) || guessExtension(file.contentType);
    const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const target = path.join(UPLOAD_DIR, storedName);
    fs.writeFileSync(target, file.buffer);
    return {
      fieldName: file.fieldName,
      originalName: file.originalName,
      storedName,
      contentType: file.contentType,
      size: file.buffer.length,
      url: `/uploads/${storedName}`
    };
  });
}

function deleteUploadedFiles(files) {
  for (const file of files) {
    if (!file || !file.storedName) {
      continue;
    }
    const target = path.join(UPLOAD_DIR, path.basename(file.storedName));
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }
}

function guessExtension(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg")) return ".jpg";
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("webp")) return ".webp";
  return ".bin";
}

function validateSubmission(fields, files, existingSubmissions = []) {
  const teamName = normalizeSubmissionValue(fields.teamName);
  const player1Epic = normalizeSubmissionValue(fields.player1Epic);
  const player1Discord = normalizeSubmissionValue(fields.player1Discord);
  const player1DocumentType = normalizeSubmissionValue(fields.player1DocumentType);
  const player2Epic = normalizeSubmissionValue(fields.player2Epic);
  const player2Discord = normalizeSubmissionValue(fields.player2Discord);
  const player2DocumentType = normalizeSubmissionValue(fields.player2DocumentType);

  if (!teamName) return "Team name is required.";
  if (teamName.length < 3) return "Team name must be at least 3 characters.";
  if (teamName.length > 40) return "Team name must stay under 40 characters.";

  const textValidationError =
    validatePlayerField(player1Epic, "Player 1 Epic username") ||
    validateDiscordValue(player1Discord, "Player 1 Discord username") ||
    validatePlayerField(player2Epic, "Player 2 Epic username") ||
    validateDiscordValue(player2Discord, "Player 2 Discord username");
  if (textValidationError) {
    return textValidationError;
  }

  if (normalizeKey(player1Epic) === normalizeKey(player2Epic)) {
    return "Player 1 and player 2 must use different Epic usernames.";
  }

  if (normalizeKey(player1Discord) === normalizeKey(player2Discord)) {
    return "Player 1 and player 2 must use different Discord usernames.";
  }

  if (!ALLOWED_DOCUMENT_TYPES.has(player1DocumentType) || !ALLOWED_DOCUMENT_TYPES.has(player2DocumentType)) {
    return "A valid document type is required for both players.";
  }

  if (!isConsentAccepted(fields.consent)) {
    return "Consent confirmation is required before submitting.";
  }

  const groupedFiles = {
    player1Document: files.filter((file) => file.fieldName === "player1Document"),
    player2Document: files.filter((file) => file.fieldName === "player2Document")
  };
  const unexpectedFile = files.find((file) => !Object.prototype.hasOwnProperty.call(groupedFiles, file.fieldName));
  if (unexpectedFile) {
    return "Unexpected upload field received.";
  }

  if (groupedFiles.player1Document.length !== 1 || groupedFiles.player2Document.length !== 1) {
    return "Upload exactly one identity document for each player.";
  }

  for (const file of files) {
    const fileError = validateUploadedFile(file);
    if (fileError) {
      return fileError;
    }
  }

  const teamNameTaken = existingSubmissions.some((submission) => normalizeKey(submission.teamName) === normalizeKey(teamName));
  if (teamNameTaken) {
    return "That team name already has a verification package.";
  }

  const duoKey = createDuoKey(player1Epic, player2Epic);
  const duplicateDuo = existingSubmissions.some((submission) => createDuoKey(submission.player1Epic, submission.player2Epic) === duoKey);
  if (duplicateDuo) {
    return "This duo already has a verification package.";
  }

  return null;
}

function validatePlayerField(value, label) {
  if (!value) {
    return `${label} is required.`;
  }
  if (value.length < 2) {
    return `${label} must be at least 2 characters.`;
  }
  if (value.length > 32) {
    return `${label} must stay under 32 characters.`;
  }
  return null;
}

function validateDiscordValue(value, label) {
  const baseError = validatePlayerField(value, label);
  if (baseError) {
    return baseError;
  }
  if (/\s/.test(value)) {
    return `${label} cannot contain spaces.`;
  }
  return null;
}

function validateUploadedFile(file) {
  if (!file || !file.originalName) {
    return "Both player identity documents are required.";
  }

  const ext = path.extname(file.originalName).toLowerCase();
  const mimeType = String(file.contentType || "").toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    return "Only PNG, JPG, WEBP, and PDF documents are allowed.";
  }

  if (mimeType && mimeType !== "application/octet-stream" && !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    return "Only PNG, JPG, WEBP, and PDF documents are allowed.";
  }

  if (!file.buffer || !file.buffer.length) {
    return "Uploaded documents cannot be empty.";
  }

  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    return "Each uploaded document must be 8 MB or smaller.";
  }

  return null;
}

function normalizeSubmissionValue(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeSubmissionValue(value).toLowerCase();
}

function createDuoKey(playerOne, playerTwo) {
  return [normalizeKey(playerOne), normalizeKey(playerTwo)].sort().join("::");
}

function isConsentAccepted(value) {
  return ["on", "true", "1", "yes"].includes(normalizeKey(value));
}

function submissionsToCsv(submissions) {
  const header = [
    "id",
    "createdAt",
    "teamName",
    "player1Epic",
    "player1Discord",
    "player1DocumentType",
    "player2Epic",
    "player2Discord",
    "player2DocumentType",
    "consentAt",
    "reviewStatus",
    "reviewedAt",
    "reviewedBy",
    "adminNotes",
    "player1DocumentName",
    "player1DocumentUrl",
    "player2DocumentName",
    "player2DocumentUrl"
  ];

  const rows = [header];
  for (const submission of submissions) {
    const player1Doc = getFileByField(submission.files, "player1Document");
    const player2Doc = getFileByField(submission.files, "player2Document");
    rows.push([
      submission.id || "",
      submission.createdAt || "",
      submission.teamName || "",
      submission.player1Epic || "",
      submission.player1Discord || "",
      submission.player1DocumentType || "",
      submission.player2Epic || "",
      submission.player2Discord || "",
      submission.player2DocumentType || "",
      submission.consentAt || "",
      submission.reviewStatus || "",
      submission.reviewedAt || "",
      submission.reviewedBy || "",
      submission.adminNotes || "",
      player1Doc ? player1Doc.originalName || "" : "",
      player1Doc ? player1Doc.url || "" : "",
      player2Doc ? player2Doc.originalName || "" : "",
      player2Doc ? player2Doc.url || "" : ""
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function getFileByField(files, fieldName) {
  if (!Array.isArray(files)) {
    return null;
  }
  return files.find((file) => file && file.fieldName === fieldName) || null;
}

function csvEscape(value) {
  const text = String(value ?? "");
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}
