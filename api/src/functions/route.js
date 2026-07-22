const OpenAI = require("openai").default;
const { app } = require("@azure/functions");
const { EmailClient } = require("@azure/communication-email");
const { CosmosClient } = require("@azure/cosmos");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const ENDPOINT = "https://fusebox-resource.services.ai.azure.com/openai/v1";
const AGENT_ENDPOINT =
  "https://FuseBox-resource.services.ai.azure.com/api/projects/FuseBox/agents/FuseBox/endpoint/protocols/openai/responses?api-version=v1";
const AUDITOR_ENDPOINT =
  "https://FuseBox-resource.services.ai.azure.com/api/projects/FuseBox/agents/FuseBox-Auditor/endpoint/protocols/openai/responses?api-version=v1";
const API_KEY = process.env.AZURE_API_KEY;
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY;
const STORAGE_CONTAINER_NAME = process.env.STORAGE_CONTAINER_NAME;
const BLOB_SAS_TOKEN = process.env.BLOB_SAS_TOKEN;
const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING;
const ACS_SENDER = process.env.ACS_SENDER;
const ACS_RECIPIENT = process.env.ACS_RECIPIENT;
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;

const CHEAP_MODEL = "phi-4-mini";
const MID_MODEL = "DeepSeek-V4-Flash";
const PREMIUM_MODEL = "Kimi-K2.6";

const CHEAP_COST_PER_1K = 0.0001;
const MID_COST_PER_1K = 0.0014;
const PREMIUM_COST_PER_1K = 0.007;

const CONFIDENCE_THRESHOLD = 75;
const ANOMALY_THRESHOLD = 2;
const ANOMALY_WINDOW_MINUTES = 3;
const AGENT_TIMEOUT = 25000;
const CORRECTION_TIMEOUT = 15000;

