import "../../styles/base.css";
import "./probe.css";

import { loadCore, type Control, type Core, type DecodedWord, type Format } from "../../shared/core";
import { navLinks, showLoadError } from "../../shared/frame";

// From tests/test_decode.cpp, plus lw $t0, 4($s0) and sw $t1, 16($s2) from Lecture 19.
const EXAMPLES = [
  0x2237fff1, 0x1520fffa, 0x012a4020, 0x00094100, 0x3108ffff, 0x2108ffff, 0x08000002, 0x8e080004, 0xae490010,
];

type FieldKey = "opcode" | "rs" | "rt" | "rd" | "shamt" | "funct" | "imm" | "target";

interface Span {
  key: FieldKey;
  hi: number;
  lo: number;
}

const R_LAYOUT: Span[] = [
  { key: "opcode", hi: 31, lo: 26 },
  { key: "rs", hi: 25, lo: 21 },
  { key: "rt", hi: 20, lo: 16 },
  { key: "rd", hi: 15, lo: 11 },
  { key: "shamt", hi: 10, lo: 6 },
  { key: "funct", hi: 5, lo: 0 },
];

const LAYOUT: Record<Format, Span[]> = {
  R: R_LAYOUT,
  I: [R_LAYOUT[0]!, R_LAYOUT[1]!, R_LAYOUT[2]!, { key: "imm", hi: 15, lo: 0 }],
  J: [R_LAYOUT[0]!, { key: "target", hi: 25, lo: 0 }],
  Unknown: R_LAYOUT,
};

const FORMAT_NAME: Record<Format, string> = { R: "R-type", I: "I-type", J: "J-type", Unknown: "unknown" };

const FIELD_LABEL: Record<FieldKey, string> = {
  opcode: "opcode",
  rs: "rs",
  rt: "rt",
  rd: "rd",
  shamt: "shamt",
  funct: "funct",
  imm: "immediate",
  target: "target",
};

// Lecture 18: andi/ori/lui zero-extend the immediate, the rest sign-extend.
const ZERO_EXT = new Set(["andi", "ori", "lui"]);
const SHIFTS = new Set(["sll", "srl", "sra"]);

const hex = (v: number, digits: number) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(digits, "0");
const bin = (v: number, bits: number) => (v >>> 0).toString(2).padStart(bits, "0").slice(-bits);
const nibbles = (s: string) => s.replace(/\B(?=(\d{4})+$)/g, " ");
const width = (sp: Span) => sp.hi - sp.lo + 1;

const SVG_NS = "http://www.w3.org/2000/svg";
function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  node.append(...children);
  return node;
}

type Parsed = { ok: true; word: number } | { ok: false; error: string };

function parseWord(text: string): Parsed {
  const t = text.trim().replace(/[\s_]/g, "").toLowerCase();
  if (t === "") return { ok: false, error: "Enter a 32-bit word." };
  if (t.startsWith("0b")) {
    const body = t.slice(2);
    if (!/^[01]{1,32}$/.test(body)) return { ok: false, error: "Binary: 1 to 32 digits." };
    return { ok: true, word: parseInt(body, 2) >>> 0 };
  }
  const body = t.startsWith("0x") ? t.slice(2) : t;
  if (!/^[0-9a-f]{1,8}$/.test(body)) return { ok: false, error: "Hex: 1 to 8 digits." };
  return { ok: true, word: parseInt(body, 16) >>> 0 };
}

function fieldBits(d: DecodedWord, span: Span): number {
  return (d.raw >>> span.lo) & ((1 << width(span)) - 1);
}

function decimalValue(d: DecodedWord, key: FieldKey): string {
  switch (key) {
    case "imm":
      return String(ZERO_EXT.has(d.mnemonic) ? d.imm_zext : d.imm_sext);
    case "target":
      return String(d.target);
    default:
      return String(d[key]);
  }
}

