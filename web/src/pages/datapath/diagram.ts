// The single-cycle datapath figure (Lecture 19), drawn once as SVG and then updated in place.
// Geometry lives here; which wires carry a signal is decided from the control signals that
// mips::control_for() returns, and the values on the wires come from Cpu::step()'s StepTrace.

import type { Control, DecodedWord, Trace } from "../../shared/core";

// ---------- What one drawing of the datapath shows ----------

export interface View {
  d: DecodedWord;
  c: Control;
  /** null before the instruction has run (preview of the word at the PC). */
  t: Trace | null;
  /** Values that are only read, not computed: shown before the step too. */
  regName: (r: number) => string;
  /** Address of this instruction. */
  pc: number;
  rsValue: number;
  rtValue: number;
}

export const PHASES = ["Fetch", "Decode", "Execute", "Memory", "Write back"] as const;
export type Phase = 0 | 1 | 2 | 3 | 4;

const SHIFTS = new Set(["sll", "srl", "sra"]);
const ZERO_EXT = new Set(["andi", "ori", "lui"]);

/** Which parts of the datapath this instruction uses. */
function usage(v: View) {
  const { d, c } = v;
  const known = d.format !== "Unknown";
  const shift = SHIFTS.has(d.mnemonic);
  const lui = d.mnemonic === "lui";
  const aluUsed = known && !c.jump;
  const usesRs = known && !(c.jump && !c.jump_reg) && !shift && !lui;
  const usesRt = known && ((d.format === "R" && !c.jump_reg) || c.branch || c.mem_write);
  const taken = v.t ? v.t.branch_taken : null;
  return {
    known,
    shift,
    lui,
    aluUsed,
    aluAIn: aluUsed && !lui,
    usesRs,
    usesRt,
    rdDest: c.reg_write && c.reg_dst,
    rtDest: c.reg_write && !c.reg_dst && !c.link,
    link: c.link,
    useImm: c.alu_src || c.branch,
    aluA: aluUsed && !lui && !shift && usesRs,
    aluB_rt: aluUsed && !c.alu_src && !shift,
    memAddr: c.mem_read || c.mem_write,
    wbAlu: c.reg_write && !c.mem_to_reg && !c.link,
    wbMem: c.mem_to_reg,
    // Before the step we can't know if a branch is taken: show both ways as possible.
    branchTaken: c.branch && taken !== false,
    sequential: known && !c.jump && !(c.branch && taken === true),
    jumpImm: c.jump && !c.jump_reg,
  };
}
type Usage = ReturnType<typeof usage>;

// ---------- Value formatting ----------

/** Data values as signed decimal (what the lecture tables use). */
const dec = (v: number) => String(v | 0);
/** Addresses in short hex. */
const addr = (v: number) => "0x" + (v >>> 0).toString(16).toUpperCase();

// ---------- SVG helpers ----------

const SVG_NS = "http://www.w3.org/2000/svg";
function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  node.append(...children);
  return node;
}