const UNCERTAINTY_WORDS = [
  "unclear",
  "ambiguous",
  "could be",
  "uncertain",
  "not sure",
  "borderline",
  "possibly",
  "might be",
  "hard to say",
  "difficult to determine",
  "on the fence",
  "leaning towards",
  "may be",
  "not entirely",
  "somewhat",
  "appears to be",
  "seems like",
  "could go either way",
  "limited information",
  "insufficient",
  "vague",
  "generic",
  "broad",
  "unspecific",
  "no clear",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

let cosmosContainer;
function getCosmosContainer() {
  if (!cosmosContainer) {
    const client = new CosmosClient({
      endpoint: COSMOS_ENDPOINT,
      key: COSMOS_KEY,
    });
    cosmosContainer = client.database("FuseBoxDB").container("TicketMemory");
  }
  return cosmosContainer;
}

async function sendAlertEmail(subject, bodyText) {
  try {
    const client = new EmailClient(ACS_CONNECTION_STRING);
    const message = {
      senderAddress: ACS_SENDER,
      recipients: { to: [{ address: ACS_RECIPIENT }] },
      content: {
        subject,
        plainText: bodyText,
        html: `<html><body style="font-family:Arial,sans-serif;background:#0e0e14;color:white;padding:24px;">
          <div style="max-width:600px;margin:0 auto;background:#1a0a2e;border:1px solid #D30E8C;border-radius:12px;padding:24px;">
            <h2 style="color:#D30E8C;margin-top:0;">FuseBox AI Ops — AI Spend Alert</h2>
            <p style="color:#ccc;">${bodyText.replace(/\n/g, "<br/>")}</p>
            <hr style="border-color:#582873;"/>
            <p style="color:#666;font-size:12px;">FuseBox AI Ops — Team Token Burners — Insight Hackathon 2026</p>
          </div>
        </body></html>`,
      },
    };
    const poller = await client.beginSend(message);
    poller
      .pollUntilDone()
      .catch((e) => console.error("Email poll failed:", e.message));
  } catch (e) {
    console.error("Email alert failed:", e.message);
  }
}

async function checkKnownIssues(prompt) {
  try {
    const url = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${STORAGE_CONTAINER_NAME}/knownIssues.json?${BLOB_SAS_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
    const data = await res.json();
    const lowerPrompt = prompt.toLowerCase();
    const matches = [];
    for (const issue of data.knownIssues) {
      for (const pattern of issue.pattern) {
        if (lowerPrompt.includes(pattern.toLowerCase())) {
          matches.push({
            id: issue.id,
            title: issue.title,
            severity: issue.severity,
            recommendation: issue.recommendation,
          });
          break;
        }
      }
    }
    return matches.length > 0
      ? { matched: true, issues: matches }
      : { matched: false, issues: [] };
  } catch (e) {
    return { matched: false, issues: [], error: e.message };
  }
}

async function getMemoryContext(complexity) {
  try {
    const container = getCosmosContainer();
    const query = {
      query: `SELECT TOP 3 c.prompt, c.complexity, c.model, c.reason, c.selfCorrected, c.confidence, c.resolutionStatus, c.resolutionNotes
              FROM c WHERE c.complexity = @complexity ORDER BY c._ts DESC`,
      parameters: [{ name: "@complexity", value: complexity }],
    };
    const { resources } = await container.items.query(query).fetchAll();
    return resources;
  } catch (e) {
    console.error("Cosmos memory read failed:", e.message);
    return [];
  }
}

async function checkAnomaly(complexity) {
  try {
    const container = getCosmosContainer();
    const windowStart = new Date(
      Date.now() - ANOMALY_WINDOW_MINUTES * 60 * 1000,
    ).toISOString();
    const query = {
      query:
        "SELECT VALUE COUNT(1) FROM c WHERE c.complexity = @complexity AND c.timestamp >= @windowStart",
      parameters: [
        { name: "@complexity", value: complexity },
        { name: "@windowStart", value: windowStart },
      ],
    };
    const { resources } = await container.items.query(query).fetchAll();
    const count = resources[0] || 0;
    return { anomalyDetected: count >= ANOMALY_THRESHOLD, count };
  } catch (e) {
    console.error("Anomaly check failed:", e.message);
    return { anomalyDetected: false, count: 0 };
  }
}

async function writeMemory(entry) {
  try {
    const container = getCosmosContainer();
    await container.items.upsert({
      id: entry.id,
      prompt: entry.prompt,
      complexity: entry.complexity,
      model: entry.model,
      risk: entry.risk,
      reason: entry.reason,
      selfCorrected: entry.selfCorrected || false,
      confidence: entry.confidence || 0,
      resolutionStatus: null,
      resolutionNotes: null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Cosmos memory write failed:", e.message);
  }
}

async function updateKnowledgeBase(prompt, agentModel, kbIssues, context) {
  try {
    const url = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${STORAGE_CONTAINER_NAME}/knownIssues.json?${BLOB_SAS_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const words = prompt
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const newPattern = words.slice(0, 3).join(" ");
    const alreadyExists = data.knownIssues.some((issue) =>
      issue.pattern.some((p) => p.includes(newPattern)),
    );
    if (alreadyExists) return;
    const severity =
      agentModel === PREMIUM_MODEL
        ? "high"
        : agentModel === MID_MODEL
          ? "medium"
          : "low";
    const newIssue = {
      id: `KI-AUTO-${Date.now()}`,
      pattern: [newPattern],
      title: `Auto-learned: ${prompt.slice(0, 50)}`,
      severity,
      recommendation: `Route to ${agentModel} — learned from agent override`,
    };
    data.knownIssues.push(newIssue);
    await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ms-blob-type": "BlockBlob",
      },
      body: JSON.stringify(data),
    });
    context.log("KB auto-updated with new pattern:", newPattern);
  } catch (e) {
    context.log("KB auto-update failed:", e.message);
  }
}

async function uploadReportToBlob(incidentId, htmlContent, context) {
  try {
    if (!STORAGE_ACCOUNT_KEY) {
      context.log("STORAGE_ACCOUNT_KEY is not set — cannot upload report.");
      return null;
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(
      STORAGE_ACCOUNT_NAME,
      STORAGE_ACCOUNT_KEY,
    );

    const blobServiceClient = new BlobServiceClient(
      `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      sharedKeyCredential,
    );

    const containerClient =
      blobServiceClient.getContainerClient("fusebox-reports");
    const filename = `${incidentId}-${Date.now()}.html`;
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    const buffer = Buffer.from(htmlContent, "utf-8");

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: "text/html" },
    });

    context.log("Report uploaded successfully:", filename);

    const expiresOn = new Date();
    expiresOn.setHours(expiresOn.getHours() + 24);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: "fusebox-reports",
        blobName: filename,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    const reportUrl = `${blockBlobClient.url}?${sasToken}`;
    context.log("Report SAS URL generated:", reportUrl);
    return reportUrl;
  } catch (e) {
    context.log("Report upload exception:", e.message);
    return null;
  }
}

async function updateReportWithResolution(
  reportUrl,
  resolutionStatus,
  resolutionNotes,
  context,
) {
  try {
    if (!STORAGE_ACCOUNT_KEY || !reportUrl) return;

    const sharedKeyCredential = new StorageSharedKeyCredential(
      STORAGE_ACCOUNT_NAME,
      STORAGE_ACCOUNT_KEY,
    );

    const blobServiceClient = new BlobServiceClient(
      `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      sharedKeyCredential,
    );

    const urlObj = new URL(reportUrl);
    const pathParts = urlObj.pathname.split("/");
    const filename = pathParts[pathParts.length - 1];

    const containerClient =
      blobServiceClient.getContainerClient("fusebox-reports");
    const blockBlobClient = containerClient.getBlockBlobClient(filename);

    const downloadRes = await blockBlobClient.downloadToBuffer();
    let html = downloadRes.toString("utf-8");

    const statusColor =
      resolutionStatus === "resolved"
        ? "#4caf50"
        : resolutionStatus === "escalated"
          ? "#f0a500"
          : "#ef4444";
    const statusLabel =
      resolutionStatus === "resolved"
        ? "Resolved"
        : resolutionStatus === "escalated"
          ? "Escalated"
          : "Failed";

    const resolutionBlock = `
    <div class="section" style="border-color:${statusColor};box-shadow:0 0 20px ${statusColor}22;">
      <div class="section-title" style="color:${statusColor};">Resolution Outcome — Feedback Loop Active</div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
        <div style="background:${statusColor}22;border:1px solid ${statusColor};border-radius:20px;padding:6px 20px;font-size:13px;font-weight:bold;color:${statusColor};text-transform:uppercase;letter-spacing:1px;">${statusLabel}</div>
        <div style="font-size:12px;color:#888;">Outcome recorded: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
      ${resolutionNotes ? `<div style="background:rgba(255,255,255,0.04);border:1px solid #3a2560;border-radius:8px;padding:12px 16px;font-size:13px;color:#ddd;line-height:1.5;">${resolutionNotes}</div>` : ""}
      <div style="margin-top:12px;font-size:12px;color:#888;line-height:1.6;">This outcome has been written back to FuseBox AI Ops memory. Future tickets with similar patterns will factor this resolution result into their routing confidence score. The feedback loop is active.</div>
    </div>`;

    html = html.replace(
      '<div class="footer">',
      resolutionBlock + '\n    <div class="footer">',
    );

    const updatedBuffer = Buffer.from(html, "utf-8");

    context.log("Uploading updated report for:", filename);
    await blockBlobClient.uploadData(updatedBuffer, {
      blobHTTPHeaders: { blobContentType: "text/html" },
    });

    context.log("Report updated with resolution outcome:", resolutionStatus);
  } catch (e) {
    context.log("Report update exception:", e.message);
  }
}

function generateIncidentReportHTML(
  incidentId,
  prompt,
  complexity,
  model,
  risk,
  reason,
  confidence,
  anomalyCount,
  totalTokens,
  cost,
  savings,
  memoryContext,
  knownIssueContext,
  selfCorrected,
  auditorResult,
  auditorOverride,
  timestamp,
) {
  const priorityLabel =
    complexity === "complex"
      ? "P1 — Critical"
      : complexity === "medium"
        ? "P2 — High"
        : "P3 — Medium";
  const priorityColor =
    complexity === "complex"
      ? "#ef4444"
      : complexity === "medium"
        ? "#f0a500"
        : "#4F93D9";
  const modelColor =
    model === CHEAP_MODEL
      ? "#4F93D9"
      : model === MID_MODEL
        ? "#f0a500"
        : "#D30E8C";

  const memoryRows =
    memoryContext.length > 0
      ? memoryContext
          .map(
            (m, i) => `
        <tr style="border-bottom:1px solid #2a1a45;">
          <td style="padding:10px;color:#aaa;font-size:13px;">${i + 1}</td>
          <td style="padding:10px;color:#fff;font-size:13px;">${m.prompt}</td>
          <td style="padding:10px;color:#f0a500;font-size:13px;">${m.complexity}</td>
          <td style="padding:10px;color:#4F93D9;font-size:13px;">${m.model}</td>
          <td style="padding:10px;color:#4caf50;font-size:13px;">${m.confidence || "N/A"}%</td>
          <td style="padding:10px;font-size:13px;color:${m.resolutionStatus === "resolved" ? "#4caf50" : m.resolutionStatus === "failed" ? "#ef4444" : m.resolutionStatus === "escalated" ? "#f0a500" : "#555"};">${m.resolutionStatus || "Pending"}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="6" style="padding:16px;color:#555;text-align:center;font-size:13px;">No memory context available</td></tr>`;

  const kbSection = knownIssueContext.matched
    ? knownIssueContext.issues
        .map(
          (i) => `
        <div style="background:rgba(79,147,217,0.1);border:1px solid rgba(79,147,217,0.3);border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="color:#4F93D9;font-weight:bold;font-size:13px;margin-bottom:4px;">${i.title}</div>
          <div style="color:#aaa;font-size:12px;">Severity: ${i.severity} — ${i.recommendation}</div>
        </div>`,
        )
        .join("")
    : `<div style="color:#555;font-size:13px;padding:8px 0;">No known issues matched for this ticket pattern.</div>`;

  const annualSavings =
    savings !== "N/A" ? (parseFloat(savings) * 50000).toFixed(2) : "0.00";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FuseBox AI Ops — Incident Report — ${incidentId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #0e0e14; color: #fff; padding: 40px 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #1a0a2e 0%, #2d0f5e 50%, #1a0a2e 100%); border: 1px solid #D30E8C; border-radius: 16px; padding: 32px 40px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .header-left h1 { font-size: 28px; font-weight: bold; color: #fff; margin-bottom: 4px; }
    .header-left p { font-size: 12px; color: #a78bca; text-transform: uppercase; letter-spacing: 1px; }
    .header-right { text-align: right; }
    .incident-id { font-size: 22px; font-weight: bold; color: #D30E8C; font-family: monospace; }
    .incident-time { font-size: 12px; color: #888; margin-top: 4px; }
    .priority-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: bold; margin-top: 8px; background: rgba(239,68,68,0.2); color: ${priorityColor}; border: 1px solid ${priorityColor}; }
    .section { background: linear-gradient(145deg, #1c1430, #221840); border: 1px solid #3a2560; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; color: #D30E8C; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #3a2560; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .stat-block { background: rgba(255,255,255,0.04); border: 1px solid #3a2560; border-radius: 10px; padding: 16px; text-align: center; }
    .stat-value { font-size: 22px; font-weight: bold; color: #fff; font-family: monospace; }
    .stat-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .ticket-box { background: rgba(211,14,140,0.08); border: 1px solid rgba(211,14,140,0.25); border-left: 4px solid #D30E8C; border-radius: 8px; padding: 16px 20px; font-size: 15px; color: #fff; line-height: 1.5; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 6px; margin-bottom: 6px; }
    .badge-model { background: rgba(211,14,140,0.2); color: #fff; border: 1px solid ${modelColor}; }
    .badge-complexity { background: rgba(240,165,0,0.2); color: #fff; border: 1px solid #f0a500; }
    .badge-risk { background: rgba(239,68,68,0.2); color: #fff; border: 1px solid #ef4444; }
    .badge-corrected { background: rgba(255,215,0,0.2); color: #ffd700; border: 1px solid #ffd700; }
    .badge-auditor { background: rgba(255,140,0,0.2); color: #ffaa33; border: 1px solid #ff8c00; }
    .reason-box { background: rgba(88,40,115,0.2); border: 1px solid rgba(155,111,212,0.3); border-left: 3px solid #9b6fd4; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #e0c8ff; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #D30E8C; border-bottom: 1px solid #3a2560; }
    .savings-highlight { font-size: 32px; font-weight: bold; color: #D30E8C; text-shadow: 0 0 20px rgba(211,14,140,0.4); }
    .pink { color: #D30E8C; }
    .footer { text-align: center; padding: 24px; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-top: 1px solid #1e1030; margin-top: 24px; }
    .footer span { color: #D30E8C; }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <div class="header-left">
        <h1>FuseBox AI Ops</h1>
        <p>Autonomous AI FinOps for Enterprise IT — Incident Report</p>
        <p style="color:#555;font-size:11px;margin-top:4px;">Team Token Burners — Insight Hackathon 2026</p>
      </div>
      <div class="header-right">
        <div class="incident-id">${incidentId}</div>
        <div class="incident-time">${timestamp}</div>
        <div class="priority-badge">${priorityLabel}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Trigger Ticket</div>
      <div class="ticket-box">${prompt}</div>
      <div style="margin-top:12px;">
        <span class="badge badge-model">${model}</span>
        <span class="badge badge-complexity">${complexity}</span>
        <span class="badge badge-risk">${risk} risk</span>
        ${selfCorrected ? '<span class="badge badge-corrected">Self-corrected</span>' : ""}
        ${auditorOverride ? '<span class="badge badge-auditor">Auditor Override</span>' : ""}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Anomaly Detection</div>
      <div class="grid-3">
        <div class="stat-block">
          <div class="stat-value" style="color:#D30E8C;">${anomalyCount}</div>
          <div class="stat-label">Similar Tickets Detected</div>
        </div>
        <div class="stat-block">
          <div class="stat-value" style="color:#f0a500;">${ANOMALY_WINDOW_MINUTES} min</div>
          <div class="stat-label">Detection Window</div>
        </div>
        <div class="stat-block">
          <div class="stat-value" style="color:#ef4444;">${priorityLabel.split(" ")[0]}</div>
          <div class="stat-label">Auto-Assigned Priority</div>
        </div>
      </div>
      <div style="margin-top:16px;padding:14px 16px;background:rgba(211,14,140,0.08);border:1px solid rgba(211,14,140,0.2);border-radius:8px;font-size:13px;color:#e0c8ff;line-height:1.6;">
        FuseBox AI Ops detected ${anomalyCount} tickets of the same complexity pattern within ${ANOMALY_WINDOW_MINUTES} minutes. This pattern indicates a potential widespread incident. The ticket was automatically escalated to ${model} for advanced triage and this incident record was created autonomously without human intervention.
      </div>
    </div>

    <div class="section">
      <div class="section-title">Agent Classification Chain</div>
      <div class="reason-box">${reason}</div>
      <div style="margin-top:16px;">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Confidence Score</div>
        <div style="background:#2a1a45;border-radius:4px;height:10px;overflow:hidden;">
          <div style="height:100%;width:${confidence}%;background:${confidence >= 75 ? "linear-gradient(90deg,#4caf50,#66bb6a)" : "linear-gradient(90deg,#ef4444,#ff6b6b)"};border-radius:4px;"></div>
        </div>
        <div style="font-size:12px;color:${confidence >= 75 ? "#4caf50" : "#ef4444"};margin-top:6px;font-weight:bold;">${confidence}% confidence</div>
      </div>
      ${
        auditorResult
          ? `
      <div style="margin-top:16px;background:rgba(255,140,0,0.08);border:1px solid rgba(255,140,0,0.25);border-radius:8px;padding:14px 16px;">
        <div style="font-size:10px;color:#ff8c00;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:bold;">FuseBox-Auditor Decision</div>
        <div style="font-size:13px;color:#ffcc88;line-height:1.5;">${auditorResult}</div>
      </div>`
          : ""
      }
    </div>

    <div class="section">
      <div class="section-title">Cost Analysis</div>
      <div class="grid-3">
        <div class="stat-block">
          <div class="stat-value">$${cost}</div>
          <div class="stat-label">Actual Cost</div>
        </div>
        <div class="stat-block">
          <div class="stat-value pink">$${savings !== "N/A" ? savings : "0.000000"}</div>
          <div class="stat-label">Saved vs All-Kimi</div>
        </div>
        <div class="stat-block">
          <div class="stat-value" style="color:#4caf50;">${totalTokens}</div>
          <div class="stat-label">Tokens Used</div>
        </div>
      </div>
      <div style="margin-top:16px;text-align:center;padding:20px;background:rgba(211,14,140,0.06);border:1px solid rgba(211,14,140,0.2);border-radius:10px;">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Projected Annual Savings at 50,000 Tickets/Year</div>
        <div class="savings-highlight">$${annualSavings}</div>
        <div style="font-size:11px;color:#888;margin-top:6px;">based on current routing efficiency</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Knowledge Base Match</div>
      ${kbSection}
    </div>

    <div class="section">
      <div class="section-title">Memory Context — Similar Past Tickets</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Ticket</th>
            <th>Complexity</th>
            <th>Model</th>
            <th>Confidence</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          ${memoryRows}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Recommended Actions</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-left:3px solid #ef4444;border-radius:8px;padding:12px 16px;">
          <div style="font-size:12px;font-weight:bold;color:#ef4444;margin-bottom:4px;">IMMEDIATE — Investigate Pattern</div>
          <div style="font-size:13px;color:#ddd;line-height:1.5;">Review all ${anomalyCount} tickets submitted in the last ${ANOMALY_WINDOW_MINUTES} minutes. Determine if this represents a widespread incident or coincidental volume spike.</div>
        </div>
        <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-left:3px solid #f0a500;border-radius:8px;padding:12px 16px;">
          <div style="font-size:12px;font-weight:bold;color:#f0a500;margin-bottom:4px;">SHORT TERM — Escalate if Confirmed</div>
          <div style="font-size:13px;color:#ddd;line-height:1.5;">If the pattern is confirmed as a widespread incident, escalate to the appropriate team and open a P1 incident record in your ITSM system.</div>
        </div>
        <div style="background:rgba(79,147,217,0.08);border:1px solid rgba(79,147,217,0.2);border-left:3px solid #4F93D9;border-radius:8px;padding:12px 16px;">
          <div style="font-size:12px;font-weight:bold;color:#4F93D9;margin-bottom:4px;">LONG TERM — Update Knowledge Base</div>
          <div style="font-size:13px;color:#ddd;line-height:1.5;">FuseBox AI Ops has automatically learned from this pattern. Future tickets matching this signature will be routed with higher confidence and faster escalation.</div>
        </div>
      </div>
    </div>

    <div class="section" style="border-color:rgba(211,14,140,0.4);background:linear-gradient(145deg,#1c1430,#221840);">
      <div class="section-title">Next Action — Close the Loop</div>
      <div style="display:flex;align-items:flex-start;gap:16px;">
        <div style="background:rgba(211,14,140,0.15);border:1px solid rgba(211,14,140,0.4);border-radius:10px;padding:16px 20px;flex:1;">
          <div style="font-size:13px;font-weight:bold;color:#D30E8C;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Resolution Feedback Required</div>
          <div style="font-size:13px;color:#ddd;line-height:1.6;">Return to the FuseBox AI Ops dashboard and use the resolution feedback bar on this ticket card to record the outcome. Your selection will be written back to memory and will influence future routing decisions for similar incidents.</div>
          <div style="margin-top:10px;font-size:11px;color:#a78bca;">Options: Resolved — Escalated — Failed</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Generated autonomously by <span>FuseBox AI Ops</span> — Autonomous AI FinOps for Enterprise IT</p>
      <p style="margin-top:4px;">Team Token Burners — Insight Hackathon 2026</p>
    </div>

  </div>
</body>
</html>`;
}

async function callFuseBoxAgent(
  prompt,
  knownIssueContext,
  memoryContext,
  context,
) {
  const memoryBlock =
    memoryContext.length > 0
      ? `\n\nMEMORY — SIMILAR PAST TICKETS:\n${memoryContext
          .map((m, i) => {
            const outcomeNote = m.resolutionStatus
              ? ` — Resolution outcome: ${m.resolutionStatus}${m.resolutionNotes ? ` (${m.resolutionNotes})` : ""}`
              : " — Resolution outcome: pending";
            return `- Ticket ${i + 1}: "${m.prompt}" was routed to ${m.model} (${m.complexity}, confidence: ${m.confidence || "unknown"})${m.selfCorrected ? " — self-corrected" : ""}${outcomeNote}. If this past ticket influenced your classification, you MUST explicitly reference it by its summary in your reason field.`;
          })
          .join("\n")}`
      : "";

  const kbBlock = knownIssueContext.matched
    ? `\n\nKNOWN ISSUE CONTEXT FROM KNOWLEDGE BASE:\n${knownIssueContext.issues.map((i) => `- ${i.title} (${i.severity} severity): ${i.recommendation}`).join("\n")}`
    : "";

  const scopeRule = `\n\nSCOPE RULE: Do NOT infer user count or scope beyond what is explicitly stated in the ticket. If the ticket does not specify how many users are affected, treat it as a single-user or small-scope issue. Only classify as complex if the ticket explicitly states a large number of users, tenant-wide impact, or critical infrastructure failure.`;

  const memoryCitationRule = `\n\nMEMORY CITATION RULE: If any past ticket from the MEMORY block influenced your classification decision, you MUST name it explicitly in your reason field using this format: "Memory reference: [brief summary of past ticket] influenced this classification because [specific reason]." If a past ticket had a failed resolution outcome, weight your confidence score accordingly.`;

  const enrichedInput = `TICKET: ${prompt}${kbBlock}${memoryBlock}${scopeRule}${memoryCitationRule}\n\nFactor all context into your classification. Include a confidence score 0-100 in your JSON response.`;

  const res = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
      "Foundry-Features": "HostedAgents=V1Preview",
    },
    body: JSON.stringify({ input: enrichedInput, stream: false }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`FuseBox agent call failed: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  const text = data?.output?.[0]?.content?.[0]?.text;
  if (!text) throw new Error("No text content in FuseBox agent response");

  context.log("FuseBox agent classification text:", text);

  const cleaned = text.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in FuseBox agent response");

  const parsed = JSON.parse(jsonMatch[0]);
  const validModels = [CHEAP_MODEL, MID_MODEL, PREMIUM_MODEL];

  return {
    complexity: parsed.complexity || "medium",
    risk: parsed.risk || "medium",
    model: validModels.includes(parsed.model) ? parsed.model : MID_MODEL,
    reason: parsed.reason || "FuseBox agent classification",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 75,
  };
}

async function callFuseBoxAgentWithSelfCorrection(
  prompt,
  knownIssueContext,
  memoryContext,
  context,
) {
  const firstResult = await callFuseBoxAgent(
    prompt,
    knownIssueContext,
    memoryContext,
    context,
  );

  const reasonLower = firstResult.reason.toLowerCase();
  const isUncertain =
    UNCERTAINTY_WORDS.some((word) => reasonLower.includes(word)) ||
    firstResult.confidence < CONFIDENCE_THRESHOLD;

  if (!isUncertain) {
    return { ...firstResult, selfCorrected: false };
  }

  context.log(
    "Uncertainty detected — confidence:",
    firstResult.confidence,
    "reason:",
    firstResult.reason,
  );

  const correctionPrompt = `TICKET: ${prompt}\n\nYour previous classification was ${firstResult.complexity} with confidence ${firstResult.confidence}/100 and reason: "${firstResult.reason}"\n\nYou expressed uncertainty. Please reconsider carefully. Focus on:\n- How many users are affected? Only classify complex if explicitly stated as large-scale.\n- Is this tenant-wide or isolated?\n- Does this involve infrastructure, identity, or security?\n- What is the business impact if unresolved?\n\nProvide a definitive classification with high confidence. Include confidence score in your JSON.`;

  try {
    const correctionPromise = fetch(AGENT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
        "Foundry-Features": "HostedAgents=V1Preview",
      },
      body: JSON.stringify({ input: correctionPrompt, stream: false }),
    });

    const correctionTimeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Correction timeout")),
        CORRECTION_TIMEOUT,
      ),
    );

    const correctionRes = await Promise.race([
      correctionPromise,
      correctionTimeoutPromise,
    ]);
    if (!correctionRes.ok) return { ...firstResult, selfCorrected: true };

    const correctionData = await correctionRes.json();
    const correctionText = correctionData?.output?.[0]?.content?.[0]?.text;
    if (!correctionText) return { ...firstResult, selfCorrected: true };

    const correctionCleaned = correctionText.replace(/```json|```/g, "").trim();
    const correctionMatch = correctionCleaned.match(/\{[\s\S]*\}/);
    if (!correctionMatch) return { ...firstResult, selfCorrected: true };

    const correctionParsed = JSON.parse(correctionMatch[0]);
    const validModels = [CHEAP_MODEL, MID_MODEL, PREMIUM_MODEL];

    context.log("Self-correction result:", correctionParsed);

    return {
      complexity: correctionParsed.complexity || firstResult.complexity,
      risk: correctionParsed.risk || firstResult.risk,
      model: validModels.includes(correctionParsed.model)
        ? correctionParsed.model
        : firstResult.model,
      reason: `[Self-corrected] ${correctionParsed.reason || firstResult.reason}`,
      confidence:
        typeof correctionParsed.confidence === "number"
          ? correctionParsed.confidence
          : firstResult.confidence,
      selfCorrected: true,
    };
  } catch (e) {
    context.log("Self-correction timed out or failed:", e.message);
    return { ...firstResult, selfCorrected: true };
  }
}

async function callAuditor(prompt, classification, context) {
  try {
    const auditorInput = `TICKET: ${prompt}\n\nPRIMARY AGENT CLASSIFICATION:\n- Complexity: ${classification.complexity}\n- Model: ${classification.model}\n- Confidence: ${classification.confidence}/100\n- Reason: ${classification.reason}\n\nYou are FuseBox-Auditor. Independently evaluate whether this classification is correct. Be skeptical. Consider whether the complexity and model assignment match the actual ticket scope and impact.\n\nRespond with ONLY one of these two formats:\n1. {"verdict": "confirmed", "reason": "brief reason you agree"}\n2. {"verdict": "override", "new_complexity": "simple|medium|complex", "new_model": "phi-4-mini|DeepSeek-V4-Flash|Kimi-K2.6", "reason": "brief reason you disagree and what the correct classification is"}`;

    const res = await fetch(AUDITOR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
        "Foundry-Features": "HostedAgents=V1Preview",
      },
      body: JSON.stringify({ input: auditorInput, stream: false }),
    });

    if (!res.ok) {
      context.log("Auditor call failed with status:", res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.output?.[0]?.content?.[0]?.text;
    if (!text) return null;

    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    context.log("Auditor result:", parsed);
    return parsed;
  } catch (e) {
    context.log("Auditor call exception:", e.message);
    return null;
  }
}

async function callTriageModel(model, prompt, context) {
  if (model === PREMIUM_MODEL) {
    const res = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful IT service desk assistant. Provide a brief triage summary and 3 recommended next steps. Be concise.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        stream: false,
      }),
    });
    const data = await res.json();
    return data;
  }

  const client = new OpenAI({ baseURL: ENDPOINT, apiKey: API_KEY });
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful IT service desk assistant. Provide a brief triage summary and 3 recommended next steps. Be concise.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 500,
  });
  return response;
}

app.http("feedback", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { error: "Invalid JSON body" },
      };
    }

    const { ticketId, resolutionStatus, resolutionNotes, reportUrl } = body;

    if (!ticketId || !resolutionStatus) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { error: "ticketId and resolutionStatus are required" },
      };
    }

    const validStatuses = ["resolved", "escalated", "failed"];
    if (!validStatuses.includes(resolutionStatus)) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: {
          error: "resolutionStatus must be resolved, escalated, or failed",
        },
      };
    }

    try {
      const container = getCosmosContainer();
      const query = {
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: ticketId }],
      };
      const { resources } = await container.items.query(query).fetchAll();

      if (resources.length > 0) {
        const ticket = resources[0];
        ticket.resolutionStatus = resolutionStatus;
        ticket.resolutionNotes = resolutionNotes || null;
        ticket.resolvedAt = new Date().toISOString();
        await container.items.upsert(ticket);
        context.log(
          "Resolution feedback written to Cosmos DB:",
          ticketId,
          resolutionStatus,
        );
      }

      if (reportUrl) {
        await updateReportWithResolution(
          reportUrl,
          resolutionStatus,
          resolutionNotes,
          context,
        );
      }

      return {
        status: 200,
        headers: CORS_HEADERS,
        jsonBody: { success: true, ticketId, resolutionStatus },
      };
    } catch (e) {
      context.log("Feedback endpoint error:", e.message);
      return {
        status: 500,
        headers: CORS_HEADERS,
        jsonBody: { error: e.message },
      };
    }
  },
});

app.http("alert", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { error: "Invalid JSON body" },
      };
    }
    const { type, totalSpend, triggerPrompt, model, cost } = body;
    const isExceeded = type === "exceeded";
    const subject = isExceeded
      ? "URGENT: FuseBox AI Ops — Budget Limit Exceeded"
      : "WARNING: FuseBox AI Ops — Budget Threshold Reached";
    const bodyText = isExceeded
      ? `FuseBox AI Ops spend has exceeded the budget limit of $0.0140.\n\nCurrent spend: $${parseFloat(totalSpend).toFixed(6)}\nTriggered by: ${triggerPrompt}\nModel used: ${model}\nCost of this request: $${parseFloat(cost).toFixed(6)}\n\nReview AI spend immediately in the FuseBox AI Ops dashboard.`
      : `FuseBox AI Ops spend has reached the alert threshold of $0.0008.\n\nCurrent spend: $${parseFloat(totalSpend).toFixed(6)}\nTriggered by: ${triggerPrompt}\nModel used: ${model}\nCost of this request: $${parseFloat(cost).toFixed(6)}\n\nMonitor spend closely.`;
    await sendAlertEmail(subject, bodyText);
    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: { sent: true, type },
    };
  },
});

