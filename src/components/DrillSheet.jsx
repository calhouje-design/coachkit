import { useState } from "react";
import { buildDiagramModel, coachingLine, detailsSheet, letterSheet, TRIANGLE_CARD_LAYOUT } from "../lib/drillDiagram.js";
import { drillTeamDefaults } from "../data/coachkitDrillSeed.js";

const LIME = "#CCFF00";
const YELLOW = "#F5C518";
const INK = "#f7f7f7";
const PANEL = "#121212";
const PAGE = "#070707";
const LINE = "#2a2a2a";
const FIELD_VIEW = { w: 640, h: 460, pad: 28 };

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

function PlayerMark({ player, mini }) {
  const scale = mini ? 0.48 : 1.2;
  return (
    <g transform={`translate(${player.x} ${player.y}) scale(${scale})`}>
      <ellipse cx="0" cy="1" rx="20" ry="5.5" fill="rgba(0,0,0,0.35)" />
      <path d="M-9 -26 C-12 -8 -14 2 -16 4 C-8 6 -2 2 -4 -6 L-5 -26 Z" fill="#161616" />
      <path d="M5 -26 C8 -6 14 2 18 4 C10 7 3 2 5 -8 L4 -26 Z" fill="#161616" />
      <path d="M-8 -30 H-3 V-16 H-9 Z" fill="#2457c8" />
      <path d="M3 -30 H8 V-14 H2 Z" fill="#2457c8" />
      <path d="M-13 -44 H13 L11 -26 H-11 Z" fill="#101010" />
      <path d="M-15 -66 C-18 -46 -15 -42 -13 -40 H13 C15 -42 18 -46 15 -66 C8 -74 -8 -74 -15 -66 Z" fill="#2f6fe0" />
      <path d="M-8 -66 H8 V-58 H-8 Z" fill="#2457c8" />
      <path d="M-15 -60 C-28 -54 -28 -42 -18 -38 L-12 -48 Z" fill="#2f6fe0" />
      <path d="M15 -60 C28 -52 28 -40 18 -36 L12 -48 Z" fill="#2f6fe0" />
      <circle cx="-22" cy="-36" r="3.4" fill="#f3c7a4" />
      <circle cx="22" cy="-34" r="3.4" fill="#f3c7a4" />
      <path d="M-3.5 -72 H3.5 V-66 H-3.5 Z" fill="#f3c7a4" />
      <circle cx="0" cy="-80" r="10" fill="#f3c7a4" />
      <path d="M-9 -82 C-4 -96 10 -94 11 -78 C7 -88 0 -90 -9 -82 Z" fill="#24160f" />
      <circle cx="18" cy="-72" r="11" fill="#111" stroke="#fff" strokeWidth="1.7" />
      <text x="18" y="-68" textAnchor="middle" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontSize="13" fontWeight="800">{player.label}</text>
    </g>
  );
}

function ConeMark({ cone, mini }) {
  const scale = mini ? 0.55 : 1;
  return (
    <g transform={`translate(${cone.x} ${cone.y}) scale(${scale})`}>
      <ellipse cx="0" cy="4" rx="9" ry="3" fill="rgba(0,0,0,0.28)" />
      <polygon points="0,-20 -8,5 8,5" fill="#ff7a00" />
      <polygon points="0,-20 -2.4,5 2.6,5" fill="#ffc14a" />
      <rect x="-9" y="4" width="18" height="3.5" rx="1" fill="#ff9a1f" />
    </g>
  );
}