type Pt = readonly [number, number];
const pathOf = (pts: readonly Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");

/** Arrowhead at `tip`, pointing along the segment from `from`. The line stops at its base. */
const HEAD = 9;
function arrowHead(from: Pt, tip: Pt): { base: Pt; d: string } {
  const dx = Math.sign(tip[0] - from[0]);
  const dy = Math.sign(tip[1] - from[1]);
  const base: Pt = [tip[0] - dx * HEAD, tip[1] - dy * HEAD];
  const w = 4.5;
  const a: Pt = [base[0] + dy * w, base[1] - dx * w];
  const b: Pt = [base[0] - dy * w, base[1] + dx * w];
  return { base, d: `M ${a[0]} ${a[1]} L ${tip[0]} ${tip[1]} L ${b[0]} ${b[1]} Z` };
}

// ---------- Wires ----------

type Field = "opcode" | "rs" | "rt" | "rd" | "imm" | "funct" | "target";

interface WireDef {
  id: string;
  title: string;
  pts: readonly Pt[];
  phase: Phase;
  on: (u: Usage, v: View) => boolean;
  field?: Field;
  /** Junction dots, drawn where this wire leaves another. */
  dots?: readonly Pt[];
  arrow?: boolean;
  /** Bit range printed next to the wire, e.g. "[25-21]". */
  bits?: { at: Pt; text: string };
  /** A value tag sitting on the wire. */
  tag?: { at: Pt; value: (v: View) => string | null };
}

// Spine: the instruction bus leaving instruction memory, split into fields.
const SPINE_X = 330;

const WIRES: WireDef[] = [
  // ---- Fetch ----
  {
    id: "pc-im",
    title: "PC → instruction memory read address",
    pts: [[110, 455], [150, 455]],
    phase: 0,
    on: () => true,
  },
  {
    id: "pc-add",
    title: "PC → PC + 4 adder",
    pts: [[128, 455], [128, 95], [180, 95]],
    dots: [[128, 455]],
    phase: 0,
    on: () => true,
  },
  {
    id: "pc4",
    title: "PC + 4",
    pts: [[236, 125], [980, 125], [980, 165], [1010, 165]],
    phase: 0,
    on: (u) => u.sequential || u.link || u.jumpImm || u.branchTaken,
    tag: { at: [272, 125], value: (v) => addr(v.pc + 4) },
  },
  {
    id: "pc4-branch",
    title: "PC + 4 → branch adder",
    pts: [[860, 125], [860, 195], [880, 195]],
    dots: [[860, 125]],
    phase: 2,
    on: (_u, v) => v.c.branch,
  },
  {
    id: "pc4-hi",
    title: "PC + 4 [31-28] → jump address",
    pts: [[580, 125], [580, 62]],
    dots: [[580, 125]],
    phase: 1,
    on: (u) => u.jumpImm,
    bits: { at: [586, 96], text: "[31-28]" },
  },
  {
    id: "im-out",
    title: "Instruction [31-0]",
    pts: [[300, 455], [SPINE_X, 455]],
    arrow: false,
    phase: 0,
    on: (u) => u.known,
  },
  {
    id: "spine",
    title: "Instruction bus",
    pts: [[SPINE_X, 44], [SPINE_X, 740]],
    arrow: false,
    dots: [[SPINE_X, 455]],
    phase: 0,
    on: (u) => u.known,
  },

  // ---- Decode: field taps ----
  {
    id: "f-opcode",
    title: "Instruction [31-26] → Control",
    pts: [[SPINE_X, 185], [390, 185]],
    dots: [[SPINE_X, 185]],
    field: "opcode",
    phase: 1,
    on: (u) => u.known,
    bits: { at: [336, 175], text: "[31-26]" },
  },
  {
    id: "f-rs",
    title: "Instruction [25-21] → Read register 1",
    pts: [[SPINE_X, 400], [560, 400]],
    dots: [[SPINE_X, 400]],
    field: "rs",
    phase: 1,
    on: (u) => u.usesRs,
    bits: { at: [336, 390], text: "[25-21]" },
    tag: { at: [522, 400], value: (v) => v.regName(v.d.rs) },
  },
  {
    id: "f-rt-in",
    title: "Instruction [20-16]",
    pts: [[SPINE_X, 440], [450, 440]],
    arrow: false,
    dots: [[SPINE_X, 440]],
    field: "rt",
    phase: 1,
    on: (u) => u.usesRt || u.rtDest,
    bits: { at: [336, 430], text: "[20-16]" },
  },
  {
    id: "f-rt",
    title: "Instruction [20-16] → Read register 2",
    pts: [[450, 440], [560, 440]],
    field: "rt",
    phase: 1,
    on: (u) => u.usesRt,
    tag: { at: [522, 440], value: (v) => v.regName(v.d.rt) },
  },
  {
    id: "f-rt-dst",
    title: "Instruction [20-16] → RegDst mux (destination rt)",
    pts: [[450, 440], [450, 485], [480, 485]],
    dots: [[450, 440]],
    field: "rt",
    phase: 1,
    on: (u) => u.rtDest,
  },
  {
    id: "f-rd",
    title: "Instruction [15-11] → RegDst mux (destination rd)",
    pts: [[SPINE_X, 507], [480, 507]],
    dots: [[SPINE_X, 507]],
    field: "rd",
    phase: 1,
    on: (u) => u.rdDest,
    bits: { at: [336, 497], text: "[15-11]" },
    tag: { at: [416, 507], value: (v) => v.regName(v.d.rd) },
  },
  {
    id: "f-imm",
    title: "Instruction [15-0] → Sign-extend",
    pts: [[SPINE_X, 650], [605, 650]],
    dots: [[SPINE_X, 650]],
    field: "imm",
    phase: 1,
    on: (u) => u.useImm,
    bits: { at: [336, 640], text: "[15-0]" },
  },
  {
    id: "f-funct",
    title: "Instruction [5-0] → ALU control",
    pts: [[SPINE_X, 740], [915, 740], [915, 716]],
    field: "funct",
    phase: 1,
    on: (u, v) => u.aluUsed && v.d.format === "R",
    bits: { at: [336, 730], text: "[5-0]" },
  },
  {
    id: "f-target",
    title: "Instruction [25-0] → Shift left 2",
    pts: [[SPINE_X, 44], [390, 44]],
    field: "target",
    phase: 1,
    on: (u) => u.jumpImm,
    bits: { at: [336, 34], text: "[25-0]" },
  },
  {
    id: "jaddr-concat",
    title: "Target × 4 → jump address",
    pts: [[470, 44], [520, 44]],
    phase: 1,
    on: (u) => u.jumpImm,
  },
  {
    id: "jaddr",
    title: "Jump address [31-0]",
    pts: [[640, 44], [1080, 44], [1080, 120], [1110, 120]],
    phase: 1,
    on: (u) => u.jumpImm,
    tag: { at: [760, 44], value: (v) => addr(((v.pc + 4) & 0xf0000000) | (v.d.target << 2)) },
  },
  {
    id: "regdst-out",
    title: "Write register",
    pts: [[506, 507], [560, 507]],
    phase: 1,
    on: (_u, v) => v.c.reg_write,
  },

  // ---- Decode: register file outputs ----
  {
    id: "rd1",
    title: "Read data 1 (rs) → ALU input A",
    pts: [[730, 405], [790, 405]],
    phase: 1,
    on: (u) => u.aluA,
    tag: { at: [758, 405], value: (v) => dec(v.t ? v.t.rs_value : v.rsValue) },
  },
  {
    id: "rd2",
    title: "Read data 2 (rt)",
    pts: [[730, 505], [790, 505]],
    phase: 1,
    on: (u) => u.aluB_rt,
    tag: { at: [767, 505], value: (v) => dec(v.t ? v.t.rt_value : v.rtValue) },
  },
  {
    id: "rd2-mem",
    title: "Read data 2 → data memory write data",
    pts: [[745, 505], [745, 600], [1015, 600], [1015, 570], [1040, 570]],
    dots: [[745, 505]],
    phase: 3,
    on: (_u, v) => v.c.mem_write,
    tag: { at: [900, 600], value: (v) => dec(v.t ? v.t.rt_value : v.rtValue) },
  },
  {
    id: "sext-out",
    title: "Extended immediate",
    pts: [[685, 650], [775, 650]],
    arrow: false,
    phase: 1,
    on: (u) => u.useImm,
    tag: {
      at: [728, 650],
      value: (v) => (v.d.format === "I" ? dec(ZERO_EXT.has(v.d.mnemonic) ? v.d.imm_zext : v.d.imm_sext) : null),
    },
  },
  {
    id: "sext-branch",
    title: "Extended immediate → Shift left 2 (branch offset)",
    pts: [[775, 650], [840, 650], [840, 320]],
    dots: [[775, 650]],
    phase: 1,
    on: (_u, v) => v.c.branch,
  },
  {
    id: "sext-alu",
    title: "Extended immediate → ALUSrc mux",
    pts: [[775, 650], [775, 550], [790, 550]],
    phase: 1,
    on: (_u, v) => v.c.alu_src,
  },

  // ---- Execute ----
  {
    id: "amux-out",
    title: "ALU input A",
    pts: [[816, 420], [870, 420]],
    phase: 2,
    on: (u) => u.aluAIn,
    tag: { at: [843, 420], value: (v) => (v.t ? dec(v.t.alu_a) : null) },
  },
  {
    id: "bmux-out",
    title: "ALU input B",
    pts: [[816, 525], [870, 525]],
    phase: 2,
    on: (u) => u.aluUsed,
    tag: { at: [843, 525], value: (v) => (v.t ? dec(v.t.alu_b) : null) },
  },
  {
    id: "aluctl-out",
    title: "ALU operation",
    pts: [[915, 664], [915, 570]],
    phase: 2,
    on: (u) => u.aluUsed,
  },
  {
    id: "sl2-out",
    title: "Offset × 4 → branch adder",
    pts: [[840, 290], [840, 255], [880, 255]],
    phase: 2,
    on: (_u, v) => v.c.branch,
  },
  {
    id: "zero",
    title: "ALU Zero",
    pts: [[960, 445], [1013, 445], [1013, 330]],
    phase: 2,
    on: (_u, v) => v.c.branch,
    tag: { at: [988, 445], value: (v) => (v.t ? (v.t.alu_zero ? "1" : "0") : null) },
  },
  {
    id: "badd-out",
    title: "Branch target",
    pts: [[936, 225], [970, 225], [970, 205], [1010, 205]],
    phase: 2,
    on: (u) => u.branchTaken,
  },

  // ---- Memory ----
  {
    id: "alu-res",
    title: "ALU result",
    pts: [[960, 500], [990, 500]],
    arrow: false,
    phase: 2,
    on: (u) => u.memAddr || u.wbAlu,
  },
  {
    id: "alu-addr",
    title: "ALU result → data memory address",
    pts: [[990, 500], [1040, 500]],
    phase: 3,
    on: (u) => u.memAddr,
    tag: { at: [1013, 500], value: (v) => (v.t ? addr(v.t.alu_result) : null) },
  },
  {
    id: "alu-wb",
    title: "ALU result → MemtoReg mux",
    pts: [[990, 500], [990, 630], [1250, 630], [1250, 545], [1270, 545]],
    dots: [[990, 500]],
    phase: 3,
    on: (u) => u.wbAlu,
    tag: { at: [1120, 630], value: (v) => (v.t ? dec(v.t.alu_result) : null) },
  },
  {
    id: "mem-out",
    title: "Data memory read data",
    pts: [[1210, 490], [1270, 490]],
    phase: 3,
    on: (u) => u.wbMem,
    tag: { at: [1240, 490], value: (v) => (v.t && v.c.mem_read ? dec(v.t.mem_data) : null) },
  },
  {
    id: "gate-out",
    title: "PCSrc: branch taken",
    pts: [[1023, 290], [1023, 213]],
    phase: 3,
    on: (_u, v) => v.c.branch,
    tag: { at: [1023, 252], value: (v) => (v.t ? (v.t.branch_taken ? "1" : "0") : null) },
  },

  // ---- Write back / next PC ----
  {
    id: "wb",
    title: "Write data",
    pts: [[1296, 515], [1330, 515], [1330, 790], [540, 790], [540, 550], [560, 550]],
    phase: 4,
    on: (_u, v) => v.c.reg_write,
    tag: { at: [900, 790], value: (v) => (v.t && v.t.reg_written ? dec(v.t.reg_value) : null) },
  },
  {
    id: "pcsrc-out",
    title: "PC + 4 or branch target",
    pts: [[1036, 185], [1110, 185]],
    phase: 4,
    on: (_u, v) => !v.c.jump,
  },
  {
    id: "next-pc",
    title: "Next PC",
    pts: [[1136, 152], [1430, 152], [1430, 14], [30, 14], [30, 455], [46, 455]],
    phase: 4,
    on: () => true,
    tag: { at: [700, 14], value: (v) => (v.t ? addr(v.t.next_pc) : null) },
  },
];

// Named nets: short stubs labelled with where the signal comes from, instead of long wires.
interface FlagDef {
  id: string;
  title: string;
  text: string;
  /** Point the stub delivers to (a mux input), entering from the left. */
  to: Pt;
  len: number;
  phase: Phase;
  on: (u: Usage, v: View) => boolean;
}

const FLAGS: FlagDef[] = [
  { id: "k4", title: "Constant 4", text: "4", to: [180, 155], len: 26, phase: 0, on: () => true },
  { id: "k31", title: "Register 31 ($ra), for jal", text: "31", to: [480, 529], len: 22, phase: 1, on: (u) => u.link },
  { id: "rt-a", title: "Read data 2 (rt), for shifts", text: "rt", to: [790, 435], len: 26, phase: 2, on: (u) => u.shift },
  { id: "shamt", title: "Instruction [10-6] shamt, for shifts", text: "shamt", to: [790, 530], len: 12, phase: 2, on: (u) => u.shift },
  { id: "pc4-link", title: "PC + 4, saved by jal", text: "PC+4", to: [1270, 515], len: 14, phase: 3, on: (u) => u.link },
  { id: "rs-jr", title: "Read data 1 (rs), for jr", text: "rs", to: [1110, 150], len: 30, phase: 1, on: (_u, v) => v.c.jump_reg },
];

// ---------- Units ----------

interface Mux {
  id: string;
  x: number;
  y: number;
  h: number;
  inputs: { y: number; label: string }[];
  /** Index into inputs that is selected, or null when the mux is idle. */
  pick: (u: Usage, v: View) => number | null;
}

const MUXES: Mux[] = [
  {
    id: "m-regdst",
    x: 480,
    y: 470,
    h: 74,
    inputs: [
      { y: 485, label: "0" },
      { y: 507, label: "1" },
      { y: 529, label: "jal" },
    ],
    pick: (u, v) => (!v.c.reg_write ? null : u.link ? 2 : v.c.reg_dst ? 1 : 0),
  },
  {
    id: "m-alua",
    x: 790,
    y: 390,
    h: 60,
    inputs: [
      { y: 405, label: "0" },
      { y: 435, label: "1" },
    ],
    pick: (u) => (!u.aluAIn ? null : u.shift ? 1 : 0),
  },
  {
    id: "m-alusrc",
    x: 790,
    y: 490,
    h: 72,
    inputs: [
      { y: 505, label: "0" },
      { y: 530, label: "sh" },
      { y: 550, label: "1" },
    ],
    pick: (u, v) => (!u.aluUsed ? null : u.shift ? 1 : v.c.alu_src ? 2 : 0),
  },
  {
    id: "m-memtoreg",
    x: 1270,
    y: 470,
    h: 90,
    inputs: [
      { y: 490, label: "1" },
      { y: 515, label: "jal" },
      { y: 545, label: "0" },
    ],
    pick: (u, v) => (!v.c.reg_write ? null : u.link ? 1 : v.c.mem_to_reg ? 0 : 2),
  },
  {
    id: "m-pcsrc",
    x: 1010,
    y: 150,
    h: 70,
    inputs: [
      { y: 165, label: "0" },
      { y: 205, label: "1" },
    ],
    pick: (_u, v) => (v.c.jump ? null : v.t && v.c.branch && v.t.branch_taken ? 1 : 0),
  },
  {
    id: "m-jump",
    x: 1110,
    y: 100,
    h: 105,
    inputs: [
      { y: 120, label: "1" },
      { y: 150, label: "jr" },
      { y: 185, label: "0" },
    ],
    pick: (_u, v) => (v.c.jump_reg ? 1 : v.c.jump ? 0 : 2),
  },
];

/** Control lines: a short stub into a unit with the signal name and its value. */
interface Stub {
  id: string;
  name: string;
  /** Point on the unit edge; the stub rises `len` px above it (negative: below). */
  at: Pt;
  len: number;
  value: (v: View) => string;
  anchor?: "start" | "end";
}

const bit = (b: boolean) => (b ? "1" : "0");

const STUBS: Stub[] = [
  { id: "s-regdst", name: "RegDst", at: [493, 544], len: -16, value: (v) => bit(v.c.reg_dst) },
  { id: "s-regwrite", name: "RegWrite", at: [645, 370], len: 16, value: (v) => bit(v.c.reg_write) },
  { id: "s-shift", name: "Shift", at: [803, 390], len: 14, value: (v) => bit(SHIFTS.has(v.d.mnemonic)) },
  { id: "s-alusrc", name: "ALUSrc", at: [803, 490], len: 14, value: (v) => bit(v.c.alu_src) },
  { id: "s-memwrite", name: "MemWrite", at: [1090, 400], len: 16, value: (v) => bit(v.c.mem_write) },
  { id: "s-memread", name: "MemRead", at: [1165, 400], len: 16, value: (v) => bit(v.c.mem_read) },
  { id: "s-memtoreg", name: "MemtoReg", at: [1283, 470], len: 16, value: (v) => bit(v.c.mem_to_reg) },
  { id: "s-branch", name: "Branch", at: [1033, 330], len: -18, value: (v) => bit(v.c.branch), anchor: "start" },
  { id: "s-jump", name: "Jump", at: [1123, 100], len: 14, value: (v) => bit(v.c.jump) },
];

const CONTROL_ROWS: { name: string; value: (c: Control) => string }[] = [
  { name: "RegDst", value: (c) => bit(c.reg_dst) },
  { name: "ALUSrc", value: (c) => bit(c.alu_src) },
  { name: "MemtoReg", value: (c) => bit(c.mem_to_reg) },
  { name: "RegWrite", value: (c) => bit(c.reg_write) },
  { name: "MemRead", value: (c) => bit(c.mem_read) },
  { name: "MemWrite", value: (c) => bit(c.mem_write) },
  { name: "Branch", value: (c) => bit(c.branch) },
  { name: "Jump", value: (c) => bit(c.jump) },
  { name: "JumpReg", value: (c) => bit(c.jump_reg) },
  { name: "Link", value: (c) => bit(c.link) },
  { name: "ALUOp", value: (c) => c.alu_op },
];

// ---------- Drawing ----------

export const VIEW_W = 1460;
export const VIEW_H = 820;

function box(x: number, y: number, w: number, h: number, cls: string, title: string): SVGRectElement {
  return s("rect", { x, y, width: w, height: h, class: `block ${cls}` }, s("title", {}, title));
}

function text(x: number, y: number, str: string, cls: string, anchor = "middle"): SVGTextElement {
  return s("text", { x, y, class: cls, "text-anchor": anchor }, str);
}

/** ALU / adder outline: the notched trapezoid from the lecture figures. */
function aluShape(x: number, y: number, w: number, h: number, cls: string, title: string): SVGPathElement {
  const notch = h * 0.18;
  const mid = y + h / 2;
  const d = [
    `M ${x} ${y}`,
    `L ${x + w} ${y + h * 0.25}`,
    `L ${x + w} ${y + h * 0.75}`,
    `L ${x} ${y + h}`,
    `L ${x} ${mid + notch}`,
    `L ${x + w * 0.28} ${mid}`,
    `L ${x} ${mid - notch}`,
    "Z",
  ].join(" ");
  return s("path", { d, class: `block ${cls}` }, s("title", {}, title));
}

function muxShape(m: Mux): SVGGElement {
  const w = 26;
  const r = w / 2;
  const g = s("g", { class: "mux", id: m.id });
  g.append(
    s("path", {
      d: `M ${m.x} ${m.y + r} A ${r} ${r} 0 0 1 ${m.x + w} ${m.y + r} L ${m.x + w} ${m.y + m.h - r} A ${r} ${r} 0 0 1 ${m.x} ${m.y + m.h - r} Z`,
      class: "block mux-body",
    }),
  );
  m.inputs.forEach((inp, i) => {
    g.append(text(m.x + 6, inp.y, inp.label, `mux-in mux-in-${i}`, "start"));
  });
  // Selector line drawn inside the mux, from the chosen input to the output.
  g.append(s("path", { d: "", class: "mux-sel" }));
  return g;
}

function wireNode(w: WireDef): SVGGElement {
  const g = s("g", { class: `wire${w.field ? ` f-${w.field}` : ""}`, "data-id": w.id, "data-phase": w.phase });
  g.append(s("title", {}, w.title));
  if (w.arrow ?? true) {
    const tip = w.pts[w.pts.length - 1]!;
    const head = arrowHead(w.pts[w.pts.length - 2]!, tip);
    g.append(s("path", { d: pathOf([...w.pts.slice(0, -1), head.base]), class: "w-line", pathLength: 1 }), s("path", { d: head.d, class: "w-head" }));
  } else {
    g.append(s("path", { d: pathOf(w.pts), class: "w-line", pathLength: 1 }));
  }
  for (const [x, y] of w.dots ?? []) g.append(s("circle", { cx: x, cy: y, r: 3.6, class: "w-dot" }));
  if (w.bits) g.append(text(w.bits.at[0], w.bits.at[1], w.bits.text, "w-bits", "start"));
  if (w.tag) {
    const t = s("g", { class: "tag", transform: `translate(${w.tag.at[0]} ${w.tag.at[1]})` });
    t.append(s("rect", { x: -20, y: -9, width: 40, height: 18, class: "tag-box" }), text(0, 0.5, "", "tag-text"));
    g.append(t);
  }
  return g;
}

function flagNode(f: FlagDef): SVGGElement {
  const [x, y] = f.to;
  const g = s("g", { class: "wire flag", "data-id": f.id, "data-phase": f.phase });
  g.append(
    s("title", {}, f.title),
    s("path", { d: `M ${x - f.len} ${y} L ${x - HEAD} ${y}`, class: "w-line", pathLength: 1 }),
    s("path", { d: arrowHead([x - f.len, y], [x, y]).d, class: "w-head" }),
    text(x - f.len - 4, y, f.text, "flag-text", "end"),
  );
  return g;
}

function stubNode(st: Stub): SVGGElement {
  const [x, y] = st.at;
  const top = y - st.len;
  const g = s("g", { class: "stub", "data-id": st.id });
  const anchor = st.anchor ?? "middle";
  const labelY = st.len > 0 ? top - 9 : top + 9;
  const labelX = anchor === "start" ? x + 4 : x;
  g.append(
    s("line", { x1: x, y1: y, x2: x, y2: top, class: "stub-line" }),
    s("text", { x: labelX, y: labelY, class: "stub-text", "text-anchor": anchor }, s("tspan", { class: "stub-name" }, st.name + " "), s("tspan", { class: "stub-val" }, "")),
  );
  return g;
}

export interface Diagram {
  svg: SVGSVGElement;
  /** Redraw for a new instruction. `upTo` limits lit wires to phases ≤ upTo. */
  update(v: View, upTo: Phase): void;
}

export function createDiagram(): Diagram {
  const svg = s("svg", { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, class: "datapath", role: "group" });

  // Wires go under the units so units hide wire ends.
  const wires = s("g", { class: "wires" });
  for (const w of WIRES) wires.append(wireNode(w));
  for (const f of FLAGS) wires.append(flagNode(f));
  svg.append(wires);

  const units = s("g", { class: "units" });

  // PC
  units.append(
    box(46, 400, 64, 110, "register", "Program counter"),
    text(78, 448, "PC", "unit-title"),
    text(78, 472, "", "unit-value", "middle"),
  );
  units.lastElementChild!.setAttribute("id", "pc-value");

  // PC + 4 adder
  units.append(aluShape(180, 70, 56, 110, "unit", "PC + 4 adder"), text(214, 125, "Add", "unit-small"));

  // Instruction memory
  units.append(
    box(150, 360, 150, 190, "memory", "Instruction memory"),
    text(225, 384, "Instruction", "unit-title"),
    text(225, 404, "memory", "unit-title"),
    text(156, 455, "Read", "port", "start"),
    text(156, 470, "address", "port", "start"),
    text(294, 440, "Instruction", "port", "end"),
    text(225, 505, "", "unit-value mono"),
    text(225, 527, "", "unit-asm mono"),
  );
  units.children[units.children.length - 2]!.setAttribute("id", "im-word");
  units.lastElementChild!.setAttribute("id", "im-asm");

  // Jump: shift left 2 and concatenate with PC + 4 [31-28]
  units.append(
    box(390, 30, 80, 28, "unit", "Shift left 2 (jump target × 4)"),
    text(430, 44, "Shift left 2", "unit-small"),
    box(520, 26, 120, 36, "unit", "Concatenate: PC+4 [31-28] with target × 4"),
    text(580, 44, "{ PC+4, · }", "unit-small mono"),
  );

  // Control
  const ctl = s("g", { id: "control" });
  ctl.append(
    box(390, 140, 130, 232, "unit", "Main control unit"),
    text(455, 158, "Control", "block-label"),
    s("line", { x1: 390, y1: 172, x2: 520, y2: 172, class: "ctl-rule" }),
  );
  CONTROL_ROWS.forEach((row, i) => {
    const y = 186 + i * 16.8;
    ctl.append(
      text(400, y, row.name, "ctl-name", "start"),
      s("text", { x: 510, y, class: "ctl-val", "text-anchor": "end", "data-row": i }, ""),
    );
  });
  units.append(ctl);

  // Register file
  units.append(
    box(560, 370, 170, 210, "register", "Register file"),
    text(645, 475, "Registers", "unit-title"),
    text(566, 400, "Read reg 1", "port", "start"),
    text(566, 440, "Read reg 2", "port", "start"),
    text(566, 507, "Write reg", "port", "start"),
    text(566, 550, "Write data", "port", "start"),
    text(724, 405, "Read data 1", "port", "end"),
    text(724, 505, "Read data 2", "port", "end"),
  );

  // Sign-extend
  units.append(
    s("ellipse", { cx: 645, cy: 650, rx: 40, ry: 26, class: "block unit" }, s("title", {}, "Sign-extend (zero-extend for andi, ori, lui)")),
    text(645, 643, "Sign-", "unit-small"),
    text(645, 659, "extend", "unit-small"),
  );

  // Branch: shift left 2, adder, AND gate
  units.append(
    box(815, 290, 50, 30, "unit", "Shift left 2 (branch offset × 4)"),
    text(840, 305, "<< 2", "unit-small mono"),
    aluShape(880, 170, 56, 110, "unit", "Branch target adder"),
    text(914, 225, "Add", "unit-small"),
  );
  // AND gate pointing up: Branch · Zero (bne inverts Zero).
  units.append(
    s(
      "path",
      { d: "M 1003 330 L 1003 306 A 20 20 0 0 1 1043 306 L 1043 330 Z", class: "block unit", id: "gate" },
      s("title", {}, "Branch taken: Branch AND Zero (beq) / Branch AND NOT Zero (bne)"),
    ),
    s("circle", { cx: 1013, cy: 334, r: 4, class: "block bubble", id: "bne-bubble" }),
  );

  // ALU and ALU control
  units.append(
    aluShape(870, 380, 90, 190, "unit", "ALU"),
    text(930, 475, "ALU", "unit-title"),
    s("text", { x: 930, y: 497, class: "unit-op mono", "text-anchor": "middle", id: "alu-op" }, ""),
    text(954, 445, "Zero", "port", "end"),
    text(954, 513, "result", "port", "end"),
    s("ellipse", { cx: 915, cy: 690, rx: 48, ry: 26, class: "block unit" }, s("title", {}, "ALU control")),
    text(915, 683, "ALU", "unit-small"),
    text(915, 699, "control", "unit-small"),
  );

  // Data memory
  units.append(
    box(1040, 400, 170, 200, "memory", "Data memory"),
    text(1125, 450, "Data", "unit-title"),
    text(1125, 470, "memory", "unit-title"),
    text(1046, 500, "Address", "port", "start"),
    text(1046, 570, "Write data", "port", "start"),
    text(1204, 490, "Read data", "port", "end"),
  );

  for (const m of MUXES) units.append(muxShape(m));
  for (const st of STUBS) units.append(stubNode(st));
  // ALUOp from control into ALU control (left side).
  units.append(
    s("g", { class: "stub", "data-id": "s-aluop" },
      s("line", { x1: 840, y1: 690, x2: 867, y2: 690, class: "stub-line" }),
      s("text", { x: 836, y: 690, class: "stub-text", "text-anchor": "end" }, s("tspan", { class: "stub-name" }, "ALUOp "), s("tspan", { class: "stub-val" }, "")),
    ),
  );

  svg.append(units);

  // ---------- update ----------

  const wireEls = new Map<string, SVGGElement>();
  svg.querySelectorAll<SVGGElement>("g.wire").forEach((g) => wireEls.set(g.dataset.id!, g));

  function setText(sel: string, value: string): void {
    const el = svg.querySelector(sel);
    if (el) el.textContent = value;
  }

  function update(v: View, upTo: Phase): void {
    const u = usage(v);

    for (const w of WIRES) {
      const g = wireEls.get(w.id)!;
      const active = w.on(u, v);
      g.classList.toggle("on", active && w.phase <= upTo);
      g.classList.toggle("used", active);
      if (w.tag) {
        const val = active && w.phase <= upTo ? w.tag.value(v) : null;
        const tg = g.querySelector<SVGGElement>(".tag")!;
        tg.style.display = val === null ? "none" : "";
        if (val !== null) {
          tg.querySelector("text")!.textContent = val;
          const width = Math.max(22, val.length * 8.2 + 10);
          const r = tg.querySelector("rect")!;
          r.setAttribute("x", String(-width / 2));
          r.setAttribute("width", String(width));
        }
      }
    }
    for (const f of FLAGS) {
      const g = wireEls.get(f.id)!;
      const active = f.on(u, v);
      g.classList.toggle("on", active && f.phase <= upTo);
      g.classList.toggle("used", active);
    }

    for (const m of MUXES) {
      const g = svg.querySelector<SVGGElement>(`#${m.id}`)!;
      const pick = upTo >= 1 ? m.pick(u, v) : null;
      const sel = g.querySelector(".mux-sel")!;
      if (pick === null) {
        sel.setAttribute("d", "");
      } else {
        const outY = m.y + m.h / 2;
        const inY = m.inputs[pick]!.y;
        sel.setAttribute("d", `M ${m.x + 2} ${inY} L ${m.x + 24} ${outY}`);
      }
      g.classList.toggle("idle", pick === null);
      m.inputs.forEach((_, i) => g.querySelector(`.mux-in-${i}`)!.classList.toggle("picked", i === pick));
    }

    // Control values appear once the instruction is decoded.
    const decoded = upTo >= 1 && u.known;
    svg.querySelectorAll<SVGTextElement>(".ctl-val").forEach((el) => {
      const row = CONTROL_ROWS[Number(el.dataset.row)]!;
      const val = decoded ? row.value(v.c) : "";
      el.textContent = val;
      el.classList.toggle("hi", val !== "0" && val !== "");
    });
    for (const st of STUBS) {
      const g = svg.querySelector<SVGGElement>(`[data-id="${st.id}"]`)!;
      const val = decoded ? st.value(v) : "";
      g.querySelector(".stub-val")!.textContent = val;
      g.classList.toggle("hi", val === "1");
    }
    const aluop = svg.querySelector<SVGGElement>('[data-id="s-aluop"]')!;
    aluop.querySelector(".stub-val")!.textContent = decoded && u.aluUsed ? v.c.alu_op : "";
    aluop.classList.toggle("hi", decoded && u.aluUsed);

    setText("#pc-value", addr(v.pc));
    setText("#im-word", "0x" + (v.d.raw >>> 0).toString(16).toUpperCase().padStart(8, "0"));
    setText("#im-asm", u.known ? v.d.disassembly : "not supported");
    setText("#alu-op", upTo >= 2 && u.aluUsed ? v.c.alu_op : "");
    svg.querySelector("#bne-bubble")!.classList.toggle("shown", v.d.mnemonic === "bne");
    svg.classList.toggle("unknown", !u.known);
    svg.setAttribute("aria-label", `Single-cycle datapath: ${u.known ? v.d.disassembly : "unsupported instruction"}`);
  }

  return { svg, update };
}
