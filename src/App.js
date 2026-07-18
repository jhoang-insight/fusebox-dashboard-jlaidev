import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const PROMPTS = [
  { text: "User cannot log into their laptop. Password reset needed.", complexity: "simple", model: "phi-4-mini", costPer1k: 0.0001, risk: "low" },
  { text: "Printer on floor 3 is offline. No one can print.", complexity: "simple", model: "phi-4-mini", costPer1k: 0.0001, risk: "low" },
  { text: "User requesting access to the shared marketing drive.", complexity: "simple", model: "phi-4-mini", costPer1k: 0.0001, risk: "low" },
  { text: "Outlook not syncing emails since this morning. VPN is connected.", complexity: "medium", model: "DeepSeek-V4-Flash", costPer1k: 0.0014, risk: "medium" },
  { text: "Teams calls dropping every 20 minutes after Windows update.", complexity: "medium", model: "DeepSeek-V4-Flash", costPer1k: 0.0014, risk: "medium" },
  { text: "SharePoint permissions broken after admin changes. Three users affected.", complexity: "medium", model: "DeepSeek-V4-Flash", costPer1k: 0.0014, risk: "medium" },
  { text: "47 users cannot access Azure Virtual Desktop across three sites.", complexity: "complex", model: "Kimi-K2.6", costPer1k: 0.007, risk: "high" },
  { text: "Conditional Access policy blocking all MFA accounts from M365. Tenant-wide.", complexity: "complex", model: "Kimi-K2.6", costPer1k: 0.007, risk: "high" },
  { text: "Azure AD Connect sync failing after domain controller migration.", complexity: "complex", model: "Kimi-K2.6", costPer1k: 0.007, risk: "high" },
];

const BUDGET_LIMIT = 0.001;
const ALERT_THRESHOLD = 0.0003;
const PREMIUM_MODEL_COST = 0.007;

function getTokenCount(text) {
  return Math.floor(text.length / 4);
}

function getCost(tokens, costPer1k) {
  return (tokens / 1000) * costPer1k;
}

function formatCost(value) {
  if (value === 0) return '$0.000000';
  return '$' + value.toFixed(6);
}

