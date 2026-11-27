// Decoder page: the browser version of `make probe WORD=0x...`.
// Laid out like the worked translation examples in the lectures: binary, then fields, then assembly.
// Every decoded value comes from mips::decode() / mips::disassemble() in C++ (via WebAssembly).

import "../../styles/base.css";
import "./probe.css";

import { loadCore, type Core, type DecodedWord, type Format } from "../../shared/core";
import { navLinks, showLoadError } from "../../shared/frame";

// Words from tests/test_decode.cpp.
const EXAMPLES = [0x2237fff1, 0x1520fffa, 0x012a4020, 0x00094100, 0x3108ffff, 0x2108ffff, 0x08000002];

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
  Unknown: R_LAYOUT, // no layout of its own: show the R split
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
/** Groups of four from the right: "1111 1111 1111 0001". */
const nibbles = (s: string) => s.replace(/\B(?=(\d{4})+$)/g, " ");
const width = (sp: Span) => sp.hi - sp.lo + 1;

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
    if (!/^[01]{1,32}$/.test(body)) return { ok: false, error: "Binary takes 1 to 32 digits of 0 or 1." };
    return { ok: true, word: parseInt(body, 2) >>> 0 };
  }
  const body = t.startsWith("0x") ? t.slice(2) : t;
  if (!/^[0-9a-f]{1,8}$/.test(body)) return { ok: false, error: "Hex takes 1 to 8 digits, 0-9 and A-F." };
  return { ok: true, word: parseInt(body, 16) >>> 0 };
}

// ---------- Step 1: hex over binary, a brace and name under each field ----------

const BIT_W = 26;
const NIBBLE_GAP = 14;
const bitX = (i: number) => (31 - i) * BIT_W + Math.floor((31 - i) / 4) * NIBBLE_GAP;
const BITS_W = bitX(0) + BIT_W;

function bracePath(x0: number, x1: number, y: number): string {
  const mid = (x0 + x1) / 2;
  const d = 6;
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
  const svg = s("svg", { viewBox: `-4 0 ${BITS_W + 8} 118`, class: "bits-svg", role: "group" });
  svg.setAttribute("aria-label", `Bits of ${hex(d.raw, 8)}, most significant first`);

  // Hex digit above each group of four bits
  for (let n = 0; n < 8; n++) {
    const hi = 31 - n * 4;
    const nibble = ((d.raw >>> (hi - 3)) & 0xf).toString(16).toUpperCase();
    svg.append(s("text", { x: bitX(hi) + 2 * BIT_W, y: 14, class: "hex-digit" }, nibble));
  }

  // Bits, tinted by field (click to flip)
  for (const span of LAYOUT[d.format]) {
    for (let i = span.hi; i >= span.lo; i--) {
      const b = (d.raw >>> i) & 1;
      const x = bitX(i);
      const g = s("g", {
        class: `bit f-${span.key}${b ? " one" : ""}`,
        tabindex: 0,
        role: "button",
        "data-bit": i,
        "data-field": span.key,
      });
      g.setAttribute("aria-label", `Bit ${i} (${span.key}) is ${b}. Flip it.`);
      g.append(
        s("rect", { x: x + 1, y: 30, width: BIT_W - 2, height: 34, rx: 4, class: "bit-cell" }),
        s("text", { x: x + BIT_W / 2, y: 48, class: "bit-digit" }, String(b)),
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
  }

  // Brace and name under each field
  for (const span of LAYOUT[d.format]) {
    const x0 = bitX(span.hi) + 2;
    const x1 = bitX(span.lo) + BIT_W - 2;
    const g = s("g", { class: `brace-group f-${span.key}`, "data-field": span.key });
    g.append(
      s("path", { d: bracePath(x0, x1, 72), class: "brace" }),
      s("text", { x: (x0 + x1) / 2, y: 100, class: "brace-label" }, `${FIELD_LABEL[span.key]}`),
    );
    svg.append(g);
  }
  return svg;
}

// ---------- Step 2: the field table ----------

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

function drawSplit(core: Core, d: DecodedWord): HTMLTableElement {
  const spans = LAYOUT[d.format];
  const cols = el("colgroup", {}, el("col", { className: "head-col" }));
  for (const span of spans) {
    const c = el("col", {});
    c.style.width = `${(width(span) / 32) * 88}%`;
    cols.append(c);
  }

  const cell = (tag: "th" | "td", span: Span, ...children: (Node | string)[]) =>
    el(tag, { className: `f-${span.key}`, attrs: { "data-field": span.key } }, ...children);

  const row = (label: string, className: string, fill: (span: Span) => string) =>
    el(
      "tr",
      { className },
      el("th", { attrs: { scope: "row" }, text: label }),
      ...spans.map((span) => cell("td", span, fill(span))),
    );

  return el(
    "table",
    { className: "split-table" },
    cols,
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("td", {}),
        ...spans.map((span) =>
          cell(
            "th",
            span,
            el("span", { className: "col-name", text: FIELD_LABEL[span.key] }),
            el("span", { className: "col-bits", text: `${width(span)} bits` }),
          ),
        ),
      ),
    ),
    el(
      "tbody",
      {},
      row("binary", "binary", (sp) => {
        const b = bin(fieldBits(d, sp), width(sp));
        return width(sp) >= 16 ? nibbles(b) : b;
      }),
      row("decimal", "decimal", (sp) => decimalValue(d, sp.key)),
      row("means", "means", (sp) => meaning(core, d, sp.key)),
    ),
  );
}