app.http("route", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }

    context.log("FuseBox AI Ops router received request");

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { error: "Invalid JSON body" },
      };
    }

    const { prompt } = body;
    if (!prompt) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { error: "prompt is required" },
      };
    }

    const knownIssueContext = await checkKnownIssues(prompt);
    context.log("Known issue check result:", knownIssueContext);

    let predictedComplexity = "medium";
    if (knownIssueContext.matched) {
      const highSeverity = knownIssueContext.issues.some(
        (i) => i.severity === "high",
      );
      predictedComplexity = highSeverity ? "complex" : "medium";
    }

    const memoryContext = await getMemoryContext(predictedComplexity);
    context.log("Memory context:", memoryContext.length, "past tickets");

    let classification;
    try {
      const agentPromise = callFuseBoxAgentWithSelfCorrection(
        prompt,
        knownIssueContext,
        memoryContext,
        context,
      );
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Agent timeout")), AGENT_TIMEOUT),
      );
      classification = await Promise.race([agentPromise, timeoutPromise]);
      context.log("FuseBox agent classification:", classification);
    } catch (e) {
      context.log("FuseBox agent scoring failed, falling back:", e.message);
      if (knownIssueContext.matched) {
        const highSeverity = knownIssueContext.issues.some(
          (i) => i.severity === "high",
        );
        const medSeverity = knownIssueContext.issues.some(
          (i) => i.severity === "medium",
        );
        if (highSeverity) {
          classification = {
            complexity: "complex",
            risk: "high",
            model: PREMIUM_MODEL,
            reason: `KB match: ${knownIssueContext.issues.map((i) => i.title).join(", ")}`,
            selfCorrected: true,
            confidence: 80,
          };
        } else if (medSeverity) {
          classification = {
            complexity: "medium",
            risk: "medium",
            model: MID_MODEL,
            reason: `KB match: ${knownIssueContext.issues.map((i) => i.title).join(", ")}`,
            selfCorrected: true,
            confidence: 80,
          };
        } else {
          const promptLower = prompt.toLowerCase();
          const isSimple =
            promptLower.includes("password") ||
            promptLower.includes("locked out") ||
            promptLower.includes("forgot") ||
            promptLower.includes("reset password") ||
            promptLower.includes("single user");
          const isComplex =
            promptLower.includes("users") ||
            promptLower.includes("sites") ||
            promptLower.includes("tenant") ||
            promptLower.includes("entire") ||
            promptLower.includes("all users") ||
            promptLower.includes("host pool") ||
            promptLower.includes("infrastructure");
          const fallbackComplexity = isSimple
            ? "simple"
            : isComplex
              ? "complex"
              : "medium";
          const fallbackModel = isSimple
            ? CHEAP_MODEL
            : isComplex
              ? PREMIUM_MODEL
              : MID_MODEL;
          const fallbackRisk = isSimple ? "low" : isComplex ? "high" : "medium";
          classification = {
            complexity: fallbackComplexity,
            risk: fallbackRisk,
            model: fallbackModel,
            reason: "Fallback - agent timeout",
            selfCorrected: true,
            confidence: 50,
          };
        }
      } else {
        classification = {
          complexity: "medium",
          risk: "medium",
          model: MID_MODEL,
          reason: "Fallback - agent timeout",
          selfCorrected: true,
          confidence: 50,
        };
      }
    }

    let { complexity, risk, model, reason, selfCorrected, confidence } =
      classification;

    // Capture original complexity BEFORE confidence escalation or auditor override
    // This is what gets passed to checkAnomaly to prevent false anomaly triggers
    const originalComplexity = complexity;

    let confidenceEscalated = false;
    if (confidence < CONFIDENCE_THRESHOLD) {
      if (model === CHEAP_MODEL) {
        model = MID_MODEL;
        confidenceEscalated = true;
        reason = `[Confidence ${confidence}% — escalated from phi-4-mini] ${reason}`;
      } else if (model === MID_MODEL) {
        model = PREMIUM_MODEL;
        confidenceEscalated = true;
        reason = `[Confidence ${confidence}% — escalated from DeepSeek] ${reason}`;
      }
      context.log("Low confidence escalation — new model:", model);
    }

    let auditorResult = null;
    let auditorOverride = false;
    if (confidence < 90) {
      const auditorResponse = await callAuditor(
        prompt,
        { complexity, model, confidence, reason },
        context,
      );
      if (auditorResponse) {
        auditorResult =
          auditorResponse.verdict === "override"
            ? `${auditorResponse.new_complexity} via ${auditorResponse.new_model} — ${auditorResponse.reason}`
            : auditorResponse.reason || "Classification confirmed";
        auditorOverride = auditorResponse.verdict === "override";
        if (auditorOverride) {
          const validModels = [CHEAP_MODEL, MID_MODEL, PREMIUM_MODEL];
          const validComplexities = ["simple", "medium", "complex"];
          if (validComplexities.includes(auditorResponse.new_complexity))
            complexity = auditorResponse.new_complexity;
          if (validModels.includes(auditorResponse.new_model))
            model = auditorResponse.new_model;
          reason = `[Auditor override] ${auditorResponse.reason}`;
          context.log("Auditor overrode classification to:", model, complexity);
        }
      }
    }

    let costPer1k;
    if (model === CHEAP_MODEL) costPer1k = CHEAP_COST_PER_1K;
    else if (model === MID_MODEL) costPer1k = MID_COST_PER_1K;
    else costPer1k = PREMIUM_COST_PER_1K;

    let response;
    try {
      response = await callTriageModel(model, prompt, context);
    } catch (e) {
      context.log("Model triage call failed:", e.message);
      return {
        status: 500,
        headers: CORS_HEADERS,
        jsonBody: { error: "Model triage call failed", details: e.message },
      };
    }

    const totalTokens = response.usage.total_tokens;
    const cost = (totalTokens / 1000) * costPer1k;
    const premiumCost = (totalTokens / 1000) * PREMIUM_COST_PER_1K;
    const savings = model !== PREMIUM_MODEL ? premiumCost - cost : 0;
    const triageText =
      response?.choices?.[0]?.message?.content ||
      response?.choices?.[0]?.message?.reasoning_content ||
      "Triage response unavailable";

    const ticketId = `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await writeMemory({
      id: ticketId,
      prompt,
      complexity,
      model,
      risk,
      reason,
      selfCorrected,
      confidence,
    });
    context.log("Memory written for ticket:", ticketId);

    // Use originalComplexity for anomaly check — not the escalated or auditor-overridden value
    const anomalyResult = await checkAnomaly(originalComplexity);
    context.log(
      "Anomaly check (original complexity:",
      originalComplexity,
      "):",
      anomalyResult,
    );

    let anomalyEscalated = false;
    let reportUrl = null;

    if (anomalyResult.anomalyDetected) {
      context.log("Anomaly detected — escalating to Kimi-K2.6");
      model = PREMIUM_MODEL;
      complexity = "complex";
      risk = "high";
      reason = `[Anomaly detected — ${anomalyResult.count} similar tickets in last ${ANOMALY_WINDOW_MINUTES} min] ${reason}`;
      anomalyEscalated = true;

      const incidentId = `INC-${Date.now().toString().slice(-6)}`;
      const timestamp = new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const htmlReport = generateIncidentReportHTML(
        incidentId,
        prompt,
        complexity,
        model,
        risk,
        reason,
        confidence,
        anomalyResult.count,
        totalTokens,
        cost.toFixed(6),
        savings > 0 ? savings.toFixed(6) : "N/A",
        memoryContext,
        knownIssueContext,
        selfCorrected,
        auditorResult,
        auditorOverride,
        timestamp,
      );

      reportUrl = await uploadReportToBlob(incidentId, htmlReport, context);

      sendAlertEmail(
        "INCIDENT ALERT: FuseBox AI Ops — Anomaly Detected",
        `FuseBox AI Ops has detected a potential widespread incident.\n\n${anomalyResult.count} similar tickets submitted in the last ${ANOMALY_WINDOW_MINUTES} minutes.\n\nLatest ticket: ${prompt}\n\nAutomatically escalated to Kimi-K2.6 for advanced triage.\n\n${reportUrl ? `Full incident report: ${reportUrl}` : ""}\n\nReview the FuseBox AI Ops dashboard immediately.`,
      ).catch((e) => console.error("Anomaly alert email failed:", e.message));
    }

    if (knownIssueContext.matched) {
      const kbRecommendedModel =
        knownIssueContext.issues[0].severity === "high"
          ? PREMIUM_MODEL
          : MID_MODEL;
      if (model !== kbRecommendedModel) {
        updateKnowledgeBase(
          prompt,
          model,
          knownIssueContext.issues,
          context,
        ).catch((e) => context.log("KB auto-update failed:", e.message));
      }
    }

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: {
        ticketId,
        prompt,
        model,
        complexity,
        risk,
        reason,
        response: triageText,
        tokens: totalTokens,
        cost: cost.toFixed(6),
        savings: savings > 0 ? savings.toFixed(6) : "N/A",
        scorer: "FuseBox Foundry Agent - Responses API",
        knowledgeBase: knownIssueContext.matched
          ? `Matched ${knownIssueContext.issues.length} known issue(s): ${knownIssueContext.issues.map((i) => i.title).join(", ")}`
          : "No known issues matched",
        memoryUsed:
          memoryContext.length > 0
            ? `${memoryContext.length} past tickets referenced`
            : "No memory context yet",
        selfCorrected: selfCorrected || false,
        confidence: confidence || 0,
        anomalyDetected: anomalyResult.anomalyDetected,
        anomalyCount: anomalyResult.count,
        confidenceEscalated: confidenceEscalated,
        auditorResult: auditorResult,
        auditorOverride: auditorOverride,
        reportUrl: reportUrl,
      },
    };
  },
});