function meaning(core: Core, d: DecodedWord, key: FieldKey): string {
  switch (key) {
    case "opcode":
      if (d.opcode === 0) return "R-type";
      return d.format === "Unknown" ? "not supported" : d.mnemonic;
    case "rs":
    case "rt":
    case "rd":
      return core.registerName(d[key]);
    case "shamt":
      return SHIFTS.has(d.mnemonic) ? "shift amount" : "unused";
    case "funct":
      return d.format === "R" ? d.mnemonic : "not supported";
    case "imm":
      return ZERO_EXT.has(d.mnemonic) ? "zero-extended" : "sign-extended";
    case "target":
      return `jumps to ${hex((d.target << 2) >>> 0, 7)}`;
  }
}

function assemblyTokens(core: Core, d: DecodedWord): { text: string; field?: FieldKey }[] {
  // If two fields name the same register, the first listed wins.
  const regFields: ("rs" | "rt" | "rd")[] = d.format === "R" ? ["rd", "rs", "rt"] : d.format === "I" ? ["rt", "rs"] : [];
  const regField = new Map<string, FieldKey>();
  for (const key of regFields) {
    const name = core.registerName(d[key]);
    if (!regField.has(name)) regField.set(name, key);
  }
  const numberField: FieldKey = d.format === "J" ? "target" : SHIFTS.has(d.mnemonic) ? "shamt" : "imm";

  const [mnemonic = "", ...rest] = d.disassembly.split(" ");
  const out: { text: string; field?: FieldKey }[] = [
    { text: mnemonic, field: d.format === "R" ? "funct" : "opcode" },
    { text: " " },
  ];
  for (const tok of rest.join(" ").split(/(\$\w+|-?0x[0-9a-f]+|-?\d+)/i)) {
    if (!tok) continue;
    const field = tok.startsWith("$") ? regField.get(tok) : /\d/.test(tok) ? numberField : undefined;
    out.push({ text: tok, field });
  }
  return out;
}

const W = 1560;
const H = 720;
const IR_X = 80;
const IR_W = 1040;
const IR_CX = IR_X + IR_W / 2;
const BIT_W = IR_W / 32;
const IR_Y = 96;
const IR_H = 56;
const FIELD_Y = 280;
const FIELD_H = 84;
const DIS_Y = 470;
const DIS_H = 92;
const ASM_Y = 634;
const ASM_H = 64;
const CTRL_X = 1200;
const CTRL_W = 320;
const CTRL_Y = IR_Y;
const CTRL_H = 72;

// Names and meanings from src/control.hpp (Lecture 19, slides 24-25).
const SIGNALS: { name: string; key: Exclude<keyof Control, "alu_op">; tip: string }[] = [
  { name: "RegDst", key: "reg_dst", tip: "1: write rd (R-type). 0: write rt." },
  { name: "ALUSrc", key: "alu_src", tip: "1: ALU input B is the immediate. 0: it is rt." },
  { name: "MemtoReg", key: "mem_to_reg", tip: "1: write-back data comes from memory. 0: from the ALU." },
  { name: "RegWrite", key: "reg_write", tip: "Write the destination register." },
  { name: "MemRead", key: "mem_read", tip: "Read data memory (lw)." },
  { name: "MemWrite", key: "mem_write", tip: "Write data memory (sw)." },
  { name: "Branch", key: "branch", tip: "beq / bne." },
  { name: "Jump", key: "jump", tip: "j, jal, jr." },
  { name: "JumpReg", key: "jump_reg", tip: "jr: the target comes from rs." },
  { name: "Link", key: "link", tip: "jal: save PC+4 in $ra." },
];

function arrow(x: number, y0: number, y1: number, className: string): SVGGElement {
  return s(
    "g",
    { class: className },
    s("line", { x1: x, y1: y0, x2: x, y2: y1 - 9, class: "wire" }),
    s("path", { d: `M ${x - 6} ${y1 - 11} L ${x + 6} ${y1 - 11} L ${x} ${y1} Z`, class: "head" }),
  );
}