// ---------- Step 3: the assembly line, coloured to match the fields ----------

function drawAssembly(core: Core, d: DecodedWord): (Node | string)[] {
  if (d.format === "Unknown") {
    return [el("span", { className: "unknown", text: "Not an instruction in the supported subset." })];
  }

  // Which field each register name came from. When two fields name the same register, the first wins.
  const regFields: ("rs" | "rt" | "rd")[] = d.format === "R" ? ["rd", "rs", "rt"] : d.format === "I" ? ["rt", "rs"] : [];
  const regField = new Map<string, FieldKey>();
  for (const key of regFields) {
    const name = core.registerName(d[key]);
    if (!regField.has(name)) regField.set(name, key);
  }
  const numberField: FieldKey = d.format === "J" ? "target" : SHIFTS.has(d.mnemonic) ? "shamt" : "imm";
  const mnemonicField: FieldKey = d.format === "R" ? "funct" : "opcode";

  const token = (field: FieldKey, text: string) =>
    el("span", { className: `tok f-${field}`, text, attrs: { "data-field": field } });

  const [mnemonic = "", ...rest] = d.disassembly.split(" ");
  const parts: (Node | string)[] = [token(mnemonicField, mnemonic), " "];
  for (const tok of rest.join(" ").split(/(\$\w+|-?0x[0-9a-f]+|-?\d+)/i)) {
    if (!tok) continue;
    const field = tok.startsWith("$") ? regField.get(tok) : /\d/.test(tok) ? numberField : undefined;
    parts.push(field ? token(field, tok) : tok);
  }
  return parts;
}

// ---------- Wiring ----------

async function main(): Promise<void> {
  const sheet = document.getElementById("sheet")!;
  const steps = document.getElementById("steps")!;
  const input = document.getElementById("word") as HTMLInputElement;
  const error = document.getElementById("word-error")!;
  const examples = document.getElementById("examples")!;
  const bits = document.getElementById("bits")!;
  const split = document.getElementById("split")!;
  const asm = document.getElementById("asm")!;
  const formatName = document.getElementById("format-name")!;

  const nav = navLinks("probe");
  if (nav) document.getElementById("masthead")!.append(nav);

  let core: Core;
  try {
    core = await loadCore();
  } catch (err) {
    showLoadError(sheet, err);
    return;
  }

  const fromHash = parseWord(decodeURIComponent(location.hash.slice(1)));
  let word = location.hash.length > 1 && fromHash.ok ? fromHash.word : EXAMPLES[0]!;

  // Example buttons, labelled with what the C++ disassembler says each word is.
  for (const w of EXAMPLES) {
    const btn = el("button", {
      className: "example code",
      text: core.decode(w).disassembly,
      attrs: { type: "button", "data-word": String(w), title: hex(w, 8) },
    });
    btn.addEventListener("click", () => show(w, true));
    examples.append(el("li", {}, btn));
  }

  // Point at anything tagged with a field: that field lights up in every step.
  steps.addEventListener("pointerover", (e) => {
    const field = (e.target as Element).closest<HTMLElement | SVGElement>("[data-field]")?.dataset.field;
    if (field) steps.dataset.hot = field;
    else delete steps.dataset.hot;
  });
  steps.addEventListener("pointerleave", () => delete steps.dataset.hot);

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
    for (const b of examples.querySelectorAll<HTMLButtonElement>(".example")) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.word) === word));
    }
    formatName.textContent = FORMAT_NAME[d.format];
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
