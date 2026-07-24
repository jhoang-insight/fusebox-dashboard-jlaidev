# FuseBox AI Ops

### Autonomous AI FinOps for Enterprise IT

**Team Token Burners — Insight Hackathon 2026**

---

## Demo Video

🎬 [Watch FuseBox AI Ops — Full Demo](https://insightonline-my.sharepoint.com/:v:/g/personal/jimmy_hoang_insight_com/IQA8LawhKS2mT6NlDlK18rRYAX3HqY1anbAH7bu-WCjK5XM?e=JCCbkV)

## Live Dashboard

🔗 [Launch FuseBox AI Ops](https://polite-stone-0c7f55c10.7.azurestaticapps.net)

> Access code: TokenBurners2026

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

## Key Results

- Up to **98.6% cost reduction** vs routing all tickets to the most expensive model
- Projected annual savings of **$3K to $15K** at 50,000 tickets per year
- Anomaly detection fires when a pattern spike is detected within a **5-minute window**
- Email alerts fire within **60 seconds** of a budget threshold breach or anomaly
- Auto-generated incident reports uploaded to Azure Blob Storage on every anomaly
- Resolution outcomes written back to memory and factored into future routing decisions

---

## Judge & Reviewer Guide — Start Here

This section is written specifically for judges and reviewers evaluating FuseBox AI Ops. Follow the steps below to experience the full feature set in the intended order. Each step explains what to expect, what to look for, and why certain behaviors occur.

### Before You Begin

- Open the dashboard at the link above and enter the access code
- The dashboard starts empty — all counters at zero — this is correct
- Every ticket you submit goes through a live multi-agent AI chain in real time — there is no pre-loaded demo data
- Routing decisions may take 10 to 60 seconds depending on agent response time — this is normal and expected
- Occasionally the AI agent will time out and fall back to a rule-based classification — the routing reason will show "Fallback - agent timeout" — this is intentional architecture, not an error — the system still produces a correct result

---

### Recommended Demo Sequence — Follow This Order

Work through these four tickets in order. Each one is designed to demonstrate a specific capability of the platform.

---

#### Ticket 1 — Simple Issue

Paste this into the input field and click Submit or press Enter:

"User forgot their password and cannot log into their laptop"

**What to expect:**

- Routes to phi-4-mini — simple, low risk
- Self-corrected badge may appear if the agent detected uncertainty and re-evaluated
- Confidence Escalated badge may appear if the confidence score was below 75
- Quality Risk Distribution panel appears in the sidebar tracking this ticket's risk level
- Feedback bar appears at the bottom of the card — you can submit a resolution outcome after completing all tickets

---

#### Ticket 2 — Medium Scope Issue

Paste this into the input field and click Submit or press Enter:

"Outlook is not syncing for the entire sales team this morning"

**What to expect:**

- Routes to DeepSeek-V4-Flash — medium, medium risk
- Memory Hit badge may appear — the agent retrieved past similar tickets from Cosmos DB and factored them into this decision
- If a Memory Hit fires, the routing reason will explicitly cite which past ticket influenced the decision
- Quality Risk Distribution updates in real time

---

#### Ticket 3 — Complex Infrastructure Failure

Paste this into the input field and click Submit or press Enter:

"47 users cannot access Azure Virtual Desktop across three sites. Host pool appears down."

**What to expect:**

- Routes to Kimi-K2.6 — complex, high risk
- Knowledge Base Match fires — FuseBox AI Ops has a known issue pattern for AVD outages
- Auditor Confirmed badge may appear — the independent FuseBox-Auditor agent reviewed and agreed with the primary classification
- No anomaly on this ticket alone — anomaly requires 2 similar tickets within 5 minutes
- Triage response is detailed and technically specific to AVD infrastructure

---

#### Ticket 4 — Anomaly Trigger

Submit the exact same ticket again immediately:

"47 users cannot access Azure Virtual Desktop across three sites. Host pool appears down."

**What to expect — this is the most important step:**

- Anomaly badge fires — FuseBox AI Ops detected 2 similar tickets within 5 minutes
- Ticket is automatically escalated to Kimi-K2.6 for advanced triage
- Auto-Created Incident Records panel appears in the sidebar with a new INC number
- View Full Incident Report link appears on the card — click it to open the full HTML incident report in a new tab
- An email alert fires automatically to the configured recipient
- The incident report includes the full agent classification chain, confidence score, cost analysis, memory context, knowledge base match, and recommended actions

---

### Closing the Loop — Resolution Feedback

After submitting Ticket 4, use the feedback bar at the bottom of the most recent card:

- Click **✓ Resolved**, **⬆️ Escalated**, or **✕ Failed**
- The confirmed badge appears on the card with a View Incident Report link
- The resolution outcome is written back to Cosmos DB memory
- The incident report blob is updated with a Resolution Outcome section — open the report again after submitting feedback and scroll to the bottom to see it
- Future tickets of the same complexity will receive this resolution outcome as part of their memory context

This is the feedback loop — the system learns from outcomes, not just patterns.

---

### What Each Badge Means

| Badge                   | What It Means                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 🧠 Memory Hit           | The agent retrieved past similar tickets from Cosmos DB and factored them into this decision                     |
| 🔄 Self-corrected       | The agent detected uncertainty in its first classification and re-evaluated with a focused correction prompt     |
| 🚨 Anomaly              | FuseBox AI Ops detected a pattern spike and autonomously escalated to incident response                          |
| ⬆️ Confidence Escalated | Confidence score was below 75 — ticket was automatically routed to a more capable model                          |
| 🔍 Auditor Confirmed    | The independent FuseBox-Auditor agent reviewed and agreed with the primary classification                        |
| 🔍 Auditor Override     | The FuseBox-Auditor disagreed and overrode the primary classification with a new complexity and model assignment |

---

### What the Sidebar Panels Show

**Budget Meter** — cumulative spend across all tickets in the session with threshold and exceeded alerts

**Enterprise Projection** — projected annual savings based on current routing efficiency at 50,000 tickets per year

**Model Distribution** — live routing split across all three models with bar charts

**Quality Risk Distribution** — breakdown of low, medium, and high risk tickets with a weighted quality risk index and overall risk rating

**Agentic Intelligence** — running count of self-corrections, memory hits, auditor overrides, and anomalies

**Auto-Created Incident Records** — all anomaly-triggered incidents with links to full HTML reports

---

### Known Behaviors — Not Errors

**Agent timeout fallback** — the Foundry hosted agent endpoint has variable latency. On some requests the agent times out and the system falls back to a rule-based classification. The routing reason will show "Fallback - agent timeout." The fallback produces correct results. This is intentional architecture preserved to demonstrate graceful degradation.

**Anomaly sensitivity** — the anomaly threshold is set to 2 similar tickets within a 5-minute window. Submit Tickets 3 and 4 within 4 minutes of each other to ensure the anomaly fires reliably.

**Memory influence** — as you submit more tickets, the memory context grows. Later tickets will show Memory Hit badges and routing reasons that explicitly cite past tickets. This is the persistent memory system working as intended.

**Response time variation** — simple tickets route in 10 to 30 seconds. Complex tickets may take 20 to 45 seconds. This reflects the full multi-agent chain running in real time.

**Budget meter** — the session budget limit is set low intentionally for demo purposes. If the budget threshold or limit is reached, alert banners appear and email alerts fire automatically. Reset Session clears all counters and starts fresh.

---

## Agentic AI Architecture

FuseBox AI Ops demonstrates all five core dimensions of agentic AI in a production-grade implementation.

| Dimension            | Implementation                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Autonomy             | Full end-to-end operation from ticket intake to report generation and email alert — no human intervention      |
| Persistent Memory    | Cosmos DB memory store — resolution outcomes write back and influence future routing decisions                 |
| Tool Use             | File Search on both agents, KB pattern matching, Blob Storage, Cosmos DB, ACS email                            |
| Multi-Step Reasoning | KB check → memory retrieval → classification → self-correction → audit → anomaly detection → report generation |
| Self-Correction      | Explicit re-evaluation loop with uncertainty detection, confidence scoring, and focused correction prompt      |

---

## How It Works

Every ticket submitted goes through the following autonomous chain:

1. **Knowledge Base Check** — semantic match against known IT issue patterns
2. **Memory Retrieval** — top 3 similar past tickets retrieved from Cosmos DB including resolution outcomes
3. **Primary Classification** — FuseBox Agent classifies complexity, risk, model, confidence, and routing reason
4. **Self-Correction Loop** — if confidence is below 75 or uncertainty language is detected, the agent re-evaluates with a focused correction prompt
5. **Auditor Review** — FuseBox-Auditor independently reviews every classification below 90% confidence and can confirm or override
6. **Model Assignment** — ticket is routed to the appropriate model based on complexity and cost
7. **Anomaly Detection** — if 2 or more similar tickets appear within 5 minutes, anomaly fires automatically
8. **Incident Response** — anomaly triggers escalation to Kimi-K2.6, HTML incident report generation, blob upload, SAS URL, and ACS email alert
9. **Feedback Loop** — resolution outcome written back to Cosmos DB and injected into future memory context

---

## AI Models

| Model             | Tier            | Cost per 1K Tokens |
| ----------------- | --------------- | ------------------ |
| phi-4-mini        | Simple tickets  | $0.0001            |
| DeepSeek-V4-Flash | Medium tickets  | $0.0014            |
| Kimi-K2.6         | Complex tickets | $0.007             |

---

## Tech Stack

| Layer        | Technology                    |
| ------------ | ----------------------------- |
| Frontend     | React — Azure Static Web Apps |
| Backend      | Azure Functions (Node.js)     |
| AI Platform  | Azure AI Foundry              |
| Memory       | Azure Cosmos DB               |
| Storage      | Azure Blob Storage            |
| Email Alerts | Azure Communication Services  |
| Auth         | localStorage password gate    |

---

## Azure Resources

| Resource            | Name                                      |
| ------------------- | ----------------------------------------- |
| Resource Group      | fusebox-rg                                |
| Function App        | fusebox-api-burners.azurewebsites.net     |
| Cosmos DB           | fusebox-cosmos — FuseBoxDB — TicketMemory |
| Storage Account     | fuseboxstorage                            |
| AI Foundry Endpoint | fusebox-resource.services.ai.azure.com    |
| ACS                 | fusebox-comms                             |

---

## Foundry Agents

- **FuseBox** — primary classification agent with File Search connected to the FuseBox AI Ops knowledge base
- **FuseBox-Auditor** — independent quality control agent with File Search — reviews and can override primary classifications below 90% confidence

---

## Dashboard Features

- Live ticket routing through full agent chain
- Real-time budget meter with threshold and exceeded alerts
- Enterprise projection — annual savings based on current routing efficiency
- Model distribution with live bar charts
- Quality risk distribution — low, medium, high breakdown with weighted risk index
- Agentic Intelligence panel — self-corrections, memory hits, auditor overrides, anomalies
- Auto-Created Incident Records with live report links
- Resolution feedback loop — close the loop directly from the dashboard
- Export Report — full CSV of session data
- Expandable decision cards — full modal view of every routing decision
- Response time badge — actual seconds displayed on every card

---

## Team Token Burners

Jimmy Hoang — Collin Whitman — Dave Epperson — Marcin Janowski — Sheldon Rollins

---

_FuseBox AI Ops — Built for the Insight Hackathon 2026 — Team Token Burners_