function hArrow(x0: number, x1: number, y: number, className: string): SVGGElement {
  return s(
    "g",
    { class: className },
    s("line", { x1: x0, y1: y, x2: x1 - 9, y2: y, class: "wire" }),
    s("path", { d: `M ${x1 - 11} ${y - 6} L ${x1 - 11} ${y + 6} L ${x1} ${y} Z`, class: "head" }),
  );
}

// Slash-and-number bus width mark from the lecture figures.
function busWidth(x: number, y: number, bits: number): SVGGElement {
  return s(
    "g",
    { class: "bus-width" },
    s("line", { x1: x - 7, y1: y + 7, x2: x + 7, y2: y - 7 }),
    s("text", { x: x + 10, y: y - 6 }, String(bits)),
  );
}

function keyActivate(node: SVGElement, action: () => void): void {
  node.addEventListener("click", action);
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  });
}

function drawInstructionRegister(d: DecodedWord, spans: Span[], onFlip: (bit: number) => void): SVGGElement {
  const g = s("g", { class: "ir" });
  g.append(
    // Starts right of the opcode bits so the wire to Control can leave from the top.
    s("text", { x: IR_X + 6 * BIT_W + 10, y: IR_Y - 14, class: "block-label" }, "Instruction Register"),
    s("text", { x: IR_X + 6 * BIT_W + 190, y: IR_Y - 14, class: "ir-hex" }, hex(d.raw, 8)),
    s("rect", { x: IR_X, y: IR_Y, width: IR_W, height: IR_H, class: "block register" }),
  );

  for (let i = 31; i >= 0; i--) {
    const x = IR_X + (31 - i) * BIT_W;
    const b = (d.raw >>> i) & 1;
    const cell = s("g", { class: "bit", tabindex: 0, role: "button", "data-bit": i });
    cell.setAttribute("aria-label", `Bit ${i} is ${b}. Flip it.`);
    cell.append(
      s("rect", { x, y: IR_Y, width: BIT_W, height: IR_H, class: "bit-hit" }),
      s("text", { x: x + BIT_W / 2, y: IR_Y + IR_H / 2, class: "bit-digit" }, String(b)),
    );
    keyActivate(cell, () => onFlip(i));
    g.append(cell);
  }

  for (const span of spans.slice(1)) {
    const x = IR_X + (31 - span.hi) * BIT_W;
    g.append(s("line", { x1: x, y1: IR_Y, x2: x, y2: IR_Y + IR_H, class: "divider" }));
  }
  for (const span of spans) {
    const x0 = IR_X + (31 - span.hi) * BIT_W;
    const x1 = IR_X + (32 - span.lo) * BIT_W;
    g.append(
      s("text", { x: x0 + 3, y: IR_Y + IR_H + 14, class: "bit-num", "text-anchor": "start" }, String(span.hi)),
      s("text", { x: x1 - 3, y: IR_Y + IR_H + 14, class: "bit-num", "text-anchor": "end" }, String(span.lo)),
    );
  }
  return g;
}

function drawField(core: Core, d: DecodedWord, span: Span): SVGGElement {
  const bits = width(span);
  const gx = IR_X + (31 - span.hi) * BIT_W + 8;
  const gw = bits * BIT_W - 16;
  const cx = gx + gw / 2;
  const binary = bin(fieldBits(d, span), bits);

  const g = s("g", { class: `field f-${span.key}${d.format === "Unknown" ? " off" : ""}` });
  g.append(
    arrow(cx, IR_Y + IR_H + 22, FIELD_Y, "field-wire"),
    busWidth(cx, IR_Y + 126, bits),
    s("text", { x: gx, y: FIELD_Y - 10, class: "field-label" }, FIELD_LABEL[span.key]),
    s("rect", { x: gx, y: FIELD_Y, width: gw, height: FIELD_H, class: "block field-box" }),
    s("text", { x: cx, y: FIELD_Y + 24, class: "field-bin" }, bits >= 16 ? nibbles(binary) : binary),
    s("line", { x1: gx + 10, y1: FIELD_Y + 42, x2: gx + gw - 10, y2: FIELD_Y + 42, class: "field-rule" }),
    s("text", { x: cx, y: FIELD_Y + 63, class: "field-dec" }, decimalValue(d, span.key)),
    arrow(cx, FIELD_Y + FIELD_H, DIS_Y, "field-wire"),
    s("text", { x: cx + 10, y: FIELD_Y + FIELD_H + 26, class: "field-meaning" }, meaning(core, d, span.key)),
  );
  return g;
}