function generateCSV(log, totalCost, totalSavings, cheapCount, midCount, premiumCount) {
  const header = ['Timestamp','Model','Complexity','Risk','Tokens','Cost ($)','Savings ($)','Live','Prompt'];
  const rows = log.map(e => [
    e.timestamp,
    e.model,
    e.complexity,
    e.risk,
    e.tokens,
    e.cost,
    e.savings,
    e.live ? 'Yes' : 'No',
    '"' + e.prompt.replace(/"/g, '""') + '"'
  ]);
  const summary = [
    [],
    ['SUMMARY'],
    ['Total Cost', formatCost(totalCost)],
    ['Total Savings', formatCost(totalSavings)],
    ['Routed to Phi-4-mini', cheapCount],
    ['Routed to DeepSeek-V4-Flash', midCount],
    ['Routed to Kimi-K2.6', premiumCount],
    ['Total Processed', cheapCount + midCount + premiumCount],
  ];
  const csvContent = [header, ...rows, ...summary].map(r => r.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fusebox-report-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [log, setLog] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [alertActive, setAlertActive] = useState(false);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const [running, setRunning] = useState(false);
  const [cheapCount, setCheapCount] = useState(0);
  const [midCount, setMidCount] = useState(0);
  const [premiumCount, setPremiumCount] = useState(0);
  const [cheapCost, setCheapCost] = useState(0);
  const [midCost, setMidCost] = useState(0);
  const [premiumCost, setPremiumCost] = useState(0);
  const [livePrompt, setLivePrompt] = useState('');
  const [liveLoading, setLiveLoading] = useState(false);
  const [emailSent, setEmailSent] = useState({ threshold: false, exceeded: false });
  const intervalRef = useRef(null);

  useEffect(() => {
    if (alertActive && !emailSent.threshold) {
      console.log('[FuseBox Alert] Budget threshold reached — alert email would fire here via Azure Communication Services.');
      setEmailSent(prev => ({ ...prev, threshold: true }));
    }
    if (budgetExceeded && !emailSent.exceeded) {
      console.log('[FuseBox Alert] Budget EXCEEDED — critical alert email would fire here.');
      setEmailSent(prev => ({ ...prev, exceeded: true }));
    }
  }, [alertActive, budgetExceeded, emailSent]);

  useEffect(() => {
    if (!running) return;
    let index = 0;
    let shuffled = [...PROMPTS].sort(() => Math.random() - 0.5);
    intervalRef.current = setInterval(() => {
      if (index >= shuffled.length) {
        index = 0;
        shuffled = [...PROMPTS].sort(() => Math.random() - 0.5);
      }
      const prompt = shuffled[index];
      const tokens = getTokenCount(prompt.text);
      const cost = getCost(tokens, prompt.costPer1k);
      const premiumCostVal = getCost(tokens, PREMIUM_MODEL_COST);
      const savings = premiumCostVal - cost;
      setLog(prev => {
        const newEntry = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          prompt: prompt.text,
          complexity: prompt.complexity,
          model: prompt.model,
          risk: prompt.risk,
          tokens,
          cost: cost.toFixed(6),
          savings: savings > 0 ? savings.toFixed(6) : 'N/A',
          live: false,
          aiResponse: null,
          reason: null,
        };
        return [newEntry, ...prev].slice(0, 20);
      });
      setTotalCost(prev => {
        const newTotal = prev + cost;
        if (newTotal >= ALERT_THRESHOLD) setAlertActive(true);
        if (newTotal >= BUDGET_LIMIT) setBudgetExceeded(true);
        return newTotal;
      });
      setTotalSavings(prev => prev + (savings > 0 ? savings : 0));
      if (prompt.model === 'phi-4-mini') {
        setCheapCount(prev => prev + 1);
        setCheapCost(prev => prev + cost);
      } else if (prompt.model === 'DeepSeek-V4-Flash') {
        setMidCount(prev => prev + 1);
        setMidCost(prev => prev + cost);
      } else {
        setPremiumCount(prev => prev + 1);
        setPremiumCost(prev => prev + cost);
      }
      index++;
    }, 1500);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const handleReset = () => {
    clearInterval(intervalRef.current);
    setLog([]);
    setTotalCost(0);
    setTotalSavings(0);
    setAlertActive(false);
    setBudgetExceeded(false);
    setRunning(false);
    setCheapCount(0);
    setMidCount(0);
    setPremiumCount(0);
    setCheapCost(0);
    setMidCost(0);
    setPremiumCost(0);
    setLivePrompt('');
    setEmailSent({ threshold: false, exceeded: false });
  };

  const handleLiveSubmit = async () => {
    if (!livePrompt.trim()) return;
    setLiveLoading(true);
    try {
      const res = await fetch('https://fusebox-api-burners.azurewebsites.net/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: livePrompt }),
      });
      const data = await res.json();
      setLog(prev => {
        const newEntry = {
          id: Date.now(),
          timestamp: data.timestamp,
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
        };
        return [newEntry, ...prev].slice(0, 20);
      });
      setTotalCost(prev => {
        const newTotal = prev + parseFloat(data.cost);
        if (newTotal >= ALERT_THRESHOLD) setAlertActive(true);
        if (newTotal >= BUDGET_LIMIT) setBudgetExceeded(true);
        return newTotal;
      });
      setTotalSavings(prev => prev + (data.savings !== 'N/A' ? parseFloat(data.savings) : 0));
      if (data.model === 'phi-4-mini') {
        setCheapCount(prev => prev + 1);
        setCheapCost(prev => prev + parseFloat(data.cost));
      } else if (data.model === 'DeepSeek-V4-Flash') {
        setMidCount(prev => prev + 1);
        setMidCost(prev => prev + parseFloat(data.cost));
      } else {
        setPremiumCount(prev => prev + 1);
        setPremiumCost(prev => prev + parseFloat(data.cost));
      }
      setLivePrompt('');
    } catch (e) {
      console.error('Live route failed:', e);
    }
    setLiveLoading(false);
  };

  const totalProcessed = cheapCount + midCount + premiumCount;
  const optimizationRate = totalProcessed > 0 ? Math.round(((cheapCount + midCount) / totalProcessed) * 100) : 0;
  const costReduction = (totalCost + totalSavings) > 0 ? ((totalSavings / (totalCost + totalSavings)) * 100).toFixed(1) : 0;
  const budgetPct = Math.min((totalCost / BUDGET_LIMIT) * 100, 100).toFixed(0);

  return (
    <div className="app">
      <div className="fixed-panel">
        <header className="header">
          <div className="header-left">
            <h1 className="title">Project FuseBox</h1>
            <span className="subtitle">Enterprise AI FinOps Platform</span>
          </div>
          <div className="header-right">
            <div className="metric-box">
              <span className="metric-label">Total Spend</span>
              <span className="metric-value">{formatCost(totalCost)}</span>
            </div>
            <div className="metric-box savings">
              <span className="metric-label">Total Savings</span>
              <span className="metric-value">{formatCost(totalSavings)}</span>
            </div>
            <div className="metric-box smart">
              <span className="metric-label">Smart Routes</span>
              <span className="metric-value">{cheapCount + midCount} of {totalProcessed}</span>
            </div>
          </div>
        </header>

        {budgetExceeded && (
          <div className="alert-banner exceeded">
            BUDGET LIMIT EXCEEDED — ${BUDGET_LIMIT.toFixed(4)} cap reached — alert email fired — review spend immediately
          </div>
        )}
        {alertActive && !budgetExceeded && (
          <div className="alert-banner">
            BUDGET THRESHOLD REACHED — {budgetPct}% of limit used — alert email fired
          </div>
        )}

        <div className="controls">
          <button className="btn-primary" onClick={() => setRunning(true)} disabled={running}>Run Demo</button>
          <button className="btn-pause" onClick={() => setRunning(false)} disabled={!running}>Pause</button>
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
        </div>

        <div className="live-input-container">
          <input
            className="live-input"
            type="text"
            placeholder="Enter a ticket to route live..."
            value={livePrompt}
            onChange={e => setLivePrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLiveSubmit()}
          />
          <button className="btn-submit" onClick={handleLiveSubmit} disabled={liveLoading}>
            {liveLoading ? 'Routing...' : 'Submit Live'}
          </button>
        </div>

        {liveLoading && (
  <div className="flame-container">
    <div className="token-flame">
      <div className="token-coin">
        <span className="token-coin-label">FB</span>
      </div>
    </div>
    <span className="flame-text">FuseBox Routing...</span>
  </div>
)}




        <div className="comparison-container">
          <div className="comparison-cards">
            <div className="comparison-card cheap">
              <span className="comparison-card-title">Phi-4-mini</span>
              <span className="comparison-card-label">Simple — Lowest Cost</span>
              <span className="comparison-card-cost">{formatCost(cheapCost)}</span>
              <span className="comparison-card-requests">{cheapCount} requests</span>
            </div>
            <div className="comparison-card mid">
              <span className="comparison-card-title">DeepSeek-V4-Flash</span>
              <span className="comparison-card-label">Medium — Mid Cost</span>
              <span className="comparison-card-cost">{formatCost(midCost)}</span>
              <span className="comparison-card-requests">{midCount} requests</span>
            </div>
            <div className="comparison-card expensive">
              <span className="comparison-card-title">Kimi-K2.6</span>
              <span className="comparison-card-label">Complex — Highest Cost</span>
              <span className="comparison-card-cost">{formatCost(premiumCost)}</span>
              <span className="comparison-card-requests">{premiumCount} requests</span>
            </div>
            <div className="comparison-card baseline">
              <span className="comparison-card-title">No Optimization</span>
              <span className="comparison-card-label">If All Kimi-K2.6</span>
              <span className="comparison-card-cost">{formatCost(totalCost + totalSavings)}</span>
              <span className="comparison-card-requests">estimated</span>
            </div>
            <div className="comparison-card savings-card">
              <span className="comparison-card-title">You Saved</span>
              <span className="comparison-card-label">Total Savings</span>
              <span className="comparison-card-cost">{formatCost(totalSavings)}</span>
              <span className="comparison-card-requests">by smart routing</span>
            </div>
          </div>
        </div>

        <div className="summary-bar">
          <div className="summary-item">
            <span className="summary-value">{totalProcessed}</span>
            <span className="summary-label">Processed</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{cheapCount}</span>
            <span className="summary-label">Phi Routes</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{midCount}</span>
            <span className="summary-label">DeepSeek Routes</span>
          </div>
          <div className="summary-item">
            <span className="summary-value">{premiumCount}</span>
            <span className="summary-label">Kimi Routes</span>
          </div>
          <div className="summary-item highlight">
            <span className="summary-value">{optimizationRate}%</span>
            <span className="summary-label">Optimized</span>
          </div>
          <div className="summary-item highlight">
            <span className="summary-value">{costReduction}%</span>
            <span className="summary-label">Cost Reduction</span>
          </div>
          <div className="summary-item highlight">
            <span className="summary-value">{budgetPct}%</span>
            <span className="summary-label">Budget Used</span>
          </div>
        </div>

        <div className="legend">
          <div className="legend-item">
            <span className="legend-bar simple"></span>
            <span className="legend-label">Simple — Phi-4-mini — Lowest Cost</span>
          </div>
          <div className="legend-item">
            <span className="legend-bar medium"></span>
            <span className="legend-label">Medium — DeepSeek-V4-Flash — Mid Cost</span>
          </div>
          <div className="legend-item">
            <span className="legend-bar complex"></span>
            <span className="legend-label">Complex — Kimi-K2.6 — Highest Cost</span>
          </div>
        </div>

        <div className="log-header-bar">
          <h2 className="section-title">Live Routing Decisions</h2>
          <button
            className="btn-report"
            onClick={() => generateCSV(log, totalCost, totalSavings, cheapCount, midCount, premiumCount)}
            disabled={log.length === 0}
          >
            Export Report
          </button>
        </div>
      </div>

      <div className="scroll-panel">
        {log.length === 0 && (
          <p className="empty-state">Press Run Demo or submit a live ticket to begin</p>
        )}
        <div className="log-list">
          {log.map(entry => (
            <div key={entry.id} className={`log-entry ${entry.complexity}`}>
              <div className="log-header">
                <span className="log-time">{entry.timestamp}</span>
                {entry.live && <span className="badge live-badge">LIVE</span>}
                <span className={`badge ${entry.model === 'phi-4-mini' ? 'badge-cheap' : entry.model === 'DeepSeek-V4-Flash' ? 'badge-mid' : 'badge-expensive'}`}>
                  {entry.model}
                </span>
                <span className={`badge complexity-${entry.complexity}`}>{entry.complexity}</span>
                <span className={`badge risk-${entry.risk}`}>{entry.risk} risk</span>
              </div>
              <p className="log-prompt">
                <span className="prompt-label">Prompt: </span>{entry.prompt}
              </p>
              {(entry.aiResponse || entry.reason) && (
  <div className="ai-response">

                  <span className="ai-response-label">AI Triage Response</span>
                  {entry.reason && <p className="ai-reason">Routing reason: {entry.reason}</p>}
                  {entry.knowledgeBase && <p className="ai-reason">Knowledge base: {entry.knowledgeBase}</p>}
                  <p className="ai-response-text">{entry.aiResponse ? entry.aiResponse.replace(/[#*`_~]/g, '').trim() : ''}</p>
                </div>
              )}
              <div className="log-footer">
                <span>Tokens: {entry.tokens}</span>
                <span>Cost: ${entry.cost}</span>
                <span>Savings: {entry.savings === 'N/A' ? 'N/A' : `$${entry.savings}`}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="footer">
        <span className="footer-team">Team Token Burners</span>
        <span className="footer-divider">|</span>
        <span className="footer-project">Project FuseBox — Enterprise AI FinOps Platform</span>
        <span className="footer-divider">|</span>
        <span className="footer-hackathon">Insight Hackathon 2026</span>
      </footer>
    </div>
  );
}

export default App;
