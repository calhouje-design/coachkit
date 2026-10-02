import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReturnDialog } from "./components/ReturnDialog.jsx";

const player = {
  id: "p7",
  name: "Remi Stone",
  number: "7",
  out: true,
  injured: false,
  injuredInQuarter: 1,
};

function Harness() {
  const [quarter, setQuarter] = useState(2);
  const [log, setLog] = useState([]);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: "100vh", background: "#0a0d0f", color: "#e8e4dc", fontFamily: "Georgia, serif" }}>
      <div data-testid="viewing" style={{ padding: 16 }}>Viewing Q{quarter}</div>
      <button type="button" data-testid="reopen" onClick={() => { setOpen(true); }}>Open</button>
      <pre data-testid="log">{log.join("\n")}</pre>
      <ReturnDialog
        open={open}
        player={player}
        selectedQuarter={quarter}
        totalQuarters={4}
        subMode
        hasSheet
        periodAbbrev="Q"
        finished={[1]}
        outSince={1}
        liveQuarters={{ 3: false, 2: false, 4: false }}
        onCancel={() => {
          setLog(prev => [...prev, "cancel"]);
          setOpen(false);
        }}
        onConfirm={(choice) => {
          setLog(prev => [...prev, JSON.stringify(choice)]);
          setOpen(false);
        }}
        onSwitchQuarter={(next) => setQuarter(next)}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
