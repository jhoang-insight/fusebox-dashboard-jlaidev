import React, { useState, useEffect } from 'react';
import './App.css';

const PROMPTS = [
  { text: "User cannot log into their laptop. Password reset needed.", complexity: "simple", model: "GPT-4o-mini", costPer1k: 0.00015 },
  { text: "Printer on floor 3 is offline. No one can print.", complexity: "simple", model: "GPT-4o-mini", costPer1k: 0.00015 },
  { text: "User requesting access to the shared marketing drive.", complexity: "simple", model: "GPT-4o-mini", costPer1k: 0.00015 },
  { text: "Outlook not syncing emails since this morning. VPN is connected.", complexity: "medium", model: "GPT-4o-mini", costPer1k: 0.00015 },
  { text: "Teams calls dropping every 20 minutes after Windows update.", complexity: "medium", model: "GPT-4o-mini", costPer1k: 0.00015 },
  { text: "SharePoint permissions broken after admin changes. Three users affected.", complexity: "medium", model: "GPT-4o", costPer1k: 0.005 },
  { text: "47 users cannot access Azure Virtual Desktop across three sites.", complexity: "complex", model: "GPT-4o", costPer1k: 0.005 },
  { text: "Conditional Access policy blocking all MFA accounts from M365. Tenant-wide.", complexity: "complex", model: "GPT-4o", costPer1k: 0.005 },
  { text: "Azure AD Connect sync failing after domain controller migration.", complexity: "complex", model: "GPT-4o", costPer1k: 0.005 },
];

const THRESHOLD = 0.05;
const EXPENSIVE_MODEL_COST = 0.005;

function getTokenCount(text) {
  return Math.floor(text.length / 4);
}

function getCost(tokens, costPer1k) {
  return (tokens / 1000) * costPer1k;
}

function App() {
  const [log, setLog] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [alert, setAlert] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    let index = 0;
    const interval = setInterval(() => {
      if (index >= PROMPTS.length) {
        clearInterval(interval);
        setRunning(false);
        return;
      }
      const prompt = PROMPTS[index];
      const tokens = getTokenCount(prompt.text);
      const cost = getCost(tokens, prompt.costPer1k);
      const expensiveCost = getCost(tokens, EXPENSIVE_MODEL_COST);
      const savings = expensiveCost - cost;

      setLog(prev => [{
        id: index + 1,
        timestamp: new Date().toLocaleTimeString(),
        prompt: prompt.text,
        complexity: prompt.complexity,
        model: prompt.model,
        tokens,
        cost: cost.toFixed(6),
        savings: savings > 0 ? savings.toFixed(6) : '0.000000',
      }, ...prev]);

      setTotalCost(prev => {
        const newTotal = prev + cost;
        if (newTotal >= THRESHOLD) setAlert(true);
        return newTotal;
      });

      setTotalSavings(prev => prev + (savings > 0 ? savings : 0));
      index++;
    }, 1500);

    return () => clearInterval(interval);
  }, [running]);

  const handleReset = () => {
    setLog([]);
    setTotalCost(0);
    setTotalSavings(0);
    setAlert(false);
    setRunning(false);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="eyebrow">INSIGHT MANAGED SERVICES</span>
          <h1 className="title">Project FuseBox</h1>
          <span className="subtitle">Enterprise AI FinOps Platform</span>
        </div>
        <div className="header-right">
          <div className="metric-box">
            <span className="metric-label">Total Spend</span>
            <span className="metric-value">${totalCost.toFixed(6)}</span>
          </div>
          <div className="metric-box savings">
            <span className="metric-label">Total Savings</span>
            <span className="metric-value">${totalSavings.toFixed(6)}</span>
          </div>
        </div>
      </header>

      {alert && (
        <div className="alert-banner">
          ⚠️ Budget threshold of ${THRESHOLD} reached — review AI spend immediately
        </div>
      )}

      <div className="controls">
        <button className="btn-primary" onClick={() => setRunning(true)} disabled={running}>
          Run Demo
        </button>
        <button className="btn-secondary" onClick={handleReset}>
          Reset
        </button>
      </div>

      <div className="log-container">
        <h2 className="section-title">Live Routing Decisions</h2>
        {log.length === 0 && <p className="empty-state">Press Run Demo to begin routing simulation</p>}
        <div className="log-list">
          {log.map(entry => (
            <div key={entry.id} className={`log-entry ${entry.complexity}`}>
              <div className="log-header">
                <span className="log-time">{entry.timestamp}</span>
                <span className={`badge ${entry.model === 'GPT-4o-mini' ? 'badge-cheap' : 'badge-expensive'}`}>
                  {entry.model}
                </span>
                <span className={`badge complexity-${entry.complexity}`}>
                  {entry.complexity}
                </span>
              </div>
              <p className="log-prompt">{entry.prompt}</p>
              <div className="log-footer">
                <span>Tokens: {entry.tokens}</span>
                <span>Cost: ${entry.cost}</span>
                <span>Savings: ${entry.savings}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