function FieldMark({ model, mini, passesOnly }) {
  const { view, players, cones, strokes, distances, balls = [] } = model;
  const drawn = passesOnly ? strokes.filter(stroke => stroke.type === "pass") : strokes;
  const gid = mini ? "mini" : "main";
  return (
    <svg viewBox={`0 0 ${view.w} ${view.h}`} width="100%" height="100%" role="img" aria-label="Drill diagram">
      <defs>
        <pattern id={`ck-grass-${gid}`} width="28" height={view.h} patternUnits="userSpaceOnUse">
          <rect width="14" height={view.h} fill="#3cbf45" />
          <rect x="14" width="14" height={view.h} fill="#2fa338" />
        </pattern>
        <marker id={`ck-arrow-${gid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth={mini ? 6 : 8} markerHeight={mini ? 6 : 8} orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#fff" />
        </marker>
        <filter id={`ck-shade-${gid}`}>
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.7" />
        </filter>
      </defs>
      <rect width={view.w} height={view.h} fill={`url(#ck-grass-${gid})`} />
      {drawn.map(stroke => (
        <path
          key={stroke.id}
          d={stroke.d}
          fill="none"
          stroke="#fff"
          strokeWidth={mini ? 2.2 : stroke.type === "pass" ? 3.4 : stroke.style.width}
          strokeDasharray={stroke.style.dash || undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={stroke.style.arrow ? `url(#ck-arrow-${gid})` : undefined}
        />
      ))}
      {!mini && distances.map((item, index) => (
        <text
          key={`${item.label}-${index}`}
          x={item.x}
          y={item.y}
          textAnchor="middle"
          fill="#fff"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="22"
          fontWeight="800"
          filter={`url(#ck-shade-${gid})`}
        >{item.label}</text>
      ))}
      {cones.map((cone, index) => <ConeMark key={`cone-${index}`} cone={cone} mini={mini} />)}
      {players.map(player => <PlayerMark key={player.id} player={player} mini={mini} />)}
      {balls.map(ball => (
        <g key={ball.id} transform={`translate(${ball.x} ${ball.y})`}>
          <circle r={mini ? 4 : 8} fill="#fff" stroke="#111" strokeWidth="1.3" />
          <path d={`M ${mini ? -2 : -4} 0 H ${mini ? 2 : 4} M 0 ${mini ? -2 : -4} V ${mini ? 2 : 4}`} stroke="#111" strokeWidth="0.8" />
        </g>
      ))}
    </svg>
  );
}

function Icon({ name }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true };
  if (name === "target") {
    return <svg {...common}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" /><path d="M8 1.5 V4 M8 12 v2.5 M1.5 8 H4 M12 8 h2.5" /></svg>;
  }
  if (name === "cone") {
    return <svg {...common} stroke="none"><polygon points="8,1.5 14,14 2,14" fill="#ff7a00" /></svg>;
  }
  if (name === "clipboard") {
    return <svg {...common}><rect x="3.5" y="3" width="9" height="11" rx="1.2" /><path d="M6 3.2 h4 v2 H6 z" /><path d="M6 8 h4 M6 11 h3" /></svg>;
  }
  if (name === "chart") {
    return <svg {...common}><path d="M2.5 12.5 h11" /><path d="M4 11 L7 7.5 L9.5 9.2 L13 4.5" /><path d="M10.5 4.5 H13 V7" /></svg>;
  }
  if (name === "people") {
    return <svg {...common}><circle cx="6" cy="5" r="2" /><path d="M2.5 13 c.4-2.4 1.8-3.5 3.5-3.5 s3.1 1.1 3.5 3.5" /><circle cx="11" cy="5.5" r="1.5" /><path d="M10 9.6 c1.4.2 2.4 1 2.8 2.4" /></svg>;
  }
  if (name === "bars") {
    return <svg {...common}><path d="M3 13 V8 M8 13 V4 M13 13 V6" strokeLinecap="round" /></svg>;
  }
  if (name === "clock") {
    return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 4.8 V8 l2.4 1.6" /></svg>;
  }
  return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M3.5 8 h9 M8 3.5 v9 M5 5.2 l6 5.6 M11 5.2 l-6 5.6" /></svg>;
}

function Panel({ kicker, icon, children, region }) {
  return (
    <section className="ck-panel" data-region={region} style={{
      background: PANEL,
      border: `1px solid ${LINE}`,
      borderRadius: 10,
      padding: "8px 10px 6px",
      marginBottom: 8,
    }}>
      <div className="ck-lime" style={{ display: "flex", alignItems: "center", gap: 6, color: LIME, fontWeight: 800, fontSize: 13, letterSpacing: "0.04em", marginBottom: 4 }}>
        <Icon name={icon} />
        {kicker}
      </div>
      {children}
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 16, color: INK, fontSize: 12, lineHeight: 1.32 }}>
      {(items || []).map(item => <li key={item} style={{ marginBottom: 2 }}>{item}</li>)}
    </ul>
  );
}

