const OpenAI = require("openai").default;
const { app } = require("@azure/functions");
const { EmailClient } = require("@azure/communication-email");
const { CosmosClient } = require("@azure/cosmos");

const ENDPOINT = "https://fusebox-resource.services.ai.azure.com/openai/v1";
const AGENT_ENDPOINT = "https://FuseBox-resource.services.ai.azure.com/api/projects/FuseBox/agents/FuseBox/endpoint/protocols/openai/responses?api-version=v1";
const AUDITOR_ENDPOINT = "https://FuseBox-resource.services.ai.azure.com/api/projects/FuseBox/agents/FuseBox-Auditor/endpoint/protocols/openai/responses?api-version=v1";
const API_KEY = process.env.AZURE_API_KEY;
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
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
const ANOMALY_THRESHOLD = 3;
const ANOMALY_WINDOW_MINUTES = 30;

const UNCERTAINTY_WORDS = [
  "unclear", "ambiguous", "could be", "uncertain", "not sure",
  "borderline", "possibly", "might be", "hard to say", "difficult to determine",
  "on the fence", "leaning towards", "may be", "not entirely", "somewhat",
  "appears to be", "seems like", "could go either way", "limited information",
  "insufficient", "vague", "generic", "broad", "unspecific", "no clear"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

let cosmosContainer;
function getCosmosContainer() {
  if (!cosmosContainer) {
    const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
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
            <h2 style="color:#D30E8C;margin-top:0;">⚡ Project FuseBox — AI Spend Alert</h2>
            <p style="color:#ccc;">${bodyText.replace(/\n/g, "<br/>")}</p>
            <hr style="border-color:#582873;"/>
            <p style="color:#666;font-size:12px;">Team Token Burners — Insight Hackathon 2026</p>
          </div>
        </body></html>`
      }
    };
    const poller = await client.beginSend(message);
    poller.pollUntilDone().catch(e => console.error("Email poll failed:", e.message));
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
            recommendation: issue.recommendation
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
      query: "SELECT TOP 3 c.prompt, c.complexity, c.model, c.reason, c.selfCorrected, c.confidence FROM c WHERE c.complexity = @complexity ORDER BY c._ts DESC",
      parameters: [{ name: "@complexity", value: complexity }]
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
    const windowStart = new Date(Date.now() - ANOMALY_WINDOW_MINUTES * 60 * 1000).toISOString();
    const query = {
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.complexity = @complexity AND c.timestamp >= @windowStart",
      parameters: [
        { name: "@complexity", value: complexity },
        { name: "@windowStart", value: windowStart }
      ]
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
      id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      prompt: entry.prompt,
      complexity: entry.complexity,
      model: entry.model,
      risk: entry.risk,
      reason: entry.reason,
      selfCorrected: entry.selfCorrected || false,
      confidence: entry.confidence || 0,
      timestamp: new Date().toISOString()
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
    const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const newPattern = words.slice(0, 3).join(" ");
    const alreadyExists = data.knownIssues.some(issue =>
      issue.pattern.some(p => p.includes(newPattern))
    );
    if (alreadyExists) return;
    const severity = agentModel === PREMIUM_MODEL ? "high" : agentModel === MID_MODEL ? "medium" : "low";
    const newIssue = {
      id: `KI-AUTO-${Date.now()}`,
      pattern: [newPattern],
      title: `Auto-learned: ${prompt.slice(0, 50)}`,
      severity,
      recommendation: `Route to ${agentModel} — learned from agent override`
    };
    data.knownIssues.push(newIssue);
    await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ms-blob-type": "BlockBlob"
      },
      body: JSON.stringify(data)
    });
    context.log("KB auto-updated with new pattern:", newPattern);
  } catch (e) {
    context.log("KB auto-update failed:", e.message);
  }
}

async function callFuseBoxAgent(prompt, knownIssueContext, memoryContext, context) {
  const memoryBlock = memoryContext.length > 0
    ? `\n\nMEMORY — SIMILAR PAST TICKETS:\n${memoryContext.map((m, i) => `- Ticket ${i + 1}: "${m.prompt}" was routed to ${m.model} (${m.complexity}, confidence: ${m.confidence || "unknown"})${m.selfCorrected ? " — self-corrected" : ""}. If this past ticket influenced your classification, you MUST explicitly reference it by its summary in your reason field.`).join("\n")}`
    : "";

  const kbBlock = knownIssueContext.matched
    ? `\n\nKNOWN ISSUE CONTEXT FROM KNOWLEDGE BASE:\n${knownIssueContext.issues.map(i => `- ${i.title} (${i.severity} severity): ${i.recommendation}`).join("\n")}`
    : "";

  const scopeRule = `\n\nSCOPE RULE: Do NOT infer user count or scope beyond what is explicitly stated in the ticket. If the ticket does not specify how many users are affected, treat it as a single-user or small-scope issue. Only classify as complex if the ticket explicitly states a large number of users, tenant-wide impact, or critical infrastructure failure.`;

  const memoryCitationRule = `\n\nMEMORY CITATION RULE: If any past ticket from the MEMORY block influenced your classification decision, you MUST name it explicitly in your reason field using this format: "Memory reference: [brief summary of past ticket] influenced this classification because [specific reason]."`;

  const enrichedInput = `TICKET: ${prompt}${kbBlock}${memoryBlock}${scopeRule}${memoryCitationRule}\n\nFactor all context into your classification. Include a confidence score 0-100 in your JSON response.`;

  const res = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
      "Foundry-Features": "HostedAgents=V1Preview"
    },
    body: JSON.stringify({ input: enrichedInput, stream: false })
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
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 75
  };
}

async function callFuseBoxAgentWithSelfCorrection(prompt, knownIssueContext, memoryContext, context) {
  const firstResult = await callFuseBoxAgent(prompt, knownIssueContext, memoryContext, context);

  const reasonLower = firstResult.reason.toLowerCase();
  const isUncertain = UNCERTAINTY_WORDS.some(word => reasonLower.includes(word)) || firstResult.confidence < CONFIDENCE_THRESHOLD;

  if (!isUncertain) {
    return { ...firstResult, selfCorrected: false };
  }

  context.log("Uncertainty detected — confidence:", firstResult.confidence, "reason:", firstResult.reason);

  const correctionPrompt = `TICKET: ${prompt}\n\nYour previous classification was ${firstResult.complexity} with confidence ${firstResult.confidence}/100 and reason: "${firstResult.reason}"\n\nYou expressed uncertainty. Please reconsider carefully. Focus on:\n- How many users are affected? Only classify complex if explicitly stated as large-scale.\n- Is this tenant-wide or isolated?\n- Does this involve infrastructure, identity, or security?\n- What is the business impact if unresolved?\n\nProvide a definitive classification with high confidence. Include confidence score in your JSON.`;

  const correctionRes = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
      "Foundry-Features": "HostedAgents=V1Preview"
    },
    body: JSON.stringify({ input: correctionPrompt, stream: false })
  });

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
    model: validModels.includes(correctionParsed.model) ? correctionParsed.model : firstResult.model,
    reason: `[Self-corrected] ${correctionParsed.reason || firstResult.reason}`,
    confidence: typeof correctionParsed.confidence === "number" ? correctionParsed.confidence : firstResult.confidence,
    selfCorrected: true
  };
}

async function callAuditor(prompt, classification, context) {
  try {
    const auditorInput = `TICKET: ${prompt}\n\nPRIMARY AGENT CLASSIFICATION:\n- Complexity: ${classification.complexity}\n- Model: ${classification.model}\n- Confidence: ${classification.confidence}/100\n- Reason: ${classification.reason}\n\nYou are FuseBox-Auditor. Independently evaluate whether this classification is correct. Be skeptical. Consider whether the complexity and model assignment match the actual ticket scope and impact.\n\nRespond with ONLY one of these two formats:\n1. {"verdict": "confirmed", "reason": "brief reason you agree"}\n2. {"verdict": "override", "new_complexity": "simple|medium|complex", "new_model": "phi-4-mini|DeepSeek-V4-Flash|Kimi-K2.6", "reason": "brief reason you disagree and what the correct classification is"}`;

    const res = await fetch(AUDITOR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": API_KEY,
        "Foundry-Features": "HostedAgents=V1Preview"
      },
      body: JSON.stringify({ input: auditorInput, stream: false })
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
        "api-key": API_KEY
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a helpful IT service desk assistant. Provide a brief triage summary and 3 recommended next steps. Be concise."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 2000,
        stream: false
      })
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
        content: "You are a helpful IT service desk assistant. Provide a brief triage summary and 3 recommended next steps. Be concise."
      },
      { role: "user", content: prompt }
    ],
    max_tokens: 500,
  });
  return response;
}

// Alert endpoint
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
      return { status: 400, headers: CORS_HEADERS, jsonBody: { error: "Invalid JSON body" } };
    }
    const { type, totalSpend, triggerPrompt, model, cost } = body;
    const isExceeded = type === "exceeded";
    const subject = isExceeded
      ? "URGENT: FuseBox Budget Limit Exceeded"
      : "WARNING: FuseBox Budget Threshold Reached";
    const bodyText = isExceeded
      ? `Project FuseBox AI spend has exceeded the budget limit of $0.0010.\n\nCurrent spend: $${parseFloat(totalSpend).toFixed(6)}\nTriggered by: ${triggerPrompt}\nModel used: ${model}\nCost of this request: $${parseFloat(cost).toFixed(6)}\n\nReview AI spend immediately in the FuseBox dashboard.`
      : `Project FuseBox AI spend has reached the alert threshold of $0.0003.\n\nCurrent spend: $${parseFloat(totalSpend).toFixed(6)}\nTriggered by: ${triggerPrompt}\nModel used: ${model}\nCost of this request: $${parseFloat(cost).toFixed(6)}\n\nMonitor spend closely.`;
    await sendAlertEmail(subject, bodyText);
    return { status: 200, headers: CORS_HEADERS, jsonBody: { sent: true, type } };
  }
});

// Main routing endpoint
app.http("route", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {

    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }

    context.log("FuseBox router received request");

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return { status: 400, headers: CORS_HEADERS, jsonBody: { error: "Invalid JSON body" } };
    }

    const { prompt } = body;
    if (!prompt) {
      return { status: 400, headers: CORS_HEADERS, jsonBody: { error: "prompt is required" } };
    }

    // Step 1 — KB check
    const knownIssueContext = await checkKnownIssues(prompt);
    context.log("Known issue check result:", knownIssueContext);

    // Step 2 — Predict complexity from KB for memory query
    let predictedComplexity = "medium";
    if (knownIssueContext.matched) {
      const highSeverity = knownIssueContext.issues.some(i => i.severity === "high");
      predictedComplexity = highSeverity ? "complex" : "medium";
    }

    // Step 3 — Query memory
    const memoryContext = await getMemoryContext(predictedComplexity);
    context.log("Memory context:", memoryContext.length, "past tickets");

    // Step 4 — Agent classification with self-correction and 20 second timeout
    let classification;
    try {
      const agentPromise = callFuseBoxAgentWithSelfCorrection(prompt, knownIssueContext, memoryContext, context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Agent timeout")), 20000)
      );
      classification = await Promise.race([agentPromise, timeoutPromise]);
      context.log("FuseBox agent classification:", classification);
    } catch (e) {
      context.log("FuseBox agent scoring failed, falling back:", e.message);
      if (knownIssueContext.matched) {
        const highSeverity = knownIssueContext.issues.some(i => i.severity === "high");
        const medSeverity = knownIssueContext.issues.some(i => i.severity === "medium");
        if (highSeverity) {
          classification = { complexity: "complex", risk: "high", model: PREMIUM_MODEL, reason: `KB match: ${knownIssueContext.issues.map(i => i.title).join(", ")}`, selfCorrected: true, confidence: 80 };
        } else if (medSeverity) {
          classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: `KB match: ${knownIssueContext.issues.map(i => i.title).join(", ")}`, selfCorrected: true, confidence: 80 };
        } else {
          classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: "Fallback - agent timeout", selfCorrected: true, confidence: 50 };
        }
      } else {
        classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: "Fallback - agent timeout", selfCorrected: true, confidence: 50 };
      }
    }

    let { complexity, risk, model, reason, selfCorrected, confidence } = classification;

    // Step 5 — Confidence escalation
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

    // Step 6 — Auditor check (runs when confidence below 80)
    let auditorResult = null;
    let auditorOverride = false;
    if (confidence < 80) {
      const auditorResponse = await callAuditor(prompt, { complexity, model, confidence, reason }, context);
      if (auditorResponse) {
        auditorResult = auditorResponse.verdict === "override"
          ? `${auditorResponse.new_complexity} via ${auditorResponse.new_model} — ${auditorResponse.reason}`
          : auditorResponse.reason || "Classification confirmed";
        auditorOverride = auditorResponse.verdict === "override";
        if (auditorOverride) {
          const validModels = [CHEAP_MODEL, MID_MODEL, PREMIUM_MODEL];
          const validComplexities = ["simple", "medium", "complex"];
          if (validComplexities.includes(auditorResponse.new_complexity)) complexity = auditorResponse.new_complexity;
          if (validModels.includes(auditorResponse.new_model)) model = auditorResponse.new_model;
          reason = `[Auditor override] ${auditorResponse.reason}`;
          context.log("Auditor overrode classification to:", model, complexity);
        }
      }
    }

    let costPer1k;
    if (model === CHEAP_MODEL) costPer1k = CHEAP_COST_PER_1K;
    else if (model === MID_MODEL) costPer1k = MID_COST_PER_1K;
    else costPer1k = PREMIUM_COST_PER_1K;

    // Step 7 — Triage response
    let response;
    try {
      response = await callTriageModel(model, prompt, context);
    } catch (e) {
      context.log("Model triage call failed:", e.message);
      return { status: 500, headers: CORS_HEADERS, jsonBody: { error: "Model triage call failed", details: e.message } };
    }

    const totalTokens = response.usage.total_tokens;
    const cost = (totalTokens / 1000) * costPer1k;
    const premiumCost = (totalTokens / 1000) * PREMIUM_COST_PER_1K;
    const savings = model !== PREMIUM_MODEL ? premiumCost - cost : 0;

    const triageText = response?.choices?.[0]?.message?.content || response?.choices?.[0]?.message?.reasoning_content || "Triage response unavailable";

    // Step 8 — Write to Cosmos DB FIRST so anomaly check sees this ticket
    await writeMemory({ prompt, complexity, model, risk, reason, selfCorrected, confidence });
    context.log("Memory written for ticket");

    // Step 9 — Anomaly check AFTER write so count includes current ticket
    const anomalyResult = await checkAnomaly(complexity);
    context.log("Anomaly check:", anomalyResult);

    let anomalyEscalated = false;
    if (anomalyResult.anomalyDetected && model !== PREMIUM_MODEL) {
      context.log("Anomaly detected — escalating to Kimi-K2.6");
      model = PREMIUM_MODEL;
      complexity = "complex";
      risk = "high";
      reason = `[Anomaly detected — ${anomalyResult.count} similar tickets in last ${ANOMALY_WINDOW_MINUTES} min] ${reason}`;
      anomalyEscalated = true;
      sendAlertEmail(
        "INCIDENT ALERT: FuseBox Anomaly Detected",
        `FuseBox has detected a potential widespread incident.\n\n${anomalyResult.count} similar tickets submitted in the last ${ANOMALY_WINDOW_MINUTES} minutes.\n\nLatest ticket: ${prompt}\n\nAutomatically escalated to Kimi-K2.6 for advanced triage.\n\nReview the FuseBox dashboard immediately.`
      ).catch(e => console.error("Anomaly alert email failed:", e.message));
    }

    // Step 10 — KB auto-update if agent overrode KB recommendation
    if (knownIssueContext.matched) {
      const kbRecommendedModel = knownIssueContext.issues[0].severity === "high" ? PREMIUM_MODEL : MID_MODEL;
      if (model !== kbRecommendedModel) {
        updateKnowledgeBase(prompt, model, knownIssueContext.issues, context).catch(e =>
          context.log("KB auto-update failed:", e.message)
        );
      }
    }

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: {
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
          ? `Matched ${knownIssueContext.issues.length} known issue(s): ${knownIssueContext.issues.map(i => i.title).join(", ")}`
          : "No known issues matched",
        memoryUsed: memoryContext.length > 0 ? `${memoryContext.length} past tickets referenced` : "No memory context yet",
        selfCorrected: selfCorrected || false,
        confidence: confidence || 0,
        anomalyDetected: anomalyResult.anomalyDetected,
        anomalyCount: anomalyResult.count,
        confidenceEscalated: confidenceEscalated,
        auditorResult: auditorResult,
        auditorOverride: auditorOverride
      }
    };
  }
});
