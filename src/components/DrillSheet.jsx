import { useState } from "react";
import { buildDiagramModel, coachingLine, detailsSheet, letterSheet } from "../lib/drillDiagram.js";
import { drillTeamDefaults } from "../data/coachkitDrillSeed.js";

const LIME = "#c6f135";
const YELLOW = "#f5c518";
const INK = "#f4f4f4";
const PANEL = "#141414";
const LINE = "#333";

function printSheet(includeDetails) {
  document.body.classList.add("ck-printing-drill");
  document.body.classList.toggle("ck-print-details", !!includeDetails);
  const clear = () => {
    document.body.classList.remove("ck-printing-drill");
    document.body.classList.remove("ck-print-details");
  };
  window.addEventListener("afterprint", clear, { once: true });
  window.print();
  window.setTimeout(clear, 1500);
}

function FieldMark({ model, mini }) {
  const { view, players, cones, strokes, distances, balls = [] } = model;
  return (
    <svg viewBox={`0 0 ${view.w} ${view.h}`} width="100%" height="100%" role="img" aria-label="Drill diagram">
      <defs>
        <pattern id={mini ? "ck-grass-mini" : "ck-grass"} width="18" height={view.h} patternUnits="userSpaceOnUse">
          <rect width="9" height={view.h} fill="#2f9a34" />
          <rect x="9" width="9" height={view.h} fill="#27862c" />
        </pattern>
        <marker id={mini ? "ck-arrow-mini" : "ck-arrow"} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1.2 L 9 5 L 0 8.8 z" fill="#fff" />
        </marker>
        <filter id={mini ? "ck-shade-mini" : "ck-shade"}>
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.65" />
        </filter>
      </defs>
      <rect width={view.w} height={view.h} fill={`url(#${mini ? "ck-grass-mini" : "ck-grass"})`} />
      <rect x="1" y="1" width={view.w - 2} height={view.h - 2} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {strokes.map(stroke => (
        <path
          key={stroke.id}
          d={stroke.d}
          fill="none"
          stroke="#fff"
          strokeWidth={mini ? 1.6 : stroke.style.width}
          strokeDasharray={stroke.style.dash || undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={stroke.style.arrow ? `url(#${mini ? "ck-arrow-mini" : "ck-arrow"})` : undefined}
        />
      ))}
      {distances.map((item, index) => (
        <text
          key={`${item.label}-${index}`}
          x={item.x}
          y={item.y}
          textAnchor="middle"
          fill="#fff"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="13"
          fontWeight="800"
          filter={`url(#${mini ? "ck-shade-mini" : "ck-shade"})`}
        >{item.label}</text>
      ))}
      {cones.map((cone, index) => (
        <polygon key={`cone-${index}`} points={`${cone.x},${cone.y - 9} ${cone.x - 6},${cone.y + 4} ${cone.x + 6},${cone.y + 4}`} fill="#f39c12" stroke="#c87d08" strokeWidth="0.6" />
      ))}
      {players.map(player => (
        <g key={player.id} transform={`translate(${player.x} ${player.y})`}>
          <circle cx="0" cy="7" r={mini ? 8 : 11} fill="#2f6bff" />
          <circle cx="0" cy={mini ? -6 : -8} r={mini ? 4.5 : 6} fill="#f0c7a4" />
          <circle cx={mini ? 10 : 13} cy={mini ? -12 : -16} r={mini ? 6 : 8} fill="#111" stroke="#fff" strokeWidth="1" />
          <text x={mini ? 10 : 13} y={mini ? -9.5 : -13} textAnchor="middle" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontSize={mini ? 7 : 9} fontWeight="800">{player.label}</text>
        </g>
      ))}
      {balls.map(ball => (
        <g key={ball.id}>
          <circle cx={ball.x} cy={ball.y} r={mini ? 3.5 : 5} fill="#111" stroke="#fff" strokeWidth="1.2" />
          <path d={`M ${ball.x - 3} ${ball.y} H ${ball.x + 3} M ${ball.x} ${ball.y - 3} V ${ball.y + 3}`} stroke="#fff" strokeWidth="0.6" />
        </g>
      ))}
    </svg>
  );
}

function Panel({ kicker, children, style }) {
  return (
    <section className="ck-panel" style={{
      background: PANEL,
      border: `1px solid ${LINE}`,
      borderRadius: 8,
      padding: "8px 10px",
      marginBottom: 8,
      ...style,
    }}>
      <div className="ck-lime" style={{ color: LIME, fontWeight: 800, fontSize: 12, letterSpacing: "0.04em", marginBottom: 4 }}>{kicker}</div>
      {children}
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 16, color: INK, fontSize: 12, lineHeight: 1.35 }}>
      {(items || []).map(item => <li key={item} style={{ marginBottom: 2 }}>{item}</li>)}
    </ul>
  );
}

