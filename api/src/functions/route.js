const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { app } = require("@azure/functions");

const ENDPOINT = "https://fusebox-resource.openai.azure.com/";
const API_KEY = process.env.AZURE_API_KEY;
const API_VERSION = "2024-12-01-preview";

const CHEAP_MODEL = "phi-4-mini";
const EXPENSIVE_MODEL = "DeepSeek-V4-Flash";

const CHEAP_COST_PER_1K = 0.0001;
const EXPENSIVE_COST_PER_1K = 0.0014;

function scoreComplexity(prompt) {
  const text = prompt.toLowerCase();
  const wordCount = text.split(" ").length;

  const complexKeywords = [
    "tenant-wide", "all users", "multiple sites", "domain controller",
    "migration", "conditional access", "azure ad connect", "hybrid",
    "outage", "critical", "production", "everyone", "entire"
  ];

  const simpleKeywords = [
    "password reset", "printer", "access request", "login",
    "cannot log", "offline", "single user", "one user"
  ];

  const complexScore = complexKeywords.filter(k => text.includes(k)).length;
  const simpleScore = simpleKeywords.filter(k => text.includes(k)).length;

  if (complexScore >= 2 || wordCount > 20) {
    return { complexity: "complex", risk: "high", model: EXPENSIVE_MODEL };
  } else if (complexScore === 1 || (wordCount > 10 && simpleScore === 0)) {
    return { complexity: "medium", risk: "medium", model: wordCount > 15 ? EXPENSIVE_MODEL : CHEAP_MODEL };
  } else {
    return { complexity: "simple", risk: "low", model: CHEAP_MODEL };
  }
}

app.http("route", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {

    context.log("FuseBox router received request");

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return {
        status: 400,
        jsonBody: { error: "Invalid JSON body" }
      };
    }

    const { prompt } = body;
    if (!prompt) {
      return {
        status: 400,
        jsonBody: { error: "prompt is required" }
      };
    }

    const { complexity, risk, model } = scoreComplexity(prompt);
    const costPer1k = model === CHEAP_MODEL ? CHEAP_COST_PER_1K : EXPENSIVE_COST_PER_1K;

    const client = new OpenAIClient(
      ENDPOINT,
      new AzureKeyCredential(API_KEY)
    );

    let response;
    try {
      response = await client.getChatCompletions(
        model,
        [
          {
            role: "system",
            content: "You are a helpful IT service desk assistant. Provide a brief, clear triage summary and recommended next steps for the reported issue."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        { maxTokens: 300 }
      );
    } catch (e) {
      context.log("Model call failed:", e.message);
      return {
        status: 500,
        jsonBody: { error: "Model call failed", details: e.message }
      };
    }

    const usage = response.usage;
    const totalTokens = usage.totalTokens;
    const cost = (totalTokens / 1000) * costPer1k;
    const expensiveCost = (totalTokens / 1000) * EXPENSIVE_COST_PER_1K;
    const savings = model === CHEAP_MODEL ? expensiveCost - cost : 0;

    return {
      status: 200,
      jsonBody: {
        prompt,
        model,
        complexity,
        risk,
        response: response.choices[0].message.content,
        tokens: totalTokens,
        cost: cost.toFixed(6),
        savings: savings > 0 ? savings.toFixed(6) : "N/A",
        timestamp: new Date().toLocaleTimeString(),
      }
    };
  }
});
