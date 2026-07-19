import React, { useState, useEffect } from "react";
import "./App.css";

const DEMO_PASSWORD = "TokenBurners2026";

const BUDGET_LIMIT = 0.014;
const ALERT_THRESHOLD = 0.0008;
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
      setLog((prev) => {
        const newEntry = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }),
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
      if (data.model === "phi-4-mini") {
        setCheapCount((prev) => prev + 1);
      } else if (data.model === "DeepSeek-V4-Flash") {
        setMidCount((prev) => prev + 1);
      } else {
        setPremiumCount((prev) => prev + 1);
      }
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
                  <span className="badge live-badge">LIVE</span>
                  <span
                    className={`badge ${entry.model === "phi-4-mini" ? "badge-cheap" : entry.model === "DeepSeek-V4-Flash" ? "badge-mid" : "badge-expensive"}`}
                  >
                    {entry.model}
                  </span>
                  <span className={`badge complexity-${entry.complexity}`}>
                    {entry.complexity}
                  </span>
                  <span className={`badge risk-${entry.risk}`}>
                    {entry.risk} risk
                  </span>
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
                    <span
                      className={`confidence-badge ${entry.confidence >= 75 ? "confidence-high" : "confidence-low"}`}
                    >
                      {entry.confidence}% confidence
                    </span>
                  )}
                  {entry.memoryUsed &&
                    entry.memoryUsed !== "No memory context yet" && (
                      <span
                        className="memory-badge"
                        title="This ticket was classified using context from similar past tickets stored in Cosmos DB"
                      >
                        🧠 {entry.memoryUsed}
                      </span>
                    )}
                  {entry.selfCorrected && (
                    <span
                      className="correction-badge"
                      title="The agent detected uncertainty in its first classification and re-evaluated to produce a higher confidence decision"
                    >
                      🔄 Self-corrected
                    </span>
                  )}
                  {entry.anomalyDetected && (
                    <span
                      className="anomaly-badge"
                      title="FuseBox AI Ops detected a pattern spike and autonomously escalated this ticket and generated an incident report"
                    >
                      🚨 Anomaly — {entry.anomalyCount} similar tickets
                    </span>
                  )}
                  {entry.confidenceEscalated && (
                    <span
                      className="correction-badge"
                      title="Confidence score was below threshold — ticket was automatically escalated to a more capable model"
                    >
                      ⬆️ Confidence escalated
                    </span>
                  )}
                  {entry.auditorResult && (
                    <span
                      className={`auditor-badge ${entry.auditorOverride ? "auditor-override" : "auditor-confirmed"}`}
                      title={
                        entry.auditorOverride
                          ? `Auditor Override: ${entry.auditorResult}`
                          : `Auditor Confirmed: ${entry.auditorResult}`
                      }
                    >
                      🔍{" "}
                      {entry.auditorOverride
                        ? "Auditor Override"
                        : "Auditor Confirmed"}
                    </span>
                  )}
                  {entry.reportUrl && (
                    <a
                      href={entry.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="report-link"
                    >
                      📄 View Full Incident Report
                    </a>
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
                          <span className="feedback-pulse-dot" />
                          <span className="feedback-prompt-text">
                            Close the loop — select resolution outcome to write
                            back to memory:
                          </span>
                        </div>
                        <div className="feedback-buttons-row">
                          {entry.reportUrl && (
                            <a
                              href={entry.reportUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="report-link"
                              style={{ marginRight: "4px" }}
                            >
                              📄 View Incident Report
                            </a>
                          )}
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
                            title="Mark this ticket as successfully resolved — outcome written to FuseBox AI Ops memory"
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
                            title="Mark this ticket as escalated to a higher tier — outcome written to FuseBox AI Ops memory"
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
                            title="Mark this ticket as failed to resolve — outcome written to FuseBox AI Ops memory"
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
              <div className="model-dist-row">
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
              <div className="model-dist-row">
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
              <div className="model-dist-row">
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

          <div className="sidebar-card">
            <div className="sidebar-card-title">Agentic Intelligence</div>
            <div className="intel-grid">
              <div
                className="intel-item"
                title="Number of times the agent detected uncertainty and re-evaluated its own classification decision"
              >
                <span className="intel-icon">🔄</span>
                <span className="intel-value">{selfCorrectionCount}</span>
                <span className="intel-label">Self-Corrections</span>
              </div>
              <div
                className="intel-item"
                title="Number of times past ticket memory from Cosmos DB influenced the routing decision"
              >
                <span className="intel-icon">🧠</span>
                <span className="intel-value">{memoryHitCount}</span>
                <span className="intel-label">Memory Hits</span>
              </div>
              <div
                className="intel-item"
                title="Number of times the independent Auditor agent overrode the primary classification"
              >
                <span className="intel-icon">🔍</span>
                <span className="intel-value">{auditorOverrideCount}</span>
                <span className="intel-label">Auditor Overrides</span>
              </div>
              <div
                className="intel-item"
                title="Number of times FuseBox AI Ops detected a ticket pattern spike and autonomously escalated to incident response"
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
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">FuseBox Agent</span>
                <span className="status-tag">Foundry v3</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">FuseBox-Auditor</span>
                <span className="status-tag">DeepSeek</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">Phi-4-mini</span>
                <span className="status-tag">Simple</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">DeepSeek-V4-Flash</span>
                <span className="status-tag">Medium</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">Kimi-K2.6</span>
                <span className="status-tag">Complex</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">Cosmos DB Memory</span>
                <span className="status-tag">Active</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">Knowledge Base</span>
                <span className="status-tag">File Search</span>
              </div>
              <div className="status-row">
                <span className="status-dot dot-online"></span>
                <span className="status-name">Email Alerts</span>
                <span className="status-tag">ACS Live</span>
              </div>
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
              <span className="badge live-badge">LIVE</span>
              <span
                className={`badge ${expandedEntry.model === "phi-4-mini" ? "badge-cheap" : expandedEntry.model === "DeepSeek-V4-Flash" ? "badge-mid" : "badge-expensive"}`}
              >
                {expandedEntry.model}
              </span>
              <span className={`badge complexity-${expandedEntry.complexity}`}>
                {expandedEntry.complexity}
              </span>
              <span className={`badge risk-${expandedEntry.risk}`}>
                {expandedEntry.risk} risk
              </span>
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
                Savings:{" "}
                {expandedEntry.savings === "N/A"
                  ? "N/A"
                  : `$${expandedEntry.savings}`}
              </span>
              {expandedEntry.confidence > 0 && (
                <span
                  className={`confidence-badge ${expandedEntry.confidence >= 75 ? "confidence-high" : "confidence-low"}`}
                >
                  {expandedEntry.confidence}% confidence
                </span>
              )}
              {expandedEntry.memoryUsed &&
                expandedEntry.memoryUsed !== "No memory context yet" && (
                  <span
                    className="memory-badge"
                    title="This ticket was classified using context from similar past tickets stored in Cosmos DB"
                  >
                    🧠 {expandedEntry.memoryUsed}
                  </span>
                )}
              {expandedEntry.selfCorrected && (
                <span
                  className="correction-badge"
                  title="The agent detected uncertainty in its first classification and re-evaluated to produce a higher confidence decision"
                >
                  🔄 Self-corrected
                </span>
              )}
              {expandedEntry.anomalyDetected && (
                <span
                  className="anomaly-badge"
                  title="FuseBox AI Ops detected a pattern spike and autonomously escalated this ticket and generated an incident report"
                >
                  🚨 Anomaly — {expandedEntry.anomalyCount} similar tickets
                </span>
              )}
              {expandedEntry.confidenceEscalated && (
                <span
                  className="correction-badge"
                  title="Confidence score was below threshold — ticket was automatically escalated to a more capable model"
                >
                  ⬆️ Confidence escalated
                </span>
              )}
              {expandedEntry.auditorResult && (
                <span
                  className={`auditor-badge ${expandedEntry.auditorOverride ? "auditor-override" : "auditor-confirmed"}`}
                  title={
                    expandedEntry.auditorOverride
                      ? `Auditor Override: ${expandedEntry.auditorResult}`
                      : `Auditor Confirmed: ${expandedEntry.auditorResult}`
                  }
                >
                  🔍{" "}
                  {expandedEntry.auditorOverride
                    ? "Auditor Override"
                    : "Auditor Confirmed"}
                </span>
              )}
              {expandedEntry.reportUrl && (
                <a
                  href={expandedEntry.reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="report-link"
                >
                  📄 View Full Incident Report
                </a>
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
                        <span className="feedback-pulse-dot" />
                        <span className="feedback-prompt-text">
                          Close the loop — select resolution outcome to write
                          back to memory:
                        </span>
                      </div>
                      <div className="feedback-buttons-row">
                        {expandedEntry.reportUrl && (
                          <a
                            href={expandedEntry.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="report-link"
                            style={{ marginRight: "4px" }}
                          >
                            📄 View Incident Report
                          </a>
                        )}
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
                          title="Mark this ticket as successfully resolved — outcome written to FuseBox AI Ops memory"
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
                          title="Mark this ticket as escalated to a higher tier — outcome written to FuseBox AI Ops memory"
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
                          title="Mark this ticket as failed to resolve — outcome written to FuseBox AI Ops memory"
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
