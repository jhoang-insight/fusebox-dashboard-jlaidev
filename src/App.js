import React, { useState, useEffect, useRef } from 'react';
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

const THRESHOLD = 0.0003;
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
  const [alertActive, setAlertActive] = useState(false);
  const [running, setRunning] = useState(false);
  const [cheapCount, setCheapCount] = useState(0);
  const [expensiveCount, setExpensiveCount] = useState(0);
  const [cheapCost, setCheapCost] = useState(0);
  const [expensiveCost, setExpensiveCost] = useState(0);
  const intervalRef = useRef(null);

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
      const expensiveCostVal = getCost(tokens, EXPENSIVE_MODEL_COST);
      const savings = expensiveCostVal - cost;

      setLog(prev => {
        const newEntry = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          prompt: prompt.text,
          complexity: prompt.complexity,
          model: prompt.model,
          tokens,
          cost: cost.toFixed(6),
          savings: savings > 0 ? savings.toFixed(6) : 'N/A',
        };
        const updated = [newEntry, ...prev];
        return updated.slice(0, 20);
      });

      setTotalCost(prev => {
        const newTotal = prev + cost;
        if (newTotal >= THRESHOLD) setAlertActive(true);
        return newTotal;
      });

      setTotalSavings(prev => prev + (savings > 0 ? savings : 0));

      if (prompt.model === 'GPT-4o-mini') {
        setCheapCount(prev => prev + 1);
        setCheapCost(prev => prev + cost);
      } else {
        setExpensiveCount(prev => prev + 1);
        setExpensiveCost(prev => prev + cost);
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
    setRunning(false);
    setCheapCount(0);
    setExpensiveCount(0);
    setCheapCost(0);
    setExpensiveCost(0);
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
            <span className="metric-value">${totalCost.toFixed(4)}</span>
          </div>
          <div className="metric-box savings">
            <span className="metric-label">Total Savings</span>
            <span className="metric-value">${totalSavings.toFixed(4)}</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Smart Routes</span>
            <span className="metric-value">{cheapCount} of {cheapCount + expensiveCount} optimized</span>
          </div>
        </div>
      </header>

      {alertActive && (
        <div className="alert-banner">
          ⚠️ Budget threshold of ${THRESHOLD} reached — review AI spend immediately
        </div>
      )}

      <div className="controls">
        <button className="btn-primary" onClick={() => setRunning(true)} disabled={running}>
          Run Demo
        </button>
        <button className="btn-pause" onClick={() => setRunning(false)} disabled={!running}>
          Pause
        </button>
        <button className="btn-secondary" onClick={handleReset}>
          Reset
        </button>
      </div>

      <div className="comparison-container">
        <h2 className="section-title">Model Cost Comparison</h2>
        <div className="comparison-cards">
          <div className="comparison-card cheap">
            <span className="comparison-card-title">GPT-4o-mini</span>
            <span className="comparison-card-label">Optimized Model</span>
            <span className="comparison-card-cost">${cheapCost.toFixed(6)}</span>
            <span className="comparison-card-requests">{cheapCount} requests routed here</span>
          </div>
          <div className="comparison-card expensive">
            <span className="comparison-card-title">GPT-4o</span>
            <span className="comparison-card-label">Premium Model</span>
            <span className="comparison-card-cost">${expensiveCost.toFixed(6)}</span>
            <span className="comparison-card-requests">{expensiveCount} requests routed here</span>
          </div>
          <div className="comparison-card baseline">
            <span className="comparison-card-title">No Optimization</span>
            <span className="comparison-card-label">If All GPT-4o</span>
            <span className="comparison-card-cost">${(totalCost + totalSavings).toFixed(6)}</span>
            <span className="comparison-card-requests">estimated cost without FuseBox</span>
          </div>
          <div className="comparison-card savings-card">
            <span className="comparison-card-title">You Saved</span>
            <span className="comparison-card-label">Total Savings</span>
            <span className="comparison-card-cost">${totalSavings.toFixed(6)}</span>
            <span className="comparison-card-requests">by routing to cheaper models</span>
          </div>
        </div>
      </div>

      <div className="log-container">
        <h2 className="section-title">Live Routing Decisions</h2>
        <div className="legend">
          <div className="legend-item">
            <span className="legend-bar simple"></span>
            <span className="legend-label">Simple — GPT-4o-mini — Lowest Cost</span>
          </div>
          <div className="legend-item">
            <span className="legend-bar medium"></span>
            <span className="legend-label">Medium — GPT-4o-mini or GPT-4o</span>
          </div>
          <div className="legend-item">
            <span className="legend-bar complex"></span>
            <span className="legend-label">Complex — GPT-4o — Highest Cost</span>
          </div>
        </div>
        {log.length === 0 && (
          <p className="empty-state">Press Run Demo to begin routing simulation</p>
        )}
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
