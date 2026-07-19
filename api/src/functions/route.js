const OpenAI = require("openai").default;
const { app } = require("@azure/functions");
const { EmailClient } = require("@azure/communication-email");
const { CosmosClient } = require("@azure/cosmos");

const ENDPOINT = "https://fusebox-resource.services.ai.azure.com/openai/v1";
const AGENT_ENDPOINT = "https://FuseBox-resource.services.ai.azure.com/api/projects/FuseBox/agents/FuseBox/endpoint/protocols/openai/responses?api-version=v1";
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

const UNCERTAINTY_WORDS = [
  "unclear", "ambiguous", "could be", "uncertain", "not sure",
  "borderline", "possibly", "might be", "hard to say", "difficult to determine",
  "on the fence", "leaning towards", "may be"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

// Cosmos DB client — initialized once at module level
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
      query: "SELECT TOP 3 c.prompt, c.complexity, c.model, c.reason, c.selfCorrected FROM c WHERE c.complexity = @complexity ORDER BY c._ts DESC",
      parameters: [{ name: "@complexity", value: complexity }]
    };
    const { resources } = await container.items.query(query).fetchAll();
    return resources;
  } catch (e) {
    console.error("Cosmos memory read failed:", e.message);
    return [];
  }
}

async function writeMemory(entry) {
  try {
    const container = getCosmosContainer();
    await container.items.upsert({
      id: `ticket-${Date.now()}`,
      prompt: entry.prompt,
      complexity: entry.complexity,
      model: entry.model,
      risk: entry.risk,
      reason: entry.reason,
      selfCorrected: entry.selfCorrected || false,
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

    // Extract key words from prompt as new pattern
    const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const newPattern = words.slice(0, 3).join(" ");

    // Only add if pattern is not already in KB
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

    // Upload updated KB back to blob
    const uploadUrl = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${STORAGE_CONTAINER_NAME}/knownIssues.json?${BLOB_SAS_TOKEN}`;
    await fetch(uploadUrl, {
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
    ? `\n\nMEMORY — SIMILAR PAST TICKETS:\n${memoryContext.map(m => `- "${m.prompt}" was routed to ${m.model} (${m.complexity})${m.selfCorrected ? " — self-corrected" : ""}`).join("\n")}`
    : "";

  const kbBlock = knownIssueContext.matched
    ? `\n\nKNOWN ISSUE CONTEXT FROM KNOWLEDGE BASE:\n${knownIssueContext.issues.map(i => `- ${i.title} (${i.severity} severity): ${i.recommendation}`).join("\n")}`
    : "";

  const enrichedInput = `TICKET: ${prompt}${kbBlock}${memoryBlock}\n\nFactor all context into your classification.`;

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
  context.log("FuseBox agent raw response status:", data.status);

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
    reason: parsed.reason || "FuseBox agent classification"
  };
}

async function callFuseBoxAgentWithSelfCorrection(prompt, knownIssueContext, memoryContext, context) {
  // First pass
  const firstResult = await callFuseBoxAgent(prompt, knownIssueContext, memoryContext, context);

  // Check for uncertainty in the reason
  const reasonLower = firstResult.reason.toLowerCase();
  const isUncertain = UNCERTAINTY_WORDS.some(word => reasonLower.includes(word));

  if (!isUncertain) {
    return { ...firstResult, selfCorrected: false };
  }

  context.log("Uncertainty detected in agent reason — triggering self-correction:", firstResult.reason);

  // Self-correction prompt — more targeted
  const correctionPrompt = `TICKET: ${prompt}\n\nYour previous classification was ${firstResult.complexity} with reason: "${firstResult.reason}"\n\nYou expressed uncertainty. Please reconsider carefully. Focus on these specific factors:\n- How many users are affected?\n- Is this tenant-wide or isolated?\n- Does this involve infrastructure, identity, or security?\n- What is the business impact if unresolved?\n\nProvide a definitive classification with high confidence.`;

  const correctionRes = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
      "Foundry-Features": "HostedAgents=V1Preview"
    },
    body: JSON.stringify({ input: correctionPrompt, stream: false })
  });

  if (!correctionRes.ok) {
    context.log("Self-correction call failed — using original result");
    return { ...firstResult, selfCorrected: false };
  }

  const correctionData = await correctionRes.json();
  const correctionText = correctionData?.output?.[0]?.content?.[0]?.text;

  if (!correctionText) {
    return { ...firstResult, selfCorrected: false };
  }

  const correctionCleaned = correctionText.replace(/```json|```/g, "").trim();
  const correctionMatch = correctionCleaned.match(/\{[\s\S]*\}/);

  if (!correctionMatch) {
    return { ...firstResult, selfCorrected: false };
  }

  const correctionParsed = JSON.parse(correctionMatch[0]);
  const validModels = [CHEAP_MODEL, MID_MODEL, PREMIUM_MODEL];

  context.log("Self-correction result:", correctionParsed);

  return {
    complexity: correctionParsed.complexity || firstResult.complexity,
    risk: correctionParsed.risk || firstResult.risk,
    model: validModels.includes(correctionParsed.model) ? correctionParsed.model : firstResult.model,
    reason: `[Self-corrected] ${correctionParsed.reason || firstResult.reason}`,
    selfCorrected: true
  };
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

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: { sent: true, type }
    };
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

    // Step 3 — Query Cosmos DB memory for similar past tickets
    const memoryContext = await getMemoryContext(predictedComplexity);
    context.log("Memory context retrieved:", memoryContext.length, "past tickets");

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
          classification = { complexity: "complex", risk: "high", model: PREMIUM_MODEL, reason: `KB match: ${knownIssueContext.issues.map(i => i.title).join(", ")}`, selfCorrected: false };
        } else if (medSeverity) {
          classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: `KB match: ${knownIssueContext.issues.map(i => i.title).join(", ")}`, selfCorrected: false };
        } else {
          classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: "Fallback - agent timeout", selfCorrected: false };
        }
      } else {
        classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: "Fallback - agent timeout", selfCorrected: false };
      }
    }

    const { complexity, risk, model, reason, selfCorrected } = classification;

    let costPer1k;
    if (model === CHEAP_MODEL) costPer1k = CHEAP_COST_PER_1K;
    else if (model === MID_MODEL) costPer1k = MID_COST_PER_1K;
    else costPer1k = PREMIUM_COST_PER_1K;

    // Step 5 — Triage response
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

    // Step 6 — Write to Cosmos DB memory (fire and forget)
    writeMemory({ prompt, complexity, model, risk, reason, selfCorrected }).catch(e =>
      context.log("Memory write failed:", e.message)
    );

    // Step 7 — KB auto-update if agent overrode KB recommendation (fire and forget)
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
        timestamp: new Date().toLocaleTimeString(),
        scorer: "FuseBox Foundry Agent - Responses API",
        knowledgeBase: knownIssueContext.matched
          ? `Matched ${knownIssueContext.issues.length} known issue(s): ${knownIssueContext.issues.map(i => i.title).join(", ")}`
          : "No known issues matched",
        memoryUsed: memoryContext.length > 0 ? `${memoryContext.length} past tickets referenced` : "No memory context yet",
        selfCorrected: selfCorrected || false
      }
    };
  }
});
