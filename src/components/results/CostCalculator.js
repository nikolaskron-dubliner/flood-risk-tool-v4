import { useState } from "react";
import { fmt } from "../../lib/assessmentConstants";

export default function CostCalculator({ score }) {
  const base = score || 50;
  const [mitigPct, setMitigPct] = useState(60);
  const [propVal,  setPropVal]  = useState(350);
  const [years,    setYears]    = useState(10);

  const annualRisk   = Math.round(base * 180);
  const mitigCost    = Math.round((mitigPct / 100) * annualRisk * 1.8);
  const annualSaved  = Math.round((mitigPct / 100) * annualRisk);
  const totalSaved   = annualSaved * years;
  const netSaving    = totalSaved - mitigCost;
  const valProtected = Math.round(propVal * 1000 * 0.06);
  const roi          = mitigCost > 0 ? Math.round((netSaving / mitigCost) * 100) : 0;

  const sliderStyle = pct => ({ "--pct": pct + "%" });

  return (
    <div className="calc-wrap">
      <div className="calc-title">Before vs. After Mitigation Calculator</div>
      <div className="calc-sub">Adjust the sliders to model your potential savings</div>
      <div className="calc-sliders">
        <div className="slider-item">
          <div className="slider-label">
          <div>
  <span className="sl-name">Mitigation coverage level</span>
  <div style={{ fontSize: 11, color: "var(--sub)", lineHeight: 1.4, marginTop: 2 }}>
    Estimated level of mitigation investment you may consider
  </div>
</div>
            <span className="sl-val">{mitigPct}%</span>
          </div>
          <input type="range" min="10" max="95" value={mitigPct} style={sliderStyle(((mitigPct-10)/85)*100)}
            onChange={e => setMitigPct(Number(e.target.value))} />
        </div>
        <div className="slider-item">
          <div className="slider-label">
            <span className="sl-name">Property value</span>
            <span className="sl-val">${propVal}k</span>
          </div>
        <input
  type="range"
  min="200"
  max="2000"
  step="25"
  value={propVal}
  style={sliderStyle(((propVal - 200) / 1800) * 100)}
  onChange={e => setPropVal(Number(e.target.value))}
/>
        </div>
        <div className="slider-item">
          <div className="slider-label">
            <span className="sl-name">Planning horizon</span>
            <span className="sl-val">{years} years</span>
          </div>
          <input type="range" min="1" max="20" value={years} style={sliderStyle(((years-1)/19)*100)}
            onChange={e => setYears(Number(e.target.value))} />
        </div>
      </div>
      <div className="calc-results">
        <div className="cr-box cr-cost">
          <div className="cr-lbl">Mitigation Investment</div>
          <div className="cr-num">{fmt(mitigCost)}</div>
          <div className="cr-note">One-time cost estimate</div>
        </div>
        <div className="cr-box cr-save">
          <div className="cr-lbl">Total Savings ({years}yr)</div>
          <div className="cr-num">{fmt(Math.max(0, netSaving))}</div>
          <div className="cr-note">Net after mitigation cost</div>
        </div>
        <div className="cr-box cr-roi">
          <div className="cr-lbl">Return on Investment</div>
          <div className="cr-num">{Math.max(0,roi)}%</div>
          <div className="cr-note">+ {fmt(valProtected)} value protected</div>
        </div>
      </div>
    </div>
  );
}

