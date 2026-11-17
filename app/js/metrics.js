// Dimensions of the paper in canvas units (Model 33: 72 chars per line, 10 chars/inch, 6 lines/inch).
// The canvas is drawn at this size and scaled to the window with CSS (see layout.js).
export const COLS = 72, FONT_PX = 21;
export const FONT = `bold ${FONT_PX}px "Courier New", "Nimbus Mono PS", "Liberation Mono", monospace`;

const measure = document.createElement("canvas").getContext("2d");
measure.font = FONT;
export const CW = Math.round(measure.measureText("M").width * 1.04);   // character width
export const LH = Math.round(CW * 1.66);                               // line height
export const MARGIN = 70;
export const W = MARGIN * 2 + COLS * CW;                               // paper width

// x of the print position for a column (the head stays on the last column at the end of a line)
export const colX = (col) => MARGIN + Math.min(col, COLS - 1) * CW;
