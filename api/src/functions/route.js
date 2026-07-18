const OpenAI = require("openai").default;
const { app } = require("@azure/functions");

const ENDPOINT = "https://fusebox-resource.services.ai.azure.com/openai/v1";
const AGENT_ENDPOINT = "https://FuseBox-resource.services.ai.azure.com/api/projects/FuseBox/agents/FuseBox/endpoint/protocols/openai/responses?api-version=v1";
const API_KEY = process.env.AZURE_API_KEY;
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_CONTAINER_NAME = process.env.STORAGE_CONTAINER_NAME;
const BLOB_SAS_TOKEN = process.env.BLOB_SAS_TOKEN;

const CHEAP_MODEL = "phi-4-mini";
const MID_MODEL = "DeepSeek-V4-Flash";
const PREMIUM_MODEL = "Kimi-K2.6";

const CHEAP_COST_PER_1K = 0.0001;
const MID_COST_PER_1K = 0.0014;
const PREMIUM_COST_PER_1K = 0.007;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

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

async function callFuseBoxAgent(prompt, knownIssueContext, context) {
  const enrichedInput = knownIssueContext.matched
    ? `TICKET: ${prompt}\n\nKNOWN ISSUE CONTEXT FROM KNOWLEDGE BASE:\n${knownIssueContext.issues.map(i => `- ${i.title} (${i.severity} severity): ${i.recommendation}`).join("\n")}\n\nFactor this context into your classification.`
    : prompt;

  const res = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
      "Foundry-Features": "HostedAgents=V1Preview"
    },
    body: JSON.stringify({
      input: enrichedInput,
      stream: false
    })
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

    // Step 1 — Query knowledge base for known issue patterns
    const knownIssueContext = await checkKnownIssues(prompt);
    context.log("Known issue check result:", knownIssueContext);

    // Step 2 — FuseBox Foundry Agent classifies with knowledge base context
    let classification;
    try {
      classification = await callFuseBoxAgent(prompt, knownIssueContext, context);
      context.log("FuseBox agent classification:", classification);
    } catch (e) {
      context.log("FuseBox agent scoring failed, falling back to medium:", e.message);
      classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: "Fallback - FuseBox agent unavailable" };
    }

    const { complexity, risk, model, reason } = classification;

    // Step 3 — Determine cost rate
    let costPer1k;
    if (model === CHEAP_MODEL) costPer1k = CHEAP_COST_PER_1K;
    else if (model === MID_MODEL) costPer1k = MID_COST_PER_1K;
    else costPer1k = PREMIUM_COST_PER_1K;

    // Step 4 — Route to selected model for triage response
    const client = new OpenAI({ baseURL: ENDPOINT, apiKey: API_KEY });

    let response;
    try {
      response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "You are a helpful IT service desk assistant. Provide a brief, clear triage summary and recommended next steps."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 300,
      });
    } catch (e) {
      context.log("Model triage call failed:", e.message);
      return { status: 500, headers: CORS_HEADERS, jsonBody: { error: "Model triage call failed", details: e.message } };
    }

    // Step 5 — Calculate cost and savings
    const totalTokens = response.usage.total_tokens;
    const cost = (totalTokens / 1000) * costPer1k;
    const premiumCost = (totalTokens / 1000) * PREMIUM_COST_PER_1K;
    const savings = model !== PREMIUM_MODEL ? premiumCost - cost : 0;

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: {
        prompt,
        model,
        complexity,
        risk,
        reason,
        response: response.choices[0].message.content,
        tokens: totalTokens,
        cost: cost.toFixed(6),
        savings: savings > 0 ? savings.toFixed(6) : "N/A",
        timestamp: new Date().toLocaleTimeString(),
        scorer: "FuseBox Foundry Agent - Responses API",
        knowledgeBase: knownIssueContext.matched
          ? `Matched ${knownIssueContext.issues.length} known issue(s): ${knownIssueContext.issues.map(i => i.title).join(", ")}`
          : "No known issues matched"
      }
    };
  }
});
