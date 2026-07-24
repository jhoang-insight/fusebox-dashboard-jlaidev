import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const DEMO_PASSWORD = "TokenBurners2026";

const BUDGET_LIMIT = 0.014;
const ALERT_THRESHOLD = 0.006;

const ANNUAL_TICKET_VOLUME = 50000;

function formatCost(value) {
  if (value === 0) return "$0.000000";
  return "$" + value.toFixed(6);
}

function formatAnnual(value) {
  if (value >= 1000) return "$" + (value / 1000).toFixed(1) + "K";
  return "$" + value.toFixed(2);
}

function generateCSV(
  log,
  totalCost,
  totalSavings,
  cheapCount,
  midCount,
  premiumCount,
) {
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const headers = [
    "Timestamp",
    "Response Time (s)",
    "Model",
    "Complexity",
    "Risk",
    "Tokens",
    "Cost ($)",
    "Savings ($)",
    "Live",
    "Prompt",
  ];

  const rows = log.map((e) =>
    [
      escape(e.timestamp),
      escape(e.responseTime ? e.responseTime + "s" : ""),
      escape(e.model),
      escape(e.complexity),
      escape(e.risk),
      escape(e.tokens),
      escape(e.cost),
      escape(e.savings),
      escape(e.live ? "Yes" : "No"),
      escape(e.prompt),
    ].join(","),
  );

  const total = cheapCount + midCount + premiumCount;
  const optRate =
    total > 0 ? Math.round(((cheapCount + midCount) / total) * 100) : 0;

  const summaryRows = [
    "",
    "SUMMARY",
    "Total Cost," + formatCost(totalCost),
    "Total Savings," + formatCost(totalSavings),
    "Routed to Phi-4-mini," + cheapCount,
    "Routed to DeepSeek-V4-Flash," + midCount,
    "Routed to Kimi-K2.6," + premiumCount,
    "Total Processed," + total,
    "Optimization Rate," + optRate + "%",
  ];

  const csvContent = [headers.join(","), ...rows, ...summaryRows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "fusebox-aiops-report-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Tooltip wrapper component
function TooltipBadge({ className, tooltip, children, href, target, rel }) {
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        className={className + " has-tooltip"}
        data-tooltip={tooltip}
      >
        {children}
      </a>
    );
  }
  return (
    <span className={className + " has-tooltip"} data-tooltip={tooltip}>
      {children}
    </span>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState(
    () => localStorage.getItem("fb_unlocked") === "true",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [log, setLog] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [alertActive, setAlertActive] = useState(false);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const [cheapCount, setCheapCount] = useState(0);
  const [midCount, setMidCount] = useState(0);
  const [premiumCount, setPremiumCount] = useState(0);
  const [livePrompt, setLivePrompt] = useState("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [emailSent, setEmailSent] = useState({
    threshold: false,
    exceeded: false,
  });
  const [selfCorrectionCount, setSelfCorrectionCount] = useState(0);
  const [memoryHitCount, setMemoryHitCount] = useState(0);
  const [auditorOverrideCount, setAuditorOverrideCount] = useState(0);
  const [anomalyCount, setAnomalyCount] = useState(0);
  const [incidentRecords, setIncidentRecords] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [lowRiskCount, setLowRiskCount] = useState(0);
  const [mediumRiskCount, setMediumRiskCount] = useState(0);
  const [highRiskCount, setHighRiskCount] = useState(0);

  const submitStartTime = useRef(null);

  useEffect(() => {
    document.title = "FuseBox AI Ops";
  }, []);

  useEffect(() => {
    if (alertActive && !emailSent.threshold) {
      setEmailSent((prev) => ({ ...prev, threshold: true }));
      fetch("https://fusebox-api-burners.azurewebsites.net/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "threshold",
          totalSpend: totalCost.toFixed(6),
          triggerPrompt: log[0]?.prompt || "unknown",
          model: log[0]?.model || "unknown",
          cost: log[0]?.cost || "0",
        }),
      }).catch((e) => console.error("Alert email failed:", e));
    }
    if (budgetExceeded && !emailSent.exceeded) {
      setEmailSent((prev) => ({ ...prev, exceeded: true }));
      fetch("https://fusebox-api-burners.azurewebsites.net/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "exceeded",
          totalSpend: totalCost.toFixed(6),
          triggerPrompt: log[0]?.prompt || "unknown",
          model: log[0]?.model || "unknown",
          cost: log[0]?.cost || "0",
        }),
      }).catch((e) => console.error("Alert email failed:", e));
    }
  }, [alertActive, budgetExceeded, emailSent, totalCost, log]);

  const handleReset = () => {
    setLog([]);
    setTotalCost(0);
    setTotalSavings(0);
    setAlertActive(false);
    setBudgetExceeded(false);
    setCheapCount(0);
    setMidCount(0);
    setPremiumCount(0);
    setLivePrompt("");
    setEmailSent({ threshold: false, exceeded: false });
    setSelfCorrectionCount(0);
    setMemoryHitCount(0);
    setAuditorOverrideCount(0);
    setAnomalyCount(0);
    setIncidentRecords([]);
    setExpandedEntry(null);
    setLowRiskCount(0);
    setMediumRiskCount(0);
    setHighRiskCount(0);
  };

  const handleUnlock = () => {
    if (passwordInput === DEMO_PASSWORD) {
      setUnlocked(true);
      localStorage.setItem("fb_unlocked", "true");
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  };

  const handleLiveSubmit = async () => {
    if (!livePrompt.trim()) return;
    setLiveLoading(true);
    submitStartTime.current = Date.now();
    try {
      const res = await fetch(
        "https://fusebox-api-burners.azurewebsites.net/api/route",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: livePrompt }),
        },
      );
      const data = await res.json();
      const responseTime = Math.round(
        (Date.now() - submitStartTime.current) / 1000,
      );
      if (data.selfCorrected) setSelfCorrectionCount((prev) => prev + 1);
      if (data.memoryUsed && data.memoryUsed !== "No memory context yet")
        setMemoryHitCount((prev) => prev + 1);
      if (data.auditorOverride) setAuditorOverrideCount((prev) => prev + 1);
      if (data.anomalyDetected) {
        setAnomalyCount((prev) => prev + 1);
        const incidentId = "INC-" + Date.now().toString().slice(-6);
        const newIncident = {
          id: incidentId,
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }),
          prompt: livePrompt,
          complexity: data.complexity,
          model: data.model,
          anomalyCount: data.anomalyCount,
          priority:
            data.complexity === "complex"
              ? "P1"
              : data.complexity === "medium"
                ? "P2"
                : "P3",
          reportUrl: data.reportUrl || null,
        };
        setIncidentRecords((prev) => [newIncident, ...prev].slice(0, 5));
      }
      if (data.risk === "low") setLowRiskCount((prev) => prev + 1);
      else if (data.risk === "medium") setMediumRiskCount((prev) => prev + 1);
      else if (data.risk === "high") setHighRiskCount((prev) => prev + 1);
      setLog((prev) => {
        const newEntry = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }),
          responseTime,
          prompt: data.prompt,
          complexity: data.complexity,
          model: data.model,
          risk: data.risk,
          tokens: data.tokens,
          cost: data.cost,
          savings: data.savings,
          live: true,
          aiResponse: data.response,
          reason: data.reason,
          knowledgeBase: data.knowledgeBase,
          memoryUsed: data.memoryUsed,
          selfCorrected: data.selfCorrected,
          confidence: data.confidence,
          anomalyDetected: data.anomalyDetected,
          anomalyCount: data.anomalyCount,
          confidenceEscalated: data.confidenceEscalated,
          auditorResult: data.auditorResult,
          auditorOverride: data.auditorOverride,
          reportUrl: data.reportUrl || null,
          ticketId: data.ticketId || null,
          feedbackSubmitted: false,
        };
        return [newEntry, ...prev].slice(0, 20);
      });
      setTotalCost((prev) => {
        const newTotal = prev + parseFloat(data.cost);
        if (newTotal >= ALERT_THRESHOLD) setAlertActive(true);
        if (newTotal >= BUDGET_LIMIT) setBudgetExceeded(true);
        return newTotal;
      });
      setTotalSavings(
        (prev) =>
          prev + (data.savings !== "N/A" ? parseFloat(data.savings) : 0),
      );
      if (data.model === "phi-4-mini") setCheapCount((prev) => prev + 1);
      else if (data.model === "DeepSeek-V4-Flash")
        setMidCount((prev) => prev + 1);
      else setPremiumCount((prev) => prev + 1);
      setLivePrompt("");
    } catch (e) {
      console.error("Live route failed:", e);
    }
    setLiveLoading(false);
  };

  const handleFeedback = async (entryId, ticketId, status, reportUrl) => {
    if (!ticketId) return;
    setFeedbackLoading(true);
    try {
      await fetch(
        "https://fusebox-api-burners.azurewebsites.net/api/feedback",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId,
            resolutionStatus: status,
            resolutionNotes: `Marked ${status} via FuseBox AI Ops dashboard`,
            reportUrl: reportUrl || null,
          }),
        },
      );
      setLog((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, feedbackSubmitted: true, feedbackStatus: status }
            : e,
        ),
      );
    } catch (err) {
      console.error("Feedback failed:", err);
    }
    setFeedbackLoading(false);
  };

  // Tooltip helpers
  const modelTooltip = (model) => {
    if (model === "phi-4-mini")
      return "Model: phi-4-mini — lowest cost model, selected for simple single-user tickets";
    if (model === "DeepSeek-V4-Flash")
      return "Model: DeepSeek-V4-Flash — mid-tier model, selected for medium complexity workloads";
    return "Model: Kimi-K2.6 — most powerful and most expensive model, reserved for critical infrastructure incidents";
  };

  const impactTooltip = (complexity) => {
    if (complexity === "simple")
      return "Impact: Simple — single user, low scope, no broader risk to the organization";
    if (complexity === "medium")
      return "Impact: Medium — broader than a single user but not infrastructure-level failure";
    return "Impact: Complex — infrastructure-level critical failure affecting large numbers of users or critical systems";
  };

  const riskTooltip = (risk) => {
    if (risk === "low")
      return "Risk: Low — no cascading impact expected, contained to a single user or isolated system";
    if (risk === "medium")
      return "Risk: Medium — potential for wider disruption if left unresolved";
    return "Risk: High — significant cascading impact likely, critical systems or large user populations affected";
  };

  const totalProcessed = cheapCount + midCount + premiumCount;
  const optimizationRate =
    totalProcessed > 0
      ? Math.round(((cheapCount + midCount) / totalProcessed) * 100)
      : 0;
  const costReduction =
    totalCost + totalSavings > 0
      ? ((totalSavings / (totalCost + totalSavings)) * 100).toFixed(1)
      : 0;
  const budgetPct = Math.min((totalCost / BUDGET_LIMIT) * 100, 100).toFixed(0);
  const liveCount = log.filter((e) => e.live).length;
  const annualSavings =
    totalProcessed > 0
      ? (totalSavings / totalProcessed) * ANNUAL_TICKET_VOLUME
      : 0;
  const mostRecentLiveId = log.filter((e) => e.live)[0]?.id;
  const highRiskPct =
    totalProcessed > 0 ? Math.round((highRiskCount / totalProcessed) * 100) : 0;
  const mediumRiskPct =
    totalProcessed > 0
      ? Math.round((mediumRiskCount / totalProcessed) * 100)
      : 0;
  const lowRiskPct =
    totalProcessed > 0 ? Math.round((lowRiskCount / totalProcessed) * 100) : 0;
  const qualityRiskScore =
    totalProcessed > 0
      ? Math.round(
          ((highRiskCount * 2 + mediumRiskCount * 1) / (totalProcessed * 2)) *
            100,
        )
      : 0;
  const qualityRiskLabel =
    qualityRiskScore >= 60 ? "High" : qualityRiskScore >= 30 ? "Medium" : "Low";
  const qualityRiskColor =
    qualityRiskScore >= 60
      ? "#ef4444"
      : qualityRiskScore >= 30
        ? "#f0a500"
        : "#4caf50";

  if (!unlocked) {
    return (
      <div className="gate-screen">
        <div className="gate-card">
          <div className="gate-logo-wrap">
            <img
              src="/fusebox-logo-192.png"
              alt="FuseBox AI Ops Logo"
              className="gate-logo-img"
            />
          </div>
          <h1 className="gate-title">FuseBox AI Ops</h1>
          <p className="gate-subtitle">
            Autonomous AI FinOps for Enterprise IT
          </p>
          <p className="gate-team">
            Team Token Burners — Insight Hackathon 2026
          </p>
          <input
            className="gate-input"
            type="password"
            placeholder="Enter access code..."
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            autoFocus
          />
          {passwordError && (
            <p className="gate-error">Incorrect access code. Try again.</p>
          )}
          <button className="gate-button" onClick={handleUnlock}>
            Access Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="fixed-panel">
        <header className="header">
          <div className="header-left">
            <div className="header-logo-row">
              <img
                src="/fusebox-logo-192.png"
                alt="FuseBox AI Ops"
                className="header-logo-img"
              />
              <div className="header-title-block">
                <h1 className="title">FuseBox AI Ops</h1>
                <span className="subtitle">
                  Autonomous AI FinOps for Enterprise IT
                </span>
              </div>
            </div>
          </div>
          <div className="header-stats">
            <div className="header-stat-item">
              <span className="header-stat-label">Processed</span>
              <span className="header-stat-value">{totalProcessed}</span>
            </div>
            <div className="header-stat-divider" />
            <div className="header-stat-item">
              <span className="header-stat-label">Optimized</span>
              <span className="header-stat-value highlight-pink">
                {optimizationRate}%
              </span>
            </div>
            <div className="header-stat-divider" />
            <div className="header-stat-item">
              <span className="header-stat-label">Cost Reduction</span>
              <span className="header-stat-value highlight-green">
                {costReduction}%
              </span>
            </div>
            <div className="header-stat-divider" />
            <div className="header-stat-item">
              <span className="header-stat-label">Smart Routes</span>
              <span className="header-stat-value">
                {cheapCount + midCount} of {totalProcessed}
              </span>
            </div>
          </div>
        </header>

        {budgetExceeded && (
          <div className="alert-banner exceeded">
            BUDGET LIMIT EXCEEDED — ${BUDGET_LIMIT.toFixed(4)} cap reached —
            alert email fired — review spend immediately
          </div>
        )}
        {alertActive && !budgetExceeded && (
          <div className="alert-banner">
            BUDGET THRESHOLD REACHED — {budgetPct}% of limit used — alert email
            fired
          </div>
        )}

        <div className="controls">
          <button className="btn-secondary" onClick={handleReset}>
            Reset Session
          </button>
        </div>

        <div className="live-input-container">
          <input
            className="live-input"
            type="text"
            placeholder="Enter an IT support ticket to route live..."
            value={livePrompt}
            onChange={(e) => setLivePrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLiveSubmit()}
          />
          <button
            className="btn-submit"
            onClick={handleLiveSubmit}
            disabled={liveLoading}
          >
            {liveLoading ? "Routing..." : "Submit"}
          </button>
        </div>

        {liveLoading && (
          <div className="flame-container">
            <div className="token-flame">
              <img
                src="/fusebox-logo-192.png"
                alt="Routing"
                className="flame-logo-img"
              />
            </div>
            <span className="flame-text">FuseBox AI Ops Routing...</span>
          </div>
        )}

        <div className="log-header-bar">
          <h2 className="section-title">Live Routing Decisions</h2>
          <button
            className="btn-report"
            onClick={() =>
              generateCSV(
                log,
                totalCost,
                totalSavings,
                cheapCount,
                midCount,
                premiumCount,
              )
            }
            disabled={log.length === 0}
          >
            Export Report
          </button>
        </div>
      </div>

      <div className="main-layout">
        <div className="cards-panel">
          {log.length === 0 && (
            <p className="empty-state">Submit a live ticket to begin</p>
          )}
          <div className="log-list">
            {log.map((entry) => (
              <div key={entry.id} className={`log-entry ${entry.complexity}`}>
                <div className="log-header">
                  <span className="log-time">{entry.timestamp}</span>

                  {entry.responseTime && (
                    <TooltipBadge
                      className="response-time-badge"
                      tooltip={`Response Time: ${entry.responseTime}s — total time from ticket submission to full agentic response`}
                    >
                      ⚡ {entry.responseTime}s
                    </TooltipBadge>
                  )}

                  <TooltipBadge
                    className="badge live-badge"
                    tooltip="LIVE — this ticket was processed through the live FuseBox pipeline in real time, nothing cached"
                  >
                    LIVE
                  </TooltipBadge>

                  <TooltipBadge
                    className={`badge ${entry.model === "phi-4-mini" ? "badge-cheap" : entry.model === "DeepSeek-V4-Flash" ? "badge-mid" : "badge-expensive"}`}
                    tooltip={modelTooltip(entry.model)}
                  >
                    {entry.model}
                  </TooltipBadge>

                  <TooltipBadge
                    className={`badge complexity-${entry.complexity}`}
                    tooltip={impactTooltip(entry.complexity)}
                  >
                    {entry.complexity}
                  </TooltipBadge>

                  <TooltipBadge
                    className={`badge risk-${entry.risk}`}
                    tooltip={riskTooltip(entry.risk)}
                  >
                    {entry.risk}
                  </TooltipBadge>

                  <button
                    className="expand-btn"
                    onClick={() => setExpandedEntry(entry)}
                    title="Expand card"
                  >
                    ⤢
                  </button>
                </div>

                <p className="log-prompt">
                  <span className="prompt-label">Prompt: </span>
                  {entry.prompt}
                </p>

                {(entry.aiResponse || entry.reason) && (
                  <div className="ai-response">
                    <span className="ai-response-label">
                      AI Triage Response
                    </span>
                    {entry.reason && (
                      <p className="ai-reason">
                        Routing reason: {entry.reason}
                      </p>
                    )}
                    {entry.knowledgeBase && (
                      <p className="ai-reason">
                        Knowledge base: {entry.knowledgeBase}
                      </p>
                    )}
                    {entry.aiResponse && (
                      <p className="ai-response-text">
                        {entry.aiResponse.replace(/[#*`_~]/g, "").trim()}
                      </p>
                    )}
                  </div>
                )}

                <div className="log-footer">
                  <span>Tokens: {entry.tokens}</span>
                  <span>Cost: ${entry.cost}</span>
                  <span>
                    Savings:{" "}
                    {entry.savings === "N/A" ? "N/A" : `$${entry.savings}`}
                  </span>

                  {entry.confidence > 0 && (
                    <TooltipBadge
                      className={`confidence-badge ${entry.confidence >= 75 ? "confidence-high" : "confidence-low"}`}
                      tooltip={`Confidence Score: ${entry.confidence}% — ${entry.confidence >= 90 ? "FuseBox is highly certain this routing decision is correct" : entry.confidence >= 75 ? "confidence is acceptable — routing proceeded as classified" : "confidence was below threshold — model was automatically escalated to a more capable tier"}`}
                    >
                      {entry.confidence}%
                    </TooltipBadge>
                  )}

                  {entry.memoryUsed &&
                    entry.memoryUsed !== "No memory context yet" && (
                      <TooltipBadge
                        className="memory-badge"
                        tooltip={`Memory Hit — FuseBox pulled ${entry.memoryUsed} from Cosmos DB and used those outcomes to inform this routing decision`}
                      >
                        🧠 {entry.memoryUsed}
                      </TooltipBadge>
                    )}

                  {entry.selfCorrected && (
                    <TooltipBadge
                      className="correction-badge"
                      tooltip="Self-Corrected — the agent was not confident enough in its first answer, so it reviewed its own reasoning and re-evaluated before responding"
                    >
                      🔄 Agent Re-Evaluated
                    </TooltipBadge>
                  )}

                  {entry.anomalyDetected && (
                    <TooltipBadge
                      className="anomaly-badge"
                      tooltip={`Anomaly Detected — FuseBox identified ${entry.anomalyCount} similar high-complexity tickets within the detection window and triggered autonomous incident response: escalation, report generation, blob upload, and email alert`}
                    >
                      🚨 Anomaly — {entry.anomalyCount} similar tickets
                    </TooltipBadge>
                  )}

                  {entry.confidenceEscalated && (
                    <TooltipBadge
                      className="correction-badge"
                      tooltip="Confidence Escalated — confidence score came back below the threshold so FuseBox automatically stepped up to a more capable and more expensive model"
                    >
                      ⬆️ Confidence Escalated
                    </TooltipBadge>
                  )}

                  {entry.auditorResult && (
                    <TooltipBadge
                      className={`auditor-badge ${entry.auditorOverride ? "auditor-override" : "auditor-confirmed"}`}
                      tooltip={
                        entry.auditorOverride
                          ? "Auditor Override — a second independent AI agent reviewed the primary classification and disagreed — the auditor's decision overrides the original routing"
                          : "Auditor Confirmed — a second independent AI agent reviewed the primary classification on its own and agreed — two agents, one answer"
                      }
                    >
                      🔍{" "}
                      {entry.auditorOverride
                        ? "Auditor Override"
                        : "Auditor Confirmed"}
                    </TooltipBadge>
                  )}

                  {entry.reportUrl && (
                    <TooltipBadge
                      className="report-link"
                      tooltip="View Full Incident Report — full HTML report generated and uploaded to Azure Blob Storage automatically, includes classification chain, cost analysis, memory context, and recommended actions"
                      href={entry.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📄 View Full Incident Report
                    </TooltipBadge>
                  )}
                </div>

                {entry.ticketId && mostRecentLiveId === entry.id && (
                  <div className="feedback-bar">
                    {entry.feedbackSubmitted ? (
                      <div className="feedback-submitted-row">
                        <span
                          className={`feedback-confirmed feedback-${entry.feedbackStatus}`}
                        >
                          {entry.feedbackStatus === "resolved"
                            ? "✓ Resolved"
                            : entry.feedbackStatus === "escalated"
                              ? "⬆️ Escalated"
                              : "✕ Failed"}{" "}
                          — outcome written to memory
                        </span>
                        {entry.reportUrl && (
                          <a
                            href={entry.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="report-link"
                            style={{ marginLeft: "8px" }}
                          >
                            📄 View Incident Report
                          </a>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="feedback-prompt">
                          <span className="feedback-prompt-text">
                            Close the loop — select resolution outcome to write
                            back to memory:
                          </span>
                        </div>
                        <div className="feedback-buttons-row">
                          <button
                            className="btn-feedback btn-feedback-resolved"
                            onClick={() =>
                              handleFeedback(
                                entry.id,
                                entry.ticketId,
                                "resolved",
                                entry.reportUrl,
                              )
                            }
                            disabled={feedbackLoading}
                          >
                            ✓ Resolved
                          </button>
                          <button
                            className="btn-feedback btn-feedback-escalated"
                            onClick={() =>
                              handleFeedback(
                                entry.id,
                                entry.ticketId,
                                "escalated",
                                entry.reportUrl,
                              )
                            }
                            disabled={feedbackLoading}
                          >
                            ⬆️ Escalated
                          </button>
                          <button
                            className="btn-feedback btn-feedback-failed"
                            onClick={() =>
                              handleFeedback(
                                entry.id,
                                entry.ticketId,
                                "failed",
                                entry.reportUrl,
                              )
                            }
                            disabled={feedbackLoading}
                          >
                            ✕ Failed
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar">
          <div className="sidebar-card">
            <div className="sidebar-card-title">Budget Meter</div>
            <div className="budget-meter-track">
              <div
                className={`budget-meter-fill ${parseFloat(budgetPct) >= 100 ? "fill-exceeded" : parseFloat(budgetPct) >= 30 ? "fill-warning" : "fill-ok"}`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <div className="budget-meter-labels">
              <span className="budget-meter-pct">{budgetPct}% used</span>
              <span className="budget-meter-limit">
                Limit: ${BUDGET_LIMIT.toFixed(4)}
              </span>
            </div>
            <div className="budget-meter-values">
              <div className="budget-val-block">
                <span className="budget-val">{formatCost(totalCost)}</span>
                <span className="budget-val-label">Spent</span>
              </div>
              <div className="budget-val-block">
                <span className="budget-val savings-val">
                  {formatCost(totalSavings)}
                </span>
                <span className="budget-val-label">Saved</span>
              </div>
              <div className="budget-val-block">
                <span className="budget-val">{costReduction}%</span>
                <span className="budget-val-label">Reduction</span>
              </div>
            </div>
          </div>

          {totalProcessed > 0 && (
            <div className="sidebar-card annual-card">
              <div className="sidebar-card-title">Enterprise Projection</div>
              <div className="annual-savings-block">
                <span className="annual-savings-value">
                  {formatAnnual(annualSavings)}
                </span>
                <span className="annual-savings-label">
                  projected annual savings
                </span>
                <span className="annual-savings-sub">
                  based on {ANNUAL_TICKET_VOLUME.toLocaleString()} tickets/year
                  at current routing efficiency
                </span>
              </div>
              <div className="annual-divider" />
              <div className="annual-compare">
                <div className="annual-compare-row">
                  <span className="annual-compare-label">
                    Without FuseBox AI Ops
                  </span>
                  <span className="annual-compare-val baseline-val">
                    {formatAnnual(
                      ((totalCost + totalSavings) / totalProcessed) *
                        ANNUAL_TICKET_VOLUME,
                    )}
                  </span>
                </div>
                <div className="annual-compare-row">
                  <span className="annual-compare-label">
                    With FuseBox AI Ops
                  </span>
                  <span className="annual-compare-val green-val">
                    {formatAnnual(
                      (totalCost / totalProcessed) * ANNUAL_TICKET_VOLUME,
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="sidebar-card">
            <div className="sidebar-card-title">Model Distribution</div>
            <div className="model-dist">
              <div
                className="model-dist-row has-tooltip"
                data-tooltip="Phi-4-mini — cheapest model at $0.0001 per 1K tokens, assigned to simple single-user tickets with low scope and no cascading risk"
              >
                <div className="model-dist-info">
                  <span className="model-dist-dot dot-cheap"></span>
                  <span className="model-dist-name">Phi-4-mini</span>
                  <span className="model-dist-label">Simple</span>
                </div>
                <div className="model-dist-right">
                  <div className="model-dist-bar-track">
                    <div
                      className="model-dist-bar bar-cheap"
                      style={{
                        width:
                          totalProcessed > 0
                            ? `${(cheapCount / totalProcessed) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="model-dist-count">{cheapCount}</span>
                </div>
              </div>
              <div
                className="model-dist-row has-tooltip"
                data-tooltip="DeepSeek-V4-Flash — mid-tier model at $0.0014 per 1K tokens, assigned to medium complexity tickets with broader user impact"
              >
                <div className="model-dist-info">
                  <span className="model-dist-dot dot-mid"></span>
                  <span className="model-dist-name">DeepSeek</span>
                  <span className="model-dist-label">Medium</span>
                </div>
                <div className="model-dist-right">
                  <div className="model-dist-bar-track">
                    <div
                      className="model-dist-bar bar-mid"
                      style={{
                        width:
                          totalProcessed > 0
                            ? `${(midCount / totalProcessed) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="model-dist-count">{midCount}</span>
                </div>
              </div>
              <div
                className="model-dist-row has-tooltip"
                data-tooltip="Kimi-K2.6 — most powerful model at $0.007 per 1K tokens, reserved for complex infrastructure-level incidents requiring advanced triage"
              >
                <div className="model-dist-info">
                  <span className="model-dist-dot dot-premium"></span>
                  <span className="model-dist-name">Kimi-K2.6</span>
                  <span className="model-dist-label">Complex</span>
                </div>
                <div className="model-dist-right">
                  <div className="model-dist-bar-track">
                    <div
                      className="model-dist-bar bar-premium"
                      style={{
                        width:
                          totalProcessed > 0
                            ? `${(premiumCount / totalProcessed) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="model-dist-count">{premiumCount}</span>
                </div>
              </div>
            </div>
            <div className="optimization-pill">
              <span className="optimization-pill-value">
                {optimizationRate}%
              </span>
              <span className="optimization-pill-label">
                of tickets optimized away from Kimi
              </span>
            </div>
          </div>

          {totalProcessed > 0 && (
            <div className="sidebar-card">
              <div className="sidebar-card-title">
                Quality Risk Distribution
              </div>
              <div className="risk-score-block">
                <span
                  className="risk-score-value"
                  style={{ color: qualityRiskColor }}
                >
                  {qualityRiskLabel}
                </span>
                <span className="risk-score-label">overall quality risk</span>
                <div className="risk-score-bar-track">
                  <div
                    className="risk-score-bar-fill"
                    style={{
                      width: `${qualityRiskScore}%`,
                      background: qualityRiskColor,
                    }}
                  />
                </div>
                <span className="risk-score-sub">
                  {qualityRiskScore}% weighted risk index
                </span>
              </div>
              <div className="annual-divider" />
              <div className="model-dist">
                <div className="model-dist-row">
                  <div className="model-dist-info">
                    <span
                      className="model-dist-dot"
                      style={{
                        background: "#4caf50",
                        boxShadow: "0 0 6px rgba(76,175,80,0.7)",
                      }}
                    ></span>
                    <span className="model-dist-name">Low</span>
                    <span className="model-dist-label">{lowRiskPct}%</span>
                  </div>
                  <div className="model-dist-right">
                    <div className="model-dist-bar-track">
                      <div
                        className="model-dist-bar"
                        style={{
                          width: `${lowRiskPct}%`,
                          background: "linear-gradient(90deg,#4caf50,#66bb6a)",
                        }}
                      />
                    </div>
                    <span className="model-dist-count">{lowRiskCount}</span>
                  </div>
                </div>
                <div className="model-dist-row">
                  <div className="model-dist-info">
                    <span
                      className="model-dist-dot"
                      style={{
                        background: "#f0a500",
                        boxShadow: "0 0 6px rgba(240,165,0,0.7)",
                      }}
                    ></span>
                    <span className="model-dist-name">Medium</span>
                    <span className="model-dist-label">{mediumRiskPct}%</span>
                  </div>
                  <div className="model-dist-right">
                    <div className="model-dist-bar-track">
                      <div
                        className="model-dist-bar"
                        style={{
                          width: `${mediumRiskPct}%`,
                          background: "linear-gradient(90deg,#f0a500,#ffc844)",
                        }}
                      />
                    </div>
                    <span className="model-dist-count">{mediumRiskCount}</span>
                  </div>
                </div>
                <div className="model-dist-row">
                  <div className="model-dist-info">
                    <span
                      className="model-dist-dot"
                      style={{
                        background: "#ef4444",
                        boxShadow: "0 0 6px rgba(239,68,68,0.7)",
                      }}
                    ></span>
                    <span className="model-dist-name">High</span>
                    <span className="model-dist-label">{highRiskPct}%</span>
                  </div>
                  <div className="model-dist-right">
                    <div className="model-dist-bar-track">
                      <div
                        className="model-dist-bar"
                        style={{
                          width: `${highRiskPct}%`,
                          background: "linear-gradient(90deg,#ef4444,#ff6b6b)",
                        }}
                      />
                    </div>
                    <span className="model-dist-count">{highRiskCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="sidebar-card">
            <div className="sidebar-card-title">Agentic Intelligence</div>
            <div className="intel-grid">
              <div
                className="intel-item has-tooltip"
                data-tooltip="Self-Corrections — the agent reviewed its own reasoning and re-evaluated before responding because it was not confident enough in its first answer"
              >
                <span className="intel-icon">🔄</span>
                <span className="intel-value">{selfCorrectionCount}</span>
                <span className="intel-label">Self-Corrections</span>
              </div>
              <div
                className="intel-item has-tooltip"
                data-tooltip="Memory Hits — FuseBox pulled similar past tickets from Cosmos DB and factored those outcomes into the routing decision"
              >
                <span className="intel-icon">🧠</span>
                <span className="intel-value">{memoryHitCount}</span>
                <span className="intel-label">Memory Hits</span>
              </div>
              <div
                className="intel-item has-tooltip"
                data-tooltip="Auditor Overrides — a second independent AI agent disagreed with the primary classification and overrode the routing decision"
              >
                <span className="intel-icon">🔍</span>
                <span className="intel-value">{auditorOverrideCount}</span>
                <span className="intel-label">Auditor Overrides</span>
              </div>
              <div
                className="intel-item has-tooltip"
                data-tooltip="Anomalies Detected — FuseBox identified a pattern of similar high-complexity tickets and triggered autonomous incident response without human intervention"
              >
                <span className="intel-icon">🚨</span>
                <span className="intel-value">{anomalyCount}</span>
                <span className="intel-label">Anomalies</span>
              </div>
            </div>
          </div>

          {incidentRecords.length > 0 && (
            <div className="sidebar-card">
              <div className="sidebar-card-title">
                Auto-Created Incident Records
              </div>
              <div className="incident-list">
                {incidentRecords.map((inc) => (
                  <div key={inc.id} className="incident-row">
                    <div className="incident-header">
                      <span className="incident-id">{inc.id}</span>
                      <span
                        className={`incident-priority priority-${inc.priority.toLowerCase()}`}
                      >
                        {inc.priority}
                      </span>
                      <span className="incident-time">{inc.timestamp}</span>
                    </div>
                    <p className="incident-prompt">
                      {inc.prompt.slice(0, 60)}
                      {inc.prompt.length > 60 ? "..." : ""}
                    </p>
                    <p className="incident-meta">
                      {inc.anomalyCount} similar tickets detected —
                      auto-escalated to {inc.model}
                    </p>
                    {inc.reportUrl && (
                      <a
                        href={inc.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="report-link"
                        style={{ marginTop: "8px", display: "inline-block" }}
                      >
                        📄 View Incident Report
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-card">
            <div className="sidebar-card-title">System Status</div>
            <div className="status-list">
              {[
                ["FuseBox Agent", "Foundry v3"],
                ["FuseBox-Auditor", "DeepSeek"],
                ["Phi-4-mini", "Simple"],
                ["DeepSeek-V4-Flash", "Medium"],
                ["Kimi-K2.6", "Complex"],
                ["Cosmos DB Memory", "Active"],
                ["Knowledge Base", "File Search"],
                ["Email Alerts", "ACS Live"],
              ].map(([name, tag]) => (
                <div key={name} className="status-row">
                  <span className="status-dot dot-online"></span>
                  <span className="status-name">{name}</span>
                  <span className="status-tag">{tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-card">
            <div className="sidebar-card-title">Session Stats</div>
            <div className="session-stats">
              <div className="session-stat-row">
                <span className="session-stat-label">Total Processed</span>
                <span className="session-stat-value">{totalProcessed}</span>
              </div>
              <div className="session-stat-row">
                <span className="session-stat-label">Live Submissions</span>
                <span className="session-stat-value">{liveCount}</span>
              </div>
              <div className="session-stat-row">
                <span className="session-stat-label">Avg Cost / Ticket</span>
                <span className="session-stat-value">
                  {totalProcessed > 0
                    ? formatCost(totalCost / totalProcessed)
                    : "$0.000000"}
                </span>
              </div>
              <div className="session-stat-row">
                <span className="session-stat-label">Cost if All Kimi</span>
                <span className="session-stat-value">
                  {formatCost(totalCost + totalSavings)}
                </span>
              </div>
              <div className="session-stat-row">
                <span className="session-stat-label">Actual Cost</span>
                <span className="session-stat-value highlight-green">
                  {formatCost(totalCost)}
                </span>
              </div>
              <div className="session-stat-row">
                <span className="session-stat-label">Total Saved</span>
                <span className="session-stat-value highlight-pink">
                  {formatCost(totalSavings)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {expandedEntry && (
        <div className="modal-overlay" onClick={() => setExpandedEntry(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setExpandedEntry(null)}
            >
              ✕
            </button>
            <div className="modal-log-header">
              <span className="log-time">{expandedEntry.timestamp}</span>

              {expandedEntry.responseTime && (
                <TooltipBadge
                  className="response-time-badge"
                  tooltip={`Response Time: ${expandedEntry.responseTime}s — total time from ticket submission to full agentic response`}
                >
                  ⚡ {expandedEntry.responseTime}s
                </TooltipBadge>
              )}

              <TooltipBadge
                className="badge live-badge"
                tooltip="LIVE — this ticket was processed through the live FuseBox pipeline in real time, nothing cached"
              >
                LIVE
              </TooltipBadge>

              <TooltipBadge
                className={`badge ${expandedEntry.model === "phi-4-mini" ? "badge-cheap" : expandedEntry.model === "DeepSeek-V4-Flash" ? "badge-mid" : "badge-expensive"}`}
                tooltip={modelTooltip(expandedEntry.model)}
              >
                {expandedEntry.model}
              </TooltipBadge>

              <TooltipBadge
                className={`badge complexity-${expandedEntry.complexity}`}
                tooltip={impactTooltip(expandedEntry.complexity)}
              >
                {expandedEntry.complexity}
              </TooltipBadge>

              <TooltipBadge
                className={`badge risk-${expandedEntry.risk}`}
                tooltip={riskTooltip(expandedEntry.risk)}
              >
                {expandedEntry.risk}
              </TooltipBadge>
            </div>

            <p className="log-prompt">
              <span className="prompt-label">Prompt: </span>
              {expandedEntry.prompt}
            </p>

            {(expandedEntry.aiResponse || expandedEntry.reason) && (
              <div className="ai-response modal-ai-response">
                <span className="ai-response-label">AI Triage Response</span>
                {expandedEntry.reason && (
                  <p className="ai-reason">
                    Routing reason: {expandedEntry.reason}
                  </p>
                )}
                {expandedEntry.knowledgeBase && (
                  <p className="ai-reason">
                    Knowledge base: {expandedEntry.knowledgeBase}
                  </p>
                )}
                {expandedEntry.aiResponse && (
                  <p className="ai-response-text">
                    {expandedEntry.aiResponse.replace(/[#*`_~]/g, "").trim()}
                  </p>
                )}
              </div>
            )}

            <div className="log-footer">
              <span>Tokens: {expandedEntry.tokens}</span>
              <span>Cost: ${expandedEntry.cost}</span>
              <span>
                {expandedEntry.savings === "N/A"
                  ? "Savings: N/A"
                  : `Savings: $${expandedEntry.savings}`}
              </span>

              {expandedEntry.confidence > 0 && (
                <TooltipBadge
                  className={`confidence-badge ${expandedEntry.confidence >= 75 ? "confidence-high" : "confidence-low"}`}
                  tooltip={`Confidence Score: ${expandedEntry.confidence}% — ${expandedEntry.confidence >= 90 ? "FuseBox is highly certain this routing decision is correct" : expandedEntry.confidence >= 75 ? "confidence is acceptable — routing proceeded as classified" : "confidence was below threshold — model was automatically escalated to a more capable tier"}`}
                >
                  {expandedEntry.confidence}%
                </TooltipBadge>
              )}

              {expandedEntry.memoryUsed &&
                expandedEntry.memoryUsed !== "No memory context yet" && (
                  <TooltipBadge
                    className="memory-badge"
                    tooltip={`Memory Hit — FuseBox pulled ${expandedEntry.memoryUsed} from Cosmos DB and used those outcomes to inform this routing decision`}
                  >
                    🧠 {expandedEntry.memoryUsed}
                  </TooltipBadge>
                )}

              {expandedEntry.selfCorrected && (
                <TooltipBadge
                  className="correction-badge"
                  tooltip="Self-Corrected — the agent was not confident enough in its first answer, so it reviewed its own reasoning and re-evaluated before responding"
                >
                  🔄 Agent Re-Evaluated
                </TooltipBadge>
              )}

              {expandedEntry.anomalyDetected && (
                <TooltipBadge
                  className="anomaly-badge"
                  tooltip={`Anomaly Detected — FuseBox identified ${expandedEntry.anomalyCount} similar high-complexity tickets within the detection window and triggered autonomous incident response: escalation, report generation, blob upload, and email alert`}
                >
                  🚨 Anomaly — {expandedEntry.anomalyCount} similar tickets
                </TooltipBadge>
              )}

              {expandedEntry.confidenceEscalated && (
                <TooltipBadge
                  className="correction-badge"
                  tooltip="Confidence Escalated — confidence score came back below the threshold so FuseBox automatically stepped up to a more capable and more expensive model"
                >
                  ⬆️ Confidence Escalated
                </TooltipBadge>
              )}

              {expandedEntry.auditorResult && (
                <TooltipBadge
                  className={`auditor-badge ${expandedEntry.auditorOverride ? "auditor-override" : "auditor-confirmed"}`}
                  tooltip={
                    expandedEntry.auditorOverride
                      ? "Auditor Override — a second independent AI agent reviewed the primary classification and disagreed — the auditor's decision overrides the original routing"
                      : "Auditor Confirmed — a second independent AI agent reviewed the primary classification on its own and agreed — two agents, one answer"
                  }
                >
                  🔍{" "}
                  {expandedEntry.auditorOverride
                    ? "Auditor Override"
                    : "Auditor Confirmed"}
                </TooltipBadge>
              )}

              {expandedEntry.reportUrl && (
                <TooltipBadge
                  className="report-link"
                  tooltip="View Full Incident Report — full HTML report generated and uploaded to Azure Blob Storage automatically, includes classification chain, cost analysis, memory context, and recommended actions"
                  href={expandedEntry.reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  📄 View Full Incident Report
                </TooltipBadge>
              )}
            </div>

            {expandedEntry.ticketId &&
              mostRecentLiveId === expandedEntry.id && (
                <div className="feedback-bar">
                  {expandedEntry.feedbackSubmitted ? (
                    <div className="feedback-submitted-row">
                      <span
                        className={`feedback-confirmed feedback-${expandedEntry.feedbackStatus}`}
                      >
                        {expandedEntry.feedbackStatus === "resolved"
                          ? "✓ Resolved"
                          : expandedEntry.feedbackStatus === "escalated"
                            ? "⬆️ Escalated"
                            : "✕ Failed"}{" "}
                        — outcome written to memory
                      </span>
                      {expandedEntry.reportUrl && (
                        <a
                          href={expandedEntry.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="report-link"
                          style={{ marginLeft: "8px" }}
                        >
                          📄 View Incident Report
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="feedback-prompt">
                        <span className="feedback-prompt-text">
                          Close the loop — select resolution outcome to write
                          back to memory:
                        </span>
                      </div>
                      <div className="feedback-buttons-row">
                        <button
                          className="btn-feedback btn-feedback-resolved"
                          onClick={() => {
                            handleFeedback(
                              expandedEntry.id,
                              expandedEntry.ticketId,
                              "resolved",
                              expandedEntry.reportUrl,
                            );
                            setExpandedEntry(null);
                          }}
                          disabled={feedbackLoading}
                        >
                          ✓ Resolved
                        </button>
                        <button
                          className="btn-feedback btn-feedback-escalated"
                          onClick={() => {
                            handleFeedback(
                              expandedEntry.id,
                              expandedEntry.ticketId,
                              "escalated",
                              expandedEntry.reportUrl,
                            );
                            setExpandedEntry(null);
                          }}
                          disabled={feedbackLoading}
                        >
                          ⬆️ Escalated
                        </button>
                        <button
                          className="btn-feedback btn-feedback-failed"
                          onClick={() => {
                            handleFeedback(
                              expandedEntry.id,
                              expandedEntry.ticketId,
                              "failed",
                              expandedEntry.reportUrl,
                            );
                            setExpandedEntry(null);
                          }}
                          disabled={feedbackLoading}
                        >
                          ✕ Failed
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
          </div>
        </div>
      )}

      <footer className="footer">
        <span className="footer-team">Team Token Burners</span>
        <span className="footer-divider">|</span>
        <span className="footer-project">
          FuseBox AI Ops — Autonomous AI FinOps for Enterprise IT
        </span>
        <span className="footer-divider">|</span>
        <span className="footer-hackathon">Insight Hackathon 2026</span>
      </footer>
    </div>
  );
}

export default App;