function LegendRow({ legend }) {
  const icon = {
    dashed_arrow: <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true"><line x1="1" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" /><path d="M22 2 L32 6 L22 10 Z" fill="currentColor" /></svg>,
    solid_arrow: <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true"><line x1="1" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="2" /><path d="M22 2 L32 6 L22 10 Z" fill="currentColor" /></svg>,
    squiggle_arrow: <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true"><path d="M1 8 Q6 1 11 8 T21 8 T30 6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>,
    ball: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="#fff" stroke="#111" /></svg>,
    cone: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><polygon points="7,1 13,13 1,13" fill="#ff7a00" /></svg>,
    blue_player: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="#2f6fe0" /></svg>,
  };
  return (
    <div className="ck-legend" data-region="legend" style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", color: INK, fontSize: 11, fontWeight: 800, letterSpacing: "0.05em" }}>
      {(legend || []).map(item => (
        <span key={item.symbol} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#fff", display: "inline-flex" }}>{icon[item.symbol] || null}</span>
          {item.meaning}
        </span>
      ))}
    </div>
  );
}

function rightPanel(key, sheet, mini) {
  if (key === "purpose") {
    return (
      <Panel key={key} region="purpose" kicker="DRILL PURPOSE" icon="target">
        <div className="ck-ink" style={{ fontSize: 13, lineHeight: 1.35 }}>{sheet.purpose}</div>
      </Panel>
    );
  }
  if (key === "setup") {
    return (
      <Panel key={key} region="setup" kicker="SETUP" icon="cone">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 108px", gap: 8, alignItems: "center" }}>
          <BulletList items={sheet.setup} />
          <div style={{ height: 86, borderRadius: 6, overflow: "hidden" }}>
            <FieldMark model={mini} mini passesOnly />
          </div>
        </div>
      </Panel>
    );
  }
  if (key === "coachingPoints") {
    return (
      <Panel key={key} region="coachingPoints" kicker="COACHING POINTS" icon="clipboard">
        <BulletList items={sheet.coachingPoints} />
      </Panel>
    );
  }
  return (
    <Panel key={key} region="progressions" kicker="PROGRESSIONS" icon="chart">
      <BulletList items={sheet.progressions} />
    </Panel>
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
  const model = buildDiagramModel(drill.diagram, { view: FIELD_VIEW });
  const mini = buildDiagramModel(drill.diagram, { mini: true, view: { w: 180, h: 140 } });
  const subtitle = `${String(sheet.category).toUpperCase()}${/drill/i.test(sheet.category) ? "" : " DRILL"}`;
  const durationChip = sheet.durationMin ? `${sheet.durationMin} MIN` : "";
  const summary = [
    ["clock", "DURATION", durationChip],
    ["people", "PLAYERS", sheet.playersLabel],
    ["bars", "DIFFICULTY", sheet.difficulty],
    ["ball", "FOCUS", sheet.focus],
  ];

  return (
    <div>
      <style>{`
        .ck-drill-layout { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(250px, 0.95fr); gap: 12px; align-items: stretch; }
        .ck-drill-left { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
        .ck-drill-field { flex: 1; min-height: 320px; border-radius: 8px; overflow: hidden; }
        .ck-drill-rail { min-width: 0; }
        .ck-drill-legend { margin-top: 4px; padding: 8px 4px 2px; border-top: 1px solid ${LINE}; }
        @media (max-width: 800px) {
          .ck-drill-layout { grid-template-columns: 1fr; }
          .ck-drill-field { min-height: 240px; }
        }
        @media print {
          @page { size: letter landscape; margin: 0.28in; }
          body:has(.ck-drill-sheet) #ck-app-header,
          body.ck-printing-drill #ck-app-header,
          body:has(.ck-drill-sheet) .ck-no-print,
          body.ck-printing-drill .ck-no-print { display: none !important; }
          body:has(.ck-drill-sheet) .ck-app-body,
          body.ck-printing-drill .ck-app-body { max-width: none !important; padding: 0 !important; opacity: 1 !important; }
          body:has(.ck-drill-sheet) #root > div,
          body.ck-printing-drill #root > div { min-height: 0 !important; background: #fff !important; }
          .ck-drill-sheet { width: 100%; }
          .ck-drill-layout { grid-template-columns: 1.5fr 1fr !important; gap: 8px !important; }
          .ck-drill-field { min-height: 0 !important; height: 430px !important; }
          .ck-drill-sheet { font-size: 11px; }
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
      <article className="ck-drill-sheet" data-orientation={TRIANGLE_CARD_LAYOUT.orientation} style={{
        background: PAGE,
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: "12px 14px 10px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}>
        <div className="ck-drill-layout">
          <div className="ck-drill-left">
            <header className="ck-head" data-region="header" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <div style={{
                width: 58, height: 58, borderRadius: "50%", background: YELLOW, color: "#111",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 30, flexShrink: 0,
              }}>{drill.number}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.01em", lineHeight: 0.95, textTransform: "uppercase" }}>{sheet.title}</div>
                <div style={{ color: YELLOW, fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", marginTop: 3 }}>{subtitle}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginTop: 6, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", color: "#eee", alignItems: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="people" />{sheet.ageBand}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="bars" />{sheet.difficulty}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="clock" />{durationChip}</span>
                </div>
              </div>
            </header>
            <div className="ck-drill-field" data-region="field">
              <FieldMark model={model} passesOnly />
            </div>
            <footer className="ck-foot" data-region="summary" style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 8,
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${LINE}`,
              background: "#101010",
            }}>
              {summary.map(([icon, label, value]) => (
                <div key={label} style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                  <span style={{ color: "#fff", display: "inline-flex" }}><Icon name={icon} /></span>
                  <span style={{ minWidth: 0 }}>
                    <div className="ck-lime" style={{ color: LIME, fontSize: 9, fontWeight: 800, letterSpacing: "0.05em" }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
                  </span>
                </div>
              ))}
            </footer>
          </div>
          <div className="ck-drill-rail" data-region="right-column">
            {TRIANGLE_CARD_LAYOUT.rightColumn.map(key => rightPanel(key, sheet, mini))}
          </div>
        </div>
        <div className="ck-drill-legend">
          <LegendRow legend={sheet.legend} />
        </div>
        <div className={`ck-drill-details${showDetails ? " is-open" : ""}`} style={{ paddingTop: 8 }}>
          <Panel kicker="BLOCK" icon="clipboard">
            <div className="ck-ink" style={{ fontSize: 12, fontWeight: 800 }}>{details.block} · {details.timeBlock}</div>
          </Panel>
          <Panel kicker="FEWER PLAYERS" icon="people">
            <div className="ck-ink" style={{ fontSize: 12 }}>{details.fewerPlayers}</div>
          </Panel>
          <Panel kicker="HOW TO RUN" icon="clipboard">
            <ol className="ck-ink" style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.35 }}>
              {details.howToRun.map(step => <li key={step} style={{ marginBottom: 2 }}>{step}</li>)}
            </ol>
          </Panel>
          <Panel kicker="REGRESSIONS" icon="chart">
            <BulletList items={details.regressions} />
          </Panel>
          {details.equipment.length > 0 && (
            <Panel kicker="EQUIPMENT" icon="cone">
              <BulletList items={details.equipment} />
            </Panel>
          )}
          <Panel kicker="COMMON MISTAKES" icon="target">
            {details.commonMistakes.map(row => (
              <div key={row.mistake} className="ck-ink" style={{ fontSize: 12, lineHeight: 1.35, marginBottom: 6 }}>
                <div style={{ fontWeight: 800 }}>{row.mistake}</div>
                <div>{row.fix}</div>
              </div>
            ))}
          </Panel>
          <div className="ck-ink" style={{ fontSize: 11, color: "#bdbdbd", lineHeight: 1.4 }}>
            {sheet.diagramCredit}
            <div>{coachingLine(drillTeamDefaults)}</div>
          </div>
        </div>
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