function drawDisassembler(core: Core, d: DecodedWord): SVGGElement {
  const known = d.format !== "Unknown";
  const g = s("g", { class: "disasm" });
  g.append(
    s("rect", { x: IR_X, y: DIS_Y, width: IR_W, height: DIS_H, class: "block unit" }),
    s("text", { x: IR_X + 24, y: DIS_Y + DIS_H / 2, class: "unit-title" }, "Disassembler"),
    s(
      "text",
      { x: IR_X + IR_W - 24, y: DIS_Y + DIS_H / 2, class: "unit-info", "text-anchor": "end" },
      `format ${FORMAT_NAME[d.format]}   op ${d.op}`,
    ),
    arrow(IR_CX, DIS_Y + DIS_H, ASM_Y, "out-wire"),
    s("text", { x: IR_CX - 330, y: ASM_Y - 12, class: "block-label" }, "Assembly"),
    s("rect", { x: IR_CX - 330, y: ASM_Y, width: 660, height: ASM_H, class: `block output${known ? "" : " bad"}` }),
  );

  const line = s("text", { x: IR_CX, y: ASM_Y + ASM_H / 2, class: "asm" });
  if (known) {
    for (const t of assemblyTokens(core, d)) {
      line.append(t.field ? s("tspan", { class: `tok f-${t.field}` }, t.text) : t.text);
    }
  } else {
    line.append("not a supported instruction");
  }
  g.append(line);
  return g;
}

// opcode (and funct for R-type) leave the top of the instruction register and drop into Control.
function drawControl(d: DecodedWord, c: Control): SVGGElement {
  const g = s("g", { class: "control" });
  const opX = IR_X + 3 * BIT_W;
  const opIn = CTRL_X + CTRL_W * 0.65;
  g.append(
    s("path", { d: `M ${opX} ${IR_Y} V 28 H ${opIn} V ${CTRL_Y - 9}`, class: "wire f-opcode ctrl-in" }),
    s("path", { d: `M ${opIn - 6} ${CTRL_Y - 11} L ${opIn + 6} ${CTRL_Y - 11} L ${opIn} ${CTRL_Y} Z`, class: "head f-opcode ctrl-in" }),
    busWidth(opX, 64, 6),
    s("text", { x: opX + 14, y: 18, class: "ctrl-in-label f-opcode" }, "opcode [31-26]"),
  );
  if (d.format === "R") {
    const fnX = IR_X + 29 * BIT_W;
    const fnIn = CTRL_X + CTRL_W * 0.35;
    g.append(
      s("path", { d: `M ${fnX} ${IR_Y} V 52 H ${fnIn} V ${CTRL_Y - 9}`, class: "wire f-funct ctrl-in" }),
      s("path", { d: `M ${fnIn - 6} ${CTRL_Y - 11} L ${fnIn + 6} ${CTRL_Y - 11} L ${fnIn} ${CTRL_Y} Z`, class: "head f-funct ctrl-in" }),
      busWidth(fnX, 76, 6),
      s("text", { x: fnX + 14, y: 42, class: "ctrl-in-label f-funct" }, "funct [5-0]"),
    );
  }

  g.append(
    s("rect", { x: CTRL_X, y: CTRL_Y, width: CTRL_W, height: CTRL_H, rx: 14, class: "block ctrl-block" }),
    s("text", { x: CTRL_X + CTRL_W / 2, y: CTRL_Y + CTRL_H / 2, class: "ctrl-title" }, "Control Unit"),
  );

  const busX = CTRL_X + 28;
  const rowY = (i: number) => CTRL_Y + CTRL_H + 40 + i * 40;
  const rows = [...SIGNALS.map((sig) => ({ name: sig.name, tip: sig.tip, on: c[sig.key], value: c[sig.key] ? "1" : "0" })),
    { name: "ALUOp", tip: "Operation the ALU performs.", on: d.format !== "Unknown", value: c.alu_op }];

  g.append(s("line", { x1: busX, y1: CTRL_Y + CTRL_H, x2: busX, y2: rowY(rows.length - 1), class: "ctrl-bus" }));
  rows.forEach((row, i) => {
    const y = rowY(i);
    const boxW = 72;
    const boxX = CTRL_X + CTRL_W - boxW;
    const sig = s(
      "g",
      { class: `signal${row.on ? " on" : ""}` },
      s("title", {}, `${row.name}: ${row.tip}`),
      hArrow(busX, busX + 64, y, "signal-wire"),
      s("text", { x: busX + 76, y, class: "signal-name" }, row.name),
      s("rect", { x: boxX, y: y - 15, width: boxW, height: 30, class: "signal-box" }),
      s("text", { x: boxX + boxW / 2, y, class: "signal-value" }, row.value),
    );
    g.append(sig);
  });
  return g;
}

