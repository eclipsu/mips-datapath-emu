// Decoder page: the browser version of `make probe WORD=0x...`, drawn as hardware.
// Every value comes from mips::decode() / mips::disassemble() in C++ (via WebAssembly).

import "../../styles/base.css";
import "./probe.css";

import { loadCore, type Core, type DecodedWord, type Format } from "../../shared/core";
import { navLinks, showLoadError } from "../../shared/frame";

// Words from tests/test_decode.cpp, with the lecture each comes from.
const EXAMPLES: { word: number; source: string }[] = [
  { word: 0x2237fff1, source: "Lecture 21, Ex 2.9" },
  { word: 0x1520fffa, source: "Lecture 19, Q6" },
  { word: 0x012a4020, source: "Lecture 18, slide 8" },
  { word: 0x00094100, source: "shift by shamt" },
  { word: 0x3108ffff, source: "Lecture 18, zero-extend" },
  { word: 0x2108ffff, source: "Lecture 18, sign-extend" },
  { word: 0x08000002, source: "Lecture 19, Q5" },
];

// ---------- Field layout (Lecture 18) ----------

type FieldKey = "opcode" | "rs" | "rt" | "rd" | "shamt" | "funct" | "imm" | "target";
type Base = "bin" | "hex" | "dec";

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
  Unknown: R_LAYOUT, // no layout of its own: show the R split, greyed out
};

// andi, ori and lui use the zero-extended immediate; the other I-types sign-extend (Lecture 18).
const ZERO_EXT = new Set(["andi", "ori", "lui"]);

// ---------- Diagram geometry (SVG user units) ----------

const W = 1200;
const H = 640;
const BUS_X = 80; // left edge of the instruction register
const BUS_W = 1040; // 32 bits wide
const BIT_W = BUS_W / 32;
const IR_Y = 132;
const IR_H = 60;
const FIELD_Y = 280;
const FIELD_H = 50;
const DIS_Y = 420;

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

// ---------- Number formatting ----------

const hex = (v: number, digits: number) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(digits, "0");
const bin = (v: number, bits: number) => (v >>> 0).toString(2).padStart(bits, "0").slice(-bits);

function inBase(v: number, bits: number, base: Base, signed?: number): string {
  if (base === "bin") return bin(v, bits);
  if (base === "hex") return hex(v, Math.ceil(bits / 4));
  return String(signed ?? v);
}

const NEXT_BASE: Record<Base, Base> = { bin: "hex", hex: "dec", dec: "bin" };

// ---------- Input parsing ----------

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

// ---------- Drawing ----------

interface View {
  irBase: "bin" | "hex";
  fieldBase: Record<FieldKey, Base>;
}

interface Actions {
  flipBit(bit: number): void;
  toggleIrBase(): void;
  cycleFieldBase(key: FieldKey): void;
}

/** Clickable "[bin]" tag, like a base switch printed next to a display. */
function baseTag(x: number, y: number, label: string, onClick: () => void, anchor = "end"): SVGTextElement {
  const t = s("text", { x, y, class: "base-tag", "text-anchor": anchor, tabindex: 0, role: "button" }, `[${label}]`);
  t.setAttribute("aria-label", `Show in another base (now ${label})`);
  t.addEventListener("click", onClick);
  t.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  });
  return t;
}

function fieldValue(d: DecodedWord, key: FieldKey): { value: number; signed?: number } {
  if (key === "imm") return { value: d.imm_zext, signed: ZERO_EXT.has(d.mnemonic) ? undefined : d.imm_sext };
  return { value: d[key] };
}

function fieldNote(core: Core, d: DecodedWord, key: FieldKey): string {
  switch (key) {
    case "rs":
    case "rt":
    case "rd":
      return core.registerName(d[key]);
    case "opcode":
      return d.opcode === 0 ? "R-type" : d.format === "Unknown" ? "unknown" : d.mnemonic;
    case "funct":
      return d.format === "R" ? d.mnemonic : "";
    case "imm":
      return ZERO_EXT.has(d.mnemonic) ? `zero-extended (sign: ${d.imm_sext})` : `sign-extended (zero: ${d.imm_zext})`;
    case "target":
      return `jump to ${hex((d.target << 2) >>> 0, 7)} (low 28 bits)`;
    case "shamt":
      return "";
  }
}

