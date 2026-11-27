// Decoder page: the browser version of `make probe WORD=0x...`, laid out like the
// worked translation examples in the lectures (Lecture 19, Example 2.9).
// Every value comes from mips::decode() / mips::disassemble() in C++ (via WebAssembly).

import "../../styles/base.css";
import "./probe.css";

import { loadCore, type Core, type DecodedWord, type Format } from "../../shared/core";
import { navLinks, showLoadError } from "../../shared/frame";

// Words from tests/test_decode.cpp, with the lecture each comes from.
const EXAMPLES: { word: number; source: string }[] = [
  { word: 0x2237fff1, source: "Lecture 21 → Ex 2.9" },
  { word: 0x1520fffa, source: "Lecture 19 → Q6" },
  { word: 0x012a4020, source: "Lecture 18 → slide 8" },
  { word: 0x00094100, source: "Shift (sll)" },
  { word: 0x3108ffff, source: "Lecture 18 → zero-extend" },
  { word: 0x2108ffff, source: "Lecture 18 → sign-extend" },
  { word: 0x08000002, source: "Lecture 19 → Q5" },
];

// ---------- Field layout (Lecture 18) ----------

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

const FORMAT_NAME: Record<Format, string> = { R: "R-type", I: "I-type", J: "J-type", Unknown: "R-type" };

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

// andi, ori and lui use the zero-extended immediate; the other I-types sign-extend (Lecture 18).
const ZERO_EXT = new Set(["andi", "ori", "lui"]);
const SHIFTS = new Set(["sll", "srl", "sra"]);

// ---------- Helpers ----------

const hex = (v: number, digits: number) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(digits, "0");
const bin = (v: number, bits: number) => (v >>> 0).toString(2).padStart(bits, "0").slice(-bits);
/** Binary in groups of four from the right, as written on the slides: "1111 1111 1111 0001". */
const nibbles = (s: string) => s.replace(/\B(?=(\d{4})+$)/g, " ");

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

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

// ---------- Step 1: hex over binary, braces under each field ----------

const LEFT = 150; // room for the word label on the left
const BIT_W = 24;
const NIBBLE_GAP = 14;
const bitX = (i: number) => LEFT + (31 - i) * BIT_W + Math.floor((31 - i) / 4) * NIBBLE_GAP;
const BITS_W = bitX(0) + BIT_W + 4;

function bracePath(x0: number, x1: number, y: number): string {
  const mid = (x0 + x1) / 2;
  const d = 7;
  return [
    `M ${x0} ${y}`,
    `Q ${x0} ${y + d} ${x0 + d} ${y + d}`,
    `L ${mid - d} ${y + d}`,
    `Q ${mid} ${y + d} ${mid} ${y + 2 * d}`,
    `Q ${mid} ${y + d} ${mid + d} ${y + d}`,
    `L ${x1 - d} ${y + d}`,
    `Q ${x1} ${y + d} ${x1} ${y}`,
  ].join(" ");
}

function drawBits(d: DecodedWord, onFlip: (bit: number) => void): SVGSVGElement {
  const svg = s("svg", { viewBox: `0 0 ${BITS_W} 104`, class: "bits-svg", role: "group" });
  svg.setAttribute("aria-label", `Bits of ${hex(d.raw, 8)}, most significant first`);

  // Word label (pink, as on the slides) with its format under it
  svg.append(
    s("text", { x: 0, y: 60, class: "word-label" }, hex(d.raw, 8)),
    s("text", { x: 0, y: 84, class: "format-label" }, d.format === "Unknown" ? "unknown" : FORMAT_NAME[d.format]),
  );

  // Hex digit above each group of four bits
  for (let n = 0; n < 8; n++) {
    const hi = 31 - n * 4;
    const x = bitX(hi) + 2 * BIT_W;
    svg.append(s("text", { x, y: 24, class: "hex-digit" }, ((d.raw >>> (hi - 3)) & 0xf).toString(16).toUpperCase()));
  }

  // The bits themselves (click to flip)
  for (let i = 31; i >= 0; i--) {
    const b = (d.raw >>> i) & 1;
    const x = bitX(i);
    const g = s("g", { class: "bit", tabindex: 0, role: "button", "data-bit": i });
    g.setAttribute("aria-label", `Bit ${i} is ${b}. Flip it.`);
    g.append(
      s("rect", { x: x + 1, y: 40, width: BIT_W - 2, height: 28, class: "bit-hit" }),
      s("text", { x: x + BIT_W / 2, y: 60, class: "bit-digit" }, String(b)),
    );
    g.addEventListener("click", () => onFlip(i));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onFlip(i);
      }
    });
    svg.append(g);
  }

  // Coloured brace under each field
  for (const span of LAYOUT[d.format]) {
    const x0 = bitX(span.hi) + 3;
    const x1 = bitX(span.lo) + BIT_W - 3;
    svg.append(s("path", { d: bracePath(x0, x1, 74), class: `brace f-${span.key}` }));
  }
  return svg;
}

// ---------- Step 2: the field table ----------

function fieldBits(d: DecodedWord, span: Span): number {
  return (d.raw >>> span.lo) & ((1 << (span.hi - span.lo + 1)) - 1);
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
      if (d.format === "Unknown") return d.opcode === 0 ? "R-type" : "not supported";
      return d.opcode === 0 ? "R-type" : d.mnemonic;
    case "rs":
    case "rt":
    case "rd":
      return core.registerName(d[key]);
    case "shamt":
      return SHIFTS.has(d.mnemonic) ? "shift amount" : "unused (0)";
    case "funct":
      return d.format === "R" ? d.mnemonic : "not supported";
    case "imm":
      return ZERO_EXT.has(d.mnemonic) ? "zero-extended" : "sign-extended";
    case "target":
      return `address ${hex((d.target << 2) >>> 0, 7)}`;
  }
}

