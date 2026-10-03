/**
 * One saveable field image per lineup, in chronological order.
 * A quarter with a 2nd-half lineup becomes two tiles. A single lineup stays one tile.
 */
export function fieldImageTiles(field) {
  const panels = field?.quarters || [];
  const tiles = [];
  panels.forEach(panel => {
    const label = panel.label || `Q${panel.quarter || tiles.length + 1}`;
    if (panel.after) {
      const { after, ...start } = panel;
      tiles.push({
        panel: start,
        caption: `${label} · 1st half`,
        filename: `CoachKit_Field_${label}_H1.png`,
      });
      tiles.push({
        panel: { ...after, quarter: panel.quarter, label: after.label || label },
        caption: `${label} · 2nd half`,
        filename: `CoachKit_Field_${label}_H2.png`,
      });
    } else {
      tiles.push({
        panel,
        caption: label,
        filename: `CoachKit_Field_${label}.png`,
      });
    }
  });
  return tiles;
}