function draw(core: Core, d: DecodedWord, onFlip: (bit: number) => void): SVGSVGElement {
  const spans = LAYOUT[d.format];
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "group" });
  svg.setAttribute("aria-label", `Decoder: ${d.format === "Unknown" ? "unknown instruction" : d.disassembly}`);
  svg.append(
    drawInstructionRegister(d, spans, onFlip),
    ...spans.map((span) => drawField(core, d, span)),
    drawDisassembler(core, d),
    drawControl(d, core.control(d.raw)),
  );
  return svg;
}

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const input = document.getElementById("word") as HTMLInputElement;
  const error = document.getElementById("word-error")!;
  const select = document.getElementById("examples") as HTMLSelectElement;

  const nav = navLinks("probe");
  if (nav) document.getElementById("toolbar")!.prepend(nav);

  let core: Core;
  try {
    core = await loadCore();
  } catch (err) {
    showLoadError(stage, err);
    return;
  }

  select.append(new Option("custom", ""));
  for (const w of EXAMPLES) select.append(new Option(core.decode(w).disassembly, String(w)));

  const fromHash = parseWord(decodeURIComponent(location.hash.slice(1)));
  let word = location.hash.length > 1 && fromHash.ok ? fromHash.word : EXAMPLES[0]!;

  function flip(bit: number): void {
    show(word ^ (1 << bit), true);
    stage.querySelector<SVGGElement>(`[data-bit="${bit}"]`)?.focus();
  }

  function show(next: number, updateInput: boolean): void {
    word = next >>> 0;
    if (updateInput) input.value = hex(word, 8);
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    select.value = EXAMPLES.includes(word) ? String(word) : "";
    stage.replaceChildren(draw(core, core.decode(word), flip));
    history.replaceState(null, "", `#${hex(word, 8)}`);
  }

  input.addEventListener("input", () => {
    const p = parseWord(input.value);
    if (p.ok) return show(p.word, false);
    error.textContent = p.error;
    input.setAttribute("aria-invalid", "true");
  });
  input.addEventListener("blur", () => {
    if (parseWord(input.value).ok) input.value = hex(word, 8);
  });
  select.addEventListener("change", () => {
    if (select.value) show(Number(select.value), true);
  });

  show(word, true);
}

void main();
