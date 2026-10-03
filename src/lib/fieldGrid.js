/**
 * One saveable field image per lineup, in chronological order.
 * A quarter with a 2nd-half lineup becomes two tiles. A single lineup stays one tile.
 * `half` is "start" or "after" only when that split exists. A full-mode H2 file is not a split.
 */
function halfName(n) {
  if (n === 1) return "1st half";
  if (n === 2) return "2nd half";
  if (n === 3) return "3rd half";
  return `${n}th half`;
}

export function fieldImageTiles(field) {
  const panels = field?.quarters || [];
  const tiles = [];
  panels.forEach(panel => {
    const label = panel.label || `Q${panel.quarter || tiles.length + 1}`;
    const halvesMatch = /^H(\d+)$/.exec(label);
    if (panel.after) {
      const { after, ...start } = panel;
      if (halvesMatch) {
        const name = halfName(Number(halvesMatch[1]));
        tiles.push({
          panel: start,
          caption: `${name} · start`,
          filename: `CoachKit_Field_${label}_Start.png`,
          half: "start",
        });
        tiles.push({
          panel: { ...after, quarter: panel.quarter, label: after.label || label },
          caption: `${name} · after subs`,
          filename: `CoachKit_Field_${label}_After.png`,
          half: "after",
        });
      } else {
        tiles.push({
          panel: start,
          caption: `${label} · 1st half`,
          filename: `CoachKit_Field_${label}_H1.png`,
          half: "start",
        });
        tiles.push({
          panel: { ...after, quarter: panel.quarter, label: after.label || label },
          caption: `${label} · 2nd half`,
          filename: `CoachKit_Field_${label}_H2.png`,
          half: "after",
        });
      }
    } else {
      tiles.push({
        panel,
        caption: label,
        filename: `CoachKit_Field_${label}.png`,
        half: null,
      });
    }
  });
  return tiles;
}

export function shareHelperText({ split = false, periodAbbrev = "Q" } = {}) {
  if (!split) return "Tap Save under any image to send it or add it to Photos.";
  if (periodAbbrev === "H") {
    return "Each half has a start lineup and an after-subs lineup. Tap Save under any image to send it or add it to Photos.";
  }
  return "Each quarter has a 1st-half and a 2nd-half lineup. Tap Save under any image to send it or add it to Photos.";
}