function LegendRow({ legend }) {
  const icon = {
    dashed_arrow: <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true"><line x1="1" y1="5" x2="22" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" /><path d="M18 1.5 L26 5 L18 8.5 Z" fill="currentColor" /></svg>,
    solid_arrow: <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true"><line x1="1" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="2" /><path d="M18 1.5 L26 5 L18 8.5 Z" fill="currentColor" /></svg>,
    squiggle_arrow: <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true"><path d="M1 7 Q5 1 9 7 T17 7 T25 5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>,
    ball: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#111" stroke="currentColor" /></svg>,
    cone: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><polygon points="6,1 11,11 1,11" fill="#f39c12" /></svg>,
    blue_player: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#2f6bff" /></svg>,
  };
  return (
    <div className="ck-legend" style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center", color: INK, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em" }}>
      {(legend || []).map(item => (
        <span key={item.symbol} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#fff", display: "inline-flex" }}>{icon[item.symbol] || null}</span>
          {item.meaning}
        </span>
      ))}
    </div>
  );
}

export function PrintableDrillList({ drills, onOpen }) {
  return (
    <section style={{
      marginBottom: 16,
      padding: 12,
      borderRadius: 10,
      border: "1px solid rgba(232,160,32,0.28)",
      background: "rgba(255,255,255,0.03)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#e8a020", marginBottom: 8 }}>Printable cards</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {drills.map(drill => (
          <button key={drill.id || drill.number} type="button" onClick={() => onOpen(drill)} style={{
            display: "flex", alignItems: "center", gap: 10, textAlign: "left",
            minHeight: 48, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)",
            color: "#e8e4dc", fontFamily: "inherit",
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: "50%", background: YELLOW, color: "#111",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0,
            }}>{drill.number}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 14 }}>{drill.title}</span>
              <span style={{ display: "block", fontSize: 11, color: "#7a7570" }}>{drill.category} · {drill.durationMin} min · {drill.playersLabel} players</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function DrillSheet({ drill, onBack }) {
  const [showDetails, setShowDetails] = useState(false);
  const sheet = letterSheet(drill);
  const details = detailsSheet(drill);
  const model = buildDiagramModel(drill.diagram);
  const mini = buildDiagramModel(drill.diagram, {
    mini: true,
    view: { w: 160, h: 110 },
  });
  const subtitle = `${String(sheet.category).toUpperCase()}${/drill/i.test(sheet.category) ? "" : " DRILL"}`;
  const durationChip = sheet.durationMin ? `${sheet.durationMin} MIN` : "";

  return (
    <div>
      <style>{`
        .ck-drill-main { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.9fr); gap: 10px; }
        .ck-drill-bottom { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 10px; }
        @media (max-width: 800px) {
          .ck-drill-main, .ck-drill-bottom { grid-template-columns: 1fr; }
        }
        @media print {
          @page { size: letter portrait; margin: 0.35in; }
          body:has(.ck-drill-sheet),
          body.ck-printing-drill { background: #fff !important; }
          body:has(.ck-drill-sheet) #ck-app-header,
          body.ck-printing-drill #ck-app-header,
          body:has(.ck-drill-sheet) .ck-no-print,
          body.ck-printing-drill .ck-no-print { display: none !important; }
          body:has(.ck-drill-sheet) .ck-app-body,
          body.ck-printing-drill .ck-app-body { max-width: none !important; padding: 0 !important; opacity: 1 !important; }
          body:has(.ck-drill-sheet) #root > div,
          body.ck-printing-drill #root > div { min-height: 0 !important; background: #fff !important; }
          body:has(.ck-drill-sheet) .ck-drill-sheet,
          body.ck-printing-drill .ck-drill-sheet,
          body:has(.ck-drill-sheet) .ck-drill-sheet .ck-panel,
          body.ck-printing-drill .ck-drill-sheet .ck-panel,
          body:has(.ck-drill-sheet) .ck-drill-sheet .ck-foot,
          body.ck-printing-drill .ck-drill-sheet .ck-foot,
          body:has(.ck-drill-sheet) .ck-drill-sheet .ck-head,
          body.ck-printing-drill .ck-drill-sheet .ck-head {
            background: #fff !important;
            border-color: #ccc !important;
            box-shadow: none !important;
          }
          body:has(.ck-drill-sheet) .ck-drill-sheet,
          body.ck-printing-drill .ck-drill-sheet,
          body:has(.ck-drill-sheet) .ck-drill-sheet *,
          body.ck-printing-drill .ck-drill-sheet * {
            color: #161616 !important;
          }
          body:has(.ck-drill-sheet) .ck-drill-sheet .ck-lime,
          body.ck-printing-drill .ck-drill-sheet .ck-lime {
            color: #3f6d00 !important;
          }
          .ck-drill-sheet .ck-drill-field { break-inside: avoid; height: 220px !important; }
          .ck-drill-main { grid-template-columns: 1.05fr 0.95fr !important; }
          .ck-drill-sheet { font-size: 10px; }
          body.ck-print-details .ck-drill-details { display: block !important; }
          body:not(.ck-print-details) .ck-drill-details { display: none !important; }
        }
        .ck-drill-details { display: none; }
        .ck-drill-details.is-open { display: block; }
      `}</style>
      <div className="ck-no-print" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={barBtn}>Back</button>
        <button type="button" onClick={() => setShowDetails(open => !open)} style={barBtn}>{showDetails ? "Hide details" : "More"}</button>
        <button type="button" onClick={() => printSheet(false)} style={{ ...barBtn, background: YELLOW, color: "#111", borderColor: YELLOW }}>Print</button>
        <button type="button" onClick={() => printSheet(true)} style={barBtn}>Print details</button>
      </div>
      <article className="ck-drill-sheet" style={{
        background: "#0c0c0c",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}>
        <header className="ck-head" style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px 8px", background: "#0c0c0c" }}>
          <div style={{
            width: 54, height: 54, borderRadius: "50%", background: YELLOW, color: "#111",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 28, flexShrink: 0,
          }}>{drill.number}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.01em", lineHeight: 1, textTransform: "uppercase" }}>{sheet.title}</div>
            <div className="ck-lime" style={{ color: YELLOW, fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", marginTop: 4 }}>{subtitle}</div>
            <div className="ck-ink" style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 6, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "#ddd" }}>
              <span>{sheet.ageBand}</span>
              <span style={{ opacity: 0.45 }}>|</span>
              <span>{sheet.difficulty}</span>
              <span style={{ opacity: 0.45 }}>|</span>
              <span>{durationChip}</span>
            </div>
          </div>
        </header>
        <div className="ck-drill-main" style={{ padding: "0 12px 8px" }}>
          <div>
            <div className="ck-drill-field" style={{ height: 280, borderRadius: 8, overflow: "hidden", border: `1px solid ${LINE}` }}>
              <FieldMark model={model} />
            </div>
            <div className="ck-drill-credit ck-ink" style={{ fontSize: 10, color: "#9a9a9a", marginTop: 6, lineHeight: 1.35 }}>{sheet.diagramCredit}</div>
          </div>
          <div>
            <Panel kicker="DRILL PURPOSE">
              <div className="ck-ink" style={{ fontSize: 13, lineHeight: 1.35 }}>{sheet.purpose}</div>
            </Panel>
            <Panel kicker="SETUP">
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 92px", gap: 8, alignItems: "center" }}>
                <BulletList items={sheet.setup} />
                <div style={{ height: 78, borderRadius: 6, overflow: "hidden", border: `1px solid ${LINE}` }}>
                  <FieldMark model={mini} mini />
                </div>
              </div>
            </Panel>
            <Panel kicker="COACHING POINTS">
              <BulletList items={sheet.coachingPoints} />
            </Panel>
          </div>
        </div>
        <footer className="ck-foot" style={{
          display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center",
          margin: "0 12px 8px", padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`, background: "#101010",
        }}>
          {[
            ["DURATION", durationChip],
            ["PLAYERS", sheet.playersLabel],
            ["DIFFICULTY", sheet.difficulty],
            ["FOCUS", sheet.focus],
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: 70 }}>
              <div className="ck-lime" style={{ color: LIME, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </footer>
        <div style={{ padding: "0 12px 8px" }}>
          <Panel kicker="PROGRESSIONS" style={{ marginBottom: 8 }}>
            <BulletList items={sheet.progressions} />
          </Panel>
          <LegendRow legend={sheet.legend} />
        </div>
        <div className={`ck-drill-details${showDetails ? " is-open" : ""}`} style={{ padding: "0 12px 10px" }}>
            <Panel kicker="BLOCK">
              <div className="ck-ink" style={{ fontSize: 12, fontWeight: 800 }}>{details.block} · {details.timeBlock}</div>
            </Panel>
            <Panel kicker="FEWER PLAYERS">
              <div className="ck-ink" style={{ fontSize: 12 }}>{details.fewerPlayers}</div>
            </Panel>
            <Panel kicker="HOW TO RUN">
              <ol className="ck-ink" style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.35 }}>
                {details.howToRun.map(step => <li key={step} style={{ marginBottom: 2 }}>{step}</li>)}
              </ol>
            </Panel>
            <Panel kicker="REGRESSIONS">
              <BulletList items={details.regressions} />
            </Panel>
            {details.equipment.length > 0 && (
              <Panel kicker="EQUIPMENT">
                <BulletList items={details.equipment} />
              </Panel>
            )}
            <Panel kicker="COMMON MISTAKES">
              {details.commonMistakes.map(row => (
                <div key={row.mistake} className="ck-ink" style={{ fontSize: 12, lineHeight: 1.35, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800 }}>{row.mistake}</div>
                  <div style={{ color: "#d7d7d7" }}>{row.fix}</div>
                </div>
              ))}
            </Panel>
        </div>
        <div className="ck-ink ck-drill-chrome" style={{
          padding: "8px 14px 12px", fontSize: 11, color: "#c8c8c8", borderTop: `1px solid ${LINE}`,
        }}>{coachingLine(drillTeamDefaults)}</div>
      </article>
    </div>
  );
}

const barBtn = {
  minHeight: 40,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "transparent",
  color: "#e8e4dc",
  fontWeight: 800,
  fontFamily: "inherit",
  cursor: "pointer",
};