function drawInstructionRegister(d: DecodedWord, spans: Span[], view: View, act: Actions): SVGGElement {
  const g = s("g", { class: "ir" });
  g.append(
    s("text", { x: BUS_X, y: IR_Y - 10, class: "label" }, "Instruction Register"),
    baseTag(BUS_X + BUS_W, IR_Y - 10, view.irBase, act.toggleIrBase),
    s("rect", { x: BUS_X, y: IR_Y, width: BUS_W, height: IR_H, class: "display" }),
  );

  if (view.irBase === "hex") {
    g.append(s("text", { x: BUS_X + BUS_W / 2, y: IR_Y + IR_H / 2, class: "digits big" }, hex(d.raw, 8)));
    return g;
  }

  // Field boundaries inside the register
  for (const span of spans.slice(1)) {
    const x = BUS_X + (31 - span.hi) * BIT_W;
    g.append(s("line", { x1: x, y1: IR_Y + 6, x2: x, y2: IR_Y + IR_H - 6, class: "divider" }));
  }

  for (let i = 31; i >= 0; i--) {
    const x = BUS_X + (31 - i) * BIT_W;
    const b = (d.raw >>> i) & 1;
    const cell = s("g", { class: `bit${b ? " one" : ""}`, tabindex: 0, role: "button" });
    cell.setAttribute("aria-label", `Bit ${i} is ${b}. Flip it.`);
    cell.dataset.bit = String(i);
    cell.append(
      s("rect", { x, y: IR_Y, width: BIT_W, height: IR_H, class: "hit" }),
      s("text", { x: x + BIT_W / 2, y: IR_Y + IR_H / 2, class: "digits" }, String(b)),
    );
    cell.addEventListener("click", () => act.flipBit(i));
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        act.flipBit(i);
      }
    });
    g.append(cell);
  }

  // Bit numbers at each field edge, under the register
  for (const span of spans) {
    const x0 = BUS_X + (31 - span.hi) * BIT_W;
    const x1 = BUS_X + (32 - span.lo) * BIT_W;
    g.append(
      s("text", { x: x0 + 3, y: IR_Y + IR_H + 16, class: "bitnum", "text-anchor": "start" }, String(span.hi)),
      s("text", { x: x1 - 3, y: IR_Y + IR_H + 16, class: "bitnum", "text-anchor": "end" }, String(span.lo)),
    );
  }
  return g;
}

function drawField(core: Core, d: DecodedWord, span: Span, view: View, act: Actions): SVGGElement {
  const bits = span.hi - span.lo + 1;
  const gx = BUS_X + (31 - span.hi) * BIT_W + 6;
  const gw = bits * BIT_W - 12;
  const cx = gx + gw / 2;
  const off = d.format === "Unknown";
  const base = view.fieldBase[span.key];
  const { value, signed } = fieldValue(d, span.key);
  const note = fieldNote(core, d, span.key);

  const g = s("g", { class: `field${off ? " off" : ""}` });
  g.append(
    // Wire: instruction register -> field display -> disassembler
    s("line", { x1: cx, y1: IR_Y + IR_H + 22, x2: cx, y2: FIELD_Y, class: "wire" }),
    s("line", { x1: cx, y1: FIELD_Y + FIELD_H, x2: cx, y2: DIS_Y, class: "wire" }),
    s("text", { x: gx, y: FIELD_Y - 9, class: "label" }, span.key),
    baseTag(gx + gw, FIELD_Y - 9, base, () => act.cycleFieldBase(span.key)),
    s("rect", { x: gx, y: FIELD_Y, width: gw, height: FIELD_H, class: "display" }),
    s("text", { x: cx, y: FIELD_Y + FIELD_H / 2, class: "digits" }, inBase(value, bits, base, signed)),
  );
  if (note) {
    // Notes sit beside the lower wire so they never cross it.
    g.append(s("text", { x: cx + 10, y: FIELD_Y + FIELD_H + 28, class: "note" }, note));
  }
  return g;
}

