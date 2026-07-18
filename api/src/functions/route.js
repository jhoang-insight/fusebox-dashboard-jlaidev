const OpenAI = require("openai").default;
const { app } = require("@azure/functions");

const ENDPOINT = "https://fusebox-resource.services.ai.azure.com/openai/v1";
const API_KEY = process.env.AZURE_API_KEY;

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

    const client = new OpenAI({ baseURL: ENDPOINT, apiKey: API_KEY });

    let classification;
    try {
      const scoringRes = await client.chat.completions.create({
        model: MID_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a JSON-only IT ticket classifier. You must respond with ONLY a JSON object and nothing else. No explanation, no markdown, no code blocks.

Use exactly this format:
{"complexity":"simple","risk":"low","model":"phi-4-mini","reason":"brief reason"}

Rules — apply strictly in this order:

COMPLEX + high + Kimi-K2.6 — if ANY of these appear:
tenant-wide, entire tenant, everyone, all users, all accounts, critical, outage, production down, domain controller, migration, Azure AD Connect, Conditional Access, hybrid, infrastructure, security incident, breach

MEDIUM + medium + DeepSeek-V4-Flash — if ANY of these appear:
multiple users, several users, 2 or more users, three users, four users, five users, team, group, department, permissions, configuration, admin changes, intermittent, recurring

SIMPLE + low + phi-4-mini — everything else:
single user, one person, password reset, printer, access request, install, common issue

Output ONLY the JSON. No other text.`

          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0,
      });

      const content = scoringRes.choices[0].message.content.trim();
      context.log("Scoring response:", content);
      
      const cleaned = content.replace(/```json|```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validModels = [CHEAP_MODEL, MID_MODEL, PREMIUM_MODEL];
        classification = {
          complexity: parsed.complexity || "medium",
          risk: parsed.risk || "medium",
          model: validModels.includes(parsed.model) ? parsed.model : MID_MODEL,
          reason: parsed.reason || "AI classification",
        };
      } else {
        throw new Error("No JSON found");
      }
    } catch (e) {
      context.log("Scoring failed:", e.message);
      classification = { complexity: "medium", risk: "medium", model: MID_MODEL, reason: "Fallback classification" };
    }

    const { complexity, risk, model, reason } = classification;

    let costPer1k;
    if (model === CHEAP_MODEL) costPer1k = CHEAP_COST_PER_1K;
    else if (model === MID_MODEL) costPer1k = MID_COST_PER_1K;
    else costPer1k = PREMIUM_COST_PER_1K;

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
      context.log("Model call failed:", e.message);
      return { status: 500, headers: CORS_HEADERS, jsonBody: { error: "Model call failed", details: e.message } };
    }

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
      }
    };
  }
});
