/**
 * One switch for how much colour categories get.
 *  "neutral": grey icon tiles, single-accent bars, neutral KPI chips
 *  "soft":    category colours, but muted (pale tiles, desaturated bars), neutral KPI chips
 *  "tinted":  full category colours, tinted KPI chips (the original colourful look)
 * Change this one constant and rebuild to switch.
 */
export const CATEGORY_COLORS = "soft" as "neutral" | "soft" | "tinted";

const mode = CATEGORY_COLORS;
const mix = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, var(--color-muted))`;

/** Icon colour for a category tile / dot. */
export const catTone = (c: string) => (mode === "tinted" ? c : mode === "soft" ? mix(c, 60) : "var(--color-muted)");
/** Tile background strength (% of the icon colour over transparent). */
export const catTileAlpha = mode === "tinted" ? 16 : mode === "soft" ? 12 : 16;
/** Colour for a category's progress/amount bar. */
export const catBar = (c: string) => (mode === "tinted" ? c : mode === "soft" ? mix(c, 65) : "var(--color-accent)");
/** Colour for a KPI card's icon chip. */
export const chipTone = (c: string) => (mode === "tinted" ? c : "var(--color-muted)");