function drawSplit(core: Core, d: DecodedWord): HTMLElement {
  const spans = LAYOUT[d.format];
  const cols = el("colgroup", {});
  for (const span of spans) {
    const c = el("col", {});
    c.style.width = `${((span.hi - span.lo + 1) / 32) * 100}%`;
    cols.append(c);
  }

  const row = (className: string, cell: (span: Span) => Node | string, tag: "td" | "th" = "td") =>
    el(
      "tr",
      { className },
      ...spans.map((span) => el(tag, { className: `f-${span.key}` }, cell(span))),
    );

  const fields = el(
    "table",
    { className: "split-table" },
    cols,
    el(
      "thead",
      {},
      row("widths", (sp) => `${sp.hi - sp.lo + 1} bits`, "th"),
    ),
    el(
      "tbody",
      {},
      row("boxed binary", (sp) => {
        const width = sp.hi - sp.lo + 1;
        const b = bin(fieldBits(d, sp), width);
        return width >= 16 ? nibbles(b) : b; // slides group only the long fields
      }),
      row("names", (sp) => FIELD_LABEL[sp.key]),
    ),
  );

  const decimal = el(
    "table",
    { className: "split-table" },
    cols.cloneNode(true),
    el(
      "tbody",
      {},
      row("boxed decimal", (sp) => decimalValue(d, sp.key)),
      row("meanings", (sp) => meaning(core, d, sp.key)),
    ),
  );

  return el(
    "div",
    {},
    fields,
    el("p", { className: "in-decimal", text: "In decimal:" }),
    decimal,
  );
}

// ---------- Step 3: the assembly line, coloured to match the fields ----------

function drawAssembly(core: Core, d: DecodedWord): (Node | string)[] {
  if (d.format === "Unknown") {
    return [el("span", { className: "unknown", text: "not an instruction in the supported subset" })];
  }

  // Which field each register name came from. Order matters when two fields name the same register.
  const regFields: FieldKey[] = d.format === "R" ? ["rd", "rs", "rt"] : d.format === "I" ? ["rt", "rs"] : [];
  const regColour = new Map<string, FieldKey>();
  for (const key of regFields) {
    const name = core.registerName(d[key as "rs" | "rt" | "rd"]);
    if (!regColour.has(name)) regColour.set(name, key);
  }
  const numberField: FieldKey = d.format === "J" ? "target" : SHIFTS.has(d.mnemonic) ? "shamt" : "imm";
  const mnemonicField: FieldKey = d.format === "R" ? "funct" : "opcode";

  const [mnemonic = "", ...rest] = d.disassembly.split(" ");
  const operands = rest.join(" ");
  const parts: (Node | string)[] = [el("span", { className: `f-${mnemonicField} tok`, text: mnemonic }), " "];
  for (const tok of operands.split(/(\$\w+|-?0x[0-9a-f]+|-?\d+)/i)) {
    if (!tok) continue;
    const field = tok.startsWith("$") ? regColour.get(tok) : /\d/.test(tok) ? numberField : undefined;
    parts.push(field ? el("span", { className: `f-${field} tok`, text: tok }) : tok);
  }
  return parts;
}

// ---------- Wiring ----------

async function main(): Promise<void> {
  const sheet = document.getElementById("sheet")!;
  const input = document.getElementById("word") as HTMLInputElement;
  const error = document.getElementById("word-error")!;
  const examples = document.getElementById("examples")!;
  const bits = document.getElementById("bits")!;
  const split = document.getElementById("split")!;
  const asm = document.getElementById("asm")!;
  const formatName = document.getElementById("format-name")!;

  const nav = navLinks("probe");
  if (nav) document.getElementById("band")!.append(nav);

  let core: Core;
  try {
    core = await loadCore();
  } catch (err) {
    showLoadError(sheet, err);
    return;
  }

  const fromHash = parseWord(decodeURIComponent(location.hash.slice(1)));
  let word = location.hash.length > 1 && fromHash.ok ? fromHash.word : EXAMPLES[0]!.word;

  for (const ex of EXAMPLES) {
    const btn = el(
      "button",
      { className: "ref", attrs: { type: "button", "data-word": String(ex.word) } },
      el("span", { text: ex.source }),
      el("code", { text: hex(ex.word, 8) }),
    );
    btn.addEventListener("click", () => show(ex.word, true));
    examples.append(el("li", {}, btn));
  }

  function flip(bit: number): void {
    show(word ^ (1 << bit), true);
    bits.querySelector<SVGGElement>(`[data-bit="${bit}"]`)?.focus();
  }

  function show(next: number, updateInput: boolean): void {
    word = next >>> 0;
    const d = core.decode(word);
    if (updateInput) input.value = hex(word, 8);
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    for (const b of examples.querySelectorAll<HTMLButtonElement>(".ref")) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.word) === word));
    }
    formatName.textContent = d.format === "Unknown" ? "R-type (the opcode is not supported, so the R split is shown)" : FORMAT_NAME[d.format];
    bits.replaceChildren(drawBits(d, flip));
    split.replaceChildren(drawSplit(core, d));
    asm.replaceChildren(...drawAssembly(core, d));
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

  show(word, true);
}

void main();
