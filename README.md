# FuseBox AI Ops
### Autonomous AI FinOps for Enterprise IT
**Team Token Burners — Insight Hackathon 2026**

---

## What Is FuseBox AI Ops?

FuseBox AI Ops is an autonomous AI FinOps platform built for enterprise IT support operations. It receives IT support tickets, classifies them by complexity and risk, routes them to the most cost-appropriate AI model, audits its own decisions, detects anomaly patterns, generates incident reports, fires real-time email alerts, and writes resolution outcomes back to memory — all without human intervention.

FuseBox AI Ops is not a chatbot. It is an autonomous routing engine with a full agentic AI architecture including multi-agent orchestration, persistent memory, self-correction, independent auditing, anomaly detection, and a closed feedback loop.

---

## The Problem

Every time an IT team submits a support ticket, the organization spends money on AI. Most enterprises have no visibility into how much they are spending, which model is being used, or whether the model assigned matches the actual complexity of the ticket.

Routing a simple password reset to the most expensive model costs 70x more than necessary. Routing a critical infrastructure failure to the cheapest model risks under-serving a P1 incident.

---

## The Solution

FuseBox AI Ops autonomously governs every routing decision with a multi-agent chain that classifies, audits, learns, and improves over time. The system knows what each model costs, what each ticket is worth, and how past similar tickets were resolved — and it uses all of that context to make the right call every time.

---

## Live Demo

🔗 [Launch FuseBox AI Ops](https://polite-stone-0c7f55c10.7.azurestaticapps.net)

> Access code required. Contact the team for credentials.

---

## Key Results

- Up to **98.6% cost reduction** vs routing all tickets to the most expensive model
- Projected annual savings of **$3K to $15K** at 50,000 tickets per year
- Anomaly detection fires within **30 minutes** of a pattern emerging
- Email alerts fire within **60 seconds** of a budget threshold breach or anomaly
- Auto-generated incident reports uploaded to Azure Blob Storage on every anomaly
- Resolution outcomes written back to memory and factored into future routing decisions
- **Agentic AI score: 9.6 / 10**

---

## Agentic AI Architecture

FuseBox AI Ops demonstrates all five core dimensions of agentic AI in a production-grade implementation.

| Dimension | Implementation |
|---|---|
| Autonomy | Full end-to-end operation from ticket intake to report generation and email alert — no human intervention |
| Persistent Memory | Cosmos DB memory store — resolution outcomes write back and influence future routing decisions |
| Tool Use | File Search on both agents, KB pattern matching, Blob Storage, Cosmos DB, ACS email |
| Multi-Step Reasoning | KB check → memory retrieval → classification → self-correction → audit → anomaly detection → report generation |
| Self-Correction | Explicit re-evaluation loop with uncertainty detection, confidence scoring, and focused correction prompt |

---

## How It Works

Every ticket submitted goes through the following autonomous chain:

1. **Knowledge Base Check** — semantic match against 25+ known IT issue patterns
2. **Memory Retrieval** — top 3 similar past tickets retrieved from Cosmos DB including resolution outcomes
3. **Primary Classification** — FuseBox Agent (v3) classifies complexity, risk, model, confidence, and routing reason
4. **Self-Correction Loop** — if confidence is below 75 or uncertainty language is detected, the agent re-evaluates with a focused correction prompt
5. **Auditor Review** — FuseBox-Auditor independently reviews every classification below 90% confidence and can confirm or override
6. **Model Assignment** — ticket is routed to the appropriate model based on complexity and cost
7. **Anomaly Detection** — if 2 or more same-complexity tickets appear within 30 minutes, anomaly fires automatically
8. **Incident Response** — anomaly triggers escalation to Kimi-K2.6, HTML incident report generation, blob upload, SAS URL, and ACS email alert
9. **Feedback Loop** — resolution outcome written back to Cosmos DB and injected into future memory context

---

## AI Models

| Model | Tier | Cost per 1K Tokens |
|---|---|---|
| phi-4-mini | Simple tickets | $0.0001 |
| DeepSeek-V4-Flash | Medium tickets | $0.0014 |
| Kimi-K2.6 | Complex tickets | $0.007 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React — Azure Static Web Apps |
| Backend | Azure Functions (Node.js) |
| AI Platform | Azure AI Foundry |
| Memory | Azure Cosmos DB |
| Storage | Azure Blob Storage |
| Email Alerts | Azure Communication Services |
| Auth | localStorage password gate |

---

## Azure Resources

| Resource | Name |
|---|---|
| Resource Group | fusebox-rg |
| Function App | fusebox-api-burners.azurewebsites.net |
| Cosmos DB | fusebox-cosmos — FuseBoxDB — TicketMemory |
| Storage Account | fuseboxstorage |
| AI Foundry Endpoint | fusebox-resource.services.ai.azure.com |
| ACS | fusebox-comms |

---

## Foundry Agents

- **FuseBox (v3)** — primary classification agent with File Search connected to the FuseBox AI Ops knowledge base
- **FuseBox-Auditor** — independent quality control agent with File Search — reviews and can override primary classifications below 90% confidence

---

## Dashboard Features

- Live ticket routing through full agent chain
- Real-time budget meter with threshold and exceeded alerts
- Enterprise projection — annual savings based on current routing efficiency
- Model distribution with live bar charts
- Agentic Intelligence panel — self-corrections, memory hits, auditor overrides, anomalies
- Auto-Created Incident Records with live report links
- System Status panel
- Session Stats
- Resolution feedback loop — close the loop directly from the dashboard
- Export Report — full CSV of session data
- Expandable decision cards — full modal view of every routing decision

---

## Deployment

**Frontend** — deploys automatically via GitHub Actions on push to main

**Backend**
```bash
cd api
func azure functionapp publish fusebox-api-burners