function drawDisassembler(d: DecodedWord): SVGGElement {
  const known = d.format !== "Unknown";
  const g = s("g", { class: "disasm" });
  const boxX = BUS_X;
  const boxW = BUS_W;
  g.append(
    s("rect", { x: boxX, y: DIS_Y, width: boxW, height: 170, class: "unit" }),
    s("text", { x: boxX + 28, y: DIS_Y + 44, class: "unit-title" }, "DISASSEMBLER"),
    s("text", { x: boxX + 28, y: DIS_Y + 82, class: "label" }, "disassemble()"),
    s("rect", { x: boxX + 28, y: DIS_Y + 90, width: 620, height: 60, class: `display${known ? "" : " bad"}` }),
    s(
      "text",
      { x: boxX + 28 + 310, y: DIS_Y + 120, class: "digits big" },
      known ? d.disassembly : "unknown instruction",
    ),
  );

  const small: [string, string][] = [
    ["format", d.format === "Unknown" ? "?" : d.format],
    ["mnemonic", d.mnemonic],
    ["op", String(d.op)],
  ];
  small.forEach(([label, value], i) => {
    const x = boxX + 690 + i * 112;
    g.append(
      s("text", { x, y: DIS_Y + 82, class: "label" }, label),
      s("rect", { x, y: DIS_Y + 90, width: 100, height: 60, class: "display" }),
      s("text", { x: x + 50, y: DIS_Y + 120, class: "digits" }, value),
    );
  });
  return g;
}

function draw(core: Core, d: DecodedWord, view: View, act: Actions): SVGSVGElement {
  const spans = LAYOUT[d.format];
  const svg = s("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": `Decoder: ${d.format === "Unknown" ? "unknown instruction" : d.disassembly}`,
  });
  svg.append(
    s("text", { x: W / 2, y: 46, class: "title" }, "DECODER"),
    s("rect", { x: 30, y: 76, width: W - 60, height: H - 96, class: "chip" }),
    drawInstructionRegister(d, spans, view, act),
    ...spans.map((span) => drawField(core, d, span, view, act)),
    drawDisassembler(d),
  );
  return svg;
}

// ---------- Wiring ----------

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const toolbar = document.getElementById("toolbar")!;
  const input = document.getElementById("word") as HTMLInputElement;
  const error = document.getElementById("word-error")!;
  const select = document.getElementById("examples") as HTMLSelectElement;

  const nav = navLinks("probe");
  if (nav) toolbar.prepend(nav);

  let core: Core;
  try {
    core = await loadCore();
  } catch (err) {
    showLoadError(stage, err);
    return;
  }

  // Example list, labelled with what the C++ disassembler says each word is.
  select.append(new Option("custom word", ""));
  for (const ex of EXAMPLES) {
    select.append(new Option(`${core.decode(ex.word).disassembly}   (${ex.source})`, String(ex.word)));
  }

  const view: View = {
    irBase: "bin",
    fieldBase: { opcode: "dec", rs: "dec", rt: "dec", rd: "dec", shamt: "dec", funct: "hex", imm: "dec", target: "hex" },
  };

  const fromHash = parseWord(decodeURIComponent(location.hash.slice(1)));
  let word = location.hash.length > 1 && fromHash.ok ? fromHash.word : EXAMPLES[0]!.word;

  const actions: Actions = {
    flipBit(bit) {
      show(word ^ (1 << bit), true);
      stage.querySelector<SVGGElement>(`[data-bit="${bit}"]`)?.focus();
    },
    toggleIrBase() {
      view.irBase = view.irBase === "bin" ? "hex" : "bin";
      show(word, false);
    },
    cycleFieldBase(key) {
      view.fieldBase[key] = NEXT_BASE[view.fieldBase[key]];
      show(word, false);
    },
  };

  function show(next: number, updateInput: boolean): void {
    word = next >>> 0;
    if (updateInput) input.value = hex(word, 8);
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    select.value = EXAMPLES.some((e) => e.word === word) ? String(word) : "";
    stage.replaceChildren(draw(core, core.decode(word), view, actions));
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
