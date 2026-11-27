// The datapath figure, kept minimal: a handful of big blocks joined by thick, named buses,
// with the values written large inside the blocks and on the buses.
// Which buses carry a signal comes from mips::control_for(); every value shown comes
// from Cpu::step()'s StepTrace (or, before a step, only from decode and register reads).

import type { Control, DecodedWord, Trace } from "../../shared/core";

// ---------- What one drawing shows ----------

export interface View {
  d: DecodedWord;
  c: Control;
  /** null before the instruction has run (preview of the word at the PC). */
  t: Trace | null;
  regName: (r: number) => string;
  /** Address of this instruction. */
  pc: number;
  /** Register values read before the step (shown in the preview). */
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
  return {
    known,
    shift,
    aluUsed,
    readsRs: known && !(c.jump && !c.jump_reg) && !shift && !lui,
    readsRt: known && ((d.format === "R" && !c.jump_reg) || c.branch || c.mem_write),
    aluA: aluUsed && !lui,
    aluBReg: aluUsed && !c.alu_src && !shift,
    aluBImm: aluUsed && (c.alu_src || shift),
    mem: c.mem_read || c.mem_write,
    wbAlu: c.reg_write && !c.mem_to_reg && !c.link,
    wbMem: c.mem_to_reg,
    nextFromCtl: c.branch || (c.jump && !c.jump_reg),
  };
}
type Usage = ReturnType<typeof usage>;

// ---------- Formatting ----------

const dec = (v: number) => String(v | 0);
const addr = (v: number) => "0x" + (v >>> 0).toString(16).toUpperCase();
const hex8 = (v: number) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(8, "0");

function immValue(v: View): number {
  return ZERO_EXT.has(v.d.mnemonic) ? v.d.imm_zext : v.d.imm_sext;
}

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

const HEAD = 12;
/** Arrowhead at the last point; the line stops at its base so the tip stays sharp. */
function withHead(pts: readonly Pt[]): { line: string; head: string } {
  const tip = pts[pts.length - 1]!;
  const from = pts[pts.length - 2]!;
  const dx = Math.sign(tip[0] - from[0]);
  const dy = Math.sign(tip[1] - from[1]);
  const base: Pt = [tip[0] - dx * HEAD, tip[1] - dy * HEAD];
  const w = 6.5;
  const a: Pt = [base[0] + dy * w, base[1] - dx * w];
  const b: Pt = [base[0] - dy * w, base[1] + dx * w];
  return {
    line: pathOf([...pts.slice(0, -1), base]),
    head: `M ${a[0]} ${a[1]} L ${tip[0]} ${tip[1]} L ${b[0]} ${b[1]} Z`,
  };
}

function text(x: number, y: number, str: string, cls: string, anchor = "middle"): SVGTextElement {
  return s("text", { x, y, class: cls, "text-anchor": anchor }, str);
}

// ---------- Buses ----------

interface Bus {
  id: string;
  name: string;
  pts: readonly Pt[];
  phase: Phase;
  on: (u: Usage, v: View) => boolean;
  arrow?: boolean;
  dots?: readonly Pt[];
  /** Bus name printed beside it. */
  label?: { at: Pt; anchor?: "start" | "middle" | "end" };
  /** Value tag on the bus. */
  tag?: { at: Pt; value: (v: View, u: Usage) => string | null };
}

const BUSES: Bus[] = [
  // Fetch
  {
    id: "pc-im",
    name: "PC → instruction memory",
    pts: [[125, 460], [125, 372]],
    phase: 0,
    on: () => true,
  },
  {
    id: "im-ctl",
    name: "Instruction",
    pts: [[212, 230], [290, 230]],
    phase: 0,
    on: (u) => u.known,
  },
  {
    id: "im-regs",
    name: "Register numbers",
    pts: [[240, 230], [240, 400], [290, 400]],
    dots: [[240, 230]],
    phase: 0,
    on: (u) => u.readsRs || u.readsRt || u.known,
  },

  // Decode
  {
    id: "rs",
    name: "Register value A",
    pts: [[570, 370], [680, 370]],
    phase: 1,
    on: (u) => u.aluA,
  },
  {
    id: "rt",
    name: "Register value B (rt)",
    pts: [[570, 440], [605, 440], [605, 460], [640, 460]],
    phase: 1,
    on: (u) => u.aluBReg,
  },
  {
    id: "imm",
    name: "Immediate",
    pts: [[570, 240], [625, 240], [625, 490], [640, 490]],
    phase: 1,
    on: (u) => u.aluBImm,
    label: { at: [633, 228], anchor: "start" },
    tag: { at: [625, 318], value: (v) => (SHIFTS.has(v.d.mnemonic) ? String(v.d.shamt) : dec(immValue(v))) },
  },
  {
    id: "ctl-next",
    name: "Offset / target",
    pts: [[570, 150], [680, 150]],
    phase: 1,
    on: (u) => u.nextFromCtl,
    label: { at: [625, 136] },
  },

  // Execute
  {
    id: "mux-alu",
    name: "ALU input B",
    pts: [[658, 475], [680, 475]],
    phase: 2,
    on: (u) => u.aluUsed,
  },
  {
    id: "alu-out",
    name: "ALU result",
    pts: [[830, 420], [1010, 420]],
    phase: 2,
    on: (u) => u.mem || u.wbAlu,
    label: { at: [896, 442] },
    tag: { at: [884, 420], value: (v, u) => (v.t ? (u.mem ? addr(v.t.alu_result) : dec(v.t.alu_result)) : null) },
  },
  {
    id: "zero",
    name: "Zero",
    pts: [[755, 335], [755, 212]],
    phase: 2,
    on: (_u, v) => v.c.branch,
    label: { at: [767, 290], anchor: "start" },
    tag: { at: [755, 250], value: (v) => (v.t ? (v.t.alu_zero ? "1" : "0") : null) },
  },

  // Memory
  {
    id: "wdata",
    name: "Write data",
    pts: [[590, 440], [590, 560], [985, 560], [985, 470], [1010, 470]],
    dots: [[590, 440]],
    phase: 3,
    on: (_u, v) => v.c.mem_write,
    label: { at: [780, 546] },
    tag: { at: [880, 560], value: (v) => dec(v.t ? v.t.rt_value : v.rtValue) },
  },

  // Write back
  {
    id: "mem-wb",
    name: "Read data",
    pts: [[1090, 502], [1090, 600], [950, 600]],
    arrow: false,
    phase: 4,
    on: (u) => u.wbMem,
  },
  {
    id: "alu-wb",
    name: "ALU result → write back",
    pts: [[950, 420], [950, 600]],
    arrow: false,
    dots: [[950, 420]],
    phase: 4,
    on: (u) => u.wbAlu,
  },
  {
    id: "wb",
    name: "Write back",
    pts: [[950, 600], [430, 600], [430, 532]],
    dots: [[950, 600]],
    phase: 4,
    on: (_u, v) => v.c.reg_write,
    label: { at: [560, 586] },
    tag: { at: [700, 600], value: (v) => (v.t && v.t.reg_written ? dec(v.t.reg_value) : null) },
  },
  {
    id: "next-pc",
    name: "Next PC",
    pts: [[912, 155], [940, 155], [940, 36], [24, 36], [24, 505], [50, 505]],
    phase: 4,
    on: () => true,
    label: { at: [300, 22] },
    tag: { at: [480, 36], value: (v) => (v.t ? addr(v.t.next_pc) : null) },
  },
];

const SIGNALS: [keyof Control, string][] = [
  ["reg_write", "RegWrite"],
  ["reg_dst", "RegDst"],
  ["alu_src", "ALUSrc"],
  ["mem_read", "MemRead"],
  ["mem_write", "MemWrite"],
  ["mem_to_reg", "MemtoReg"],
  ["branch", "Branch"],
  ["jump", "Jump"],
  ["jump_reg", "JumpReg"],
  ["link", "Link"],
];

// ---------- Drawing ----------

export const VIEW_W = 1200;
export const VIEW_H = 630;

export interface Diagram {
  svg: SVGSVGElement;
  /** Redraw for an instruction, lighting buses of phases ≤ upTo. */
  update(v: View, upTo: Phase): void;
}

function busNode(b: Bus): SVGGElement {
  const g = s("g", { class: "bus", "data-id": b.id, "data-phase": b.phase });
  g.append(s("title", {}, b.name));
  if (b.arrow ?? true) {
    const h = withHead(b.pts);
    g.append(s("path", { d: h.line, class: "b-line", pathLength: 1 }), s("path", { d: h.head, class: "b-head" }));
  } else {
    g.append(s("path", { d: pathOf(b.pts), class: "b-line", pathLength: 1 }));
  }
  for (const [x, y] of b.dots ?? []) g.append(s("circle", { cx: x, cy: y, r: 5, class: "b-dot" }));
  if (b.label) g.append(text(b.label.at[0], b.label.at[1], b.name, "b-label", b.label.anchor ?? "middle"));
  if (b.tag) {
    const t = s("g", { class: "tag", transform: `translate(${b.tag.at[0]} ${b.tag.at[1]})` });
    t.append(s("rect", { x: -20, y: -12, width: 40, height: 24, rx: 3, class: "tag-box" }), text(0, 1, "", "tag-text"));
    g.append(t);
  }
  return g;
}

export function createDiagram(): Diagram {
  const svg = s("svg", { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, class: "datapath", role: "group" });

  // CPU outline
  svg.append(
    s("rect", { x: 250, y: 66, width: 722, height: 512, class: "cpu-frame" }),
    text(268, 90, "CPU", "cpu-label", "start"),
  );

  const buses = s("g", { class: "buses" });
  for (const b of BUSES) buses.append(busNode(b));
  svg.append(buses);

  const units = s("g", { class: "units" });
  const unit = (id: string, ...kids: SVGElement[]) => {
    const g = s("g", { class: "unit", id }, ...kids);
    units.append(g);
    return g;
  };

  // PC
  unit(
    "u-pc",
    s("rect", { x: 50, y: 460, width: 150, height: 90, class: "box k-reg" }),
    text(125, 484, "PC", "u-title"),
    s("text", { x: 125, y: 522, class: "u-big", "text-anchor": "middle", "data-v": "pc" }),
  );

  // Instruction memory
  unit(
    "u-im",
    s("rect", { x: 40, y: 200, width: 172, height: 172, class: "box k-mem" }),
    text(126, 224, "Instruction memory", "u-title"),
    s("text", { x: 126, y: 290, class: "u-mid", "text-anchor": "middle", "data-v": "word" }),
    s("text", { x: 126, y: 326, class: "u-small", "text-anchor": "middle", "data-v": "asm" }),
  );

  // Control
  unit(
    "u-ctl",
    s("rect", { x: 290, y: 100, width: 280, height: 170, class: "box k-ctl" }),
    text(306, 124, "Control", "u-title", "start"),
    s("text", { x: 430, y: 168, class: "u-asm", "text-anchor": "middle", "data-v": "ctl-asm" }),
    s("g", { class: "chips", "data-v": "chips" }),
  );

  // Registers
  const regs = unit(
    "u-regs",
    s("rect", { x: 290, y: 330, width: 280, height: 202, class: "box k-reg" }),
    text(306, 354, "Registers", "u-title", "start"),
  );
  ([
    ["rs", 392, "read"],
    ["rt", 440, "read"],
    ["wr", 498, "write"],
  ] as const).forEach(([key, y, role]) => {
    regs.append(
      s(
        "g",
        { class: "reg-row", "data-row": key },
        text(306, y, role, "r-role", "start"),
        s("text", { x: 362, y, class: "r-name", "text-anchor": "start" }),
        s("text", { x: 554, y, class: "r-val", "text-anchor": "end" }),
      ),
    );
  });
  regs.append(s("line", { x1: 300, y1: 468, x2: 560, y2: 468, class: "r-rule" }));

  // ALU B select
  unit("u-mux", s("rect", { x: 640, y: 446, width: 18, height: 58, rx: 9, class: "box k-mux" }));

  // ALU
  unit(
    "u-alu",
    s("path", {
      d: "M 680 305 L 830 365 L 830 475 L 680 535 L 680 445 L 712 420 L 680 395 Z",
      class: "box k-alu",
    }),
    text(772, 372, "ALU", "u-title"),
    s("text", { x: 772, y: 412, class: "u-asm", "text-anchor": "middle", "data-v": "alu-op" }),
    s("text", { x: 772, y: 448, class: "u-small", "text-anchor": "middle", "data-v": "alu-in" }),
  );

  // Next PC
  unit(
    "u-next",
    s("rect", { x: 680, y: 100, width: 232, height: 112, class: "box k-ctl" }),
    text(696, 124, "Next PC", "u-title", "start"),
    s("text", { x: 796, y: 164, class: "u-big", "text-anchor": "middle", "data-v": "next" }),
    s("text", { x: 796, y: 194, class: "u-small", "text-anchor": "middle", "data-v": "next-why" }),
  );

  // Data memory
  unit(
    "u-dm",
    s("rect", { x: 1010, y: 300, width: 160, height: 202, class: "box k-mem" }),
    text(1090, 324, "Data memory", "u-title"),
    s("text", { x: 1090, y: 372, class: "u-small", "text-anchor": "middle", "data-v": "dm-op" }),
    s("text", { x: 1090, y: 404, class: "u-mid", "text-anchor": "middle", "data-v": "dm-addr" }),
    s("text", { x: 1090, y: 452, class: "u-big", "text-anchor": "middle", "data-v": "dm-val" }),
  );

  svg.append(units);

  // ---------- update ----------

  const busEls = new Map<string, SVGGElement>();
  svg.querySelectorAll<SVGGElement>("g.bus").forEach((g) => busEls.set(g.dataset.id!, g));
  const field = (key: string) => svg.querySelector<SVGTextElement>(`[data-v="${key}"]`)!;

  function setRow(key: "rs" | "rt" | "wr", show: boolean, name: string, val: string, cls: string): void {
    const row = svg.querySelector<SVGGElement>(`[data-row="${key}"]`)!;
    row.classList.toggle("off", !show);
    const nameEl = row.querySelector(".r-name")!;
    nameEl.textContent = show ? name : "—";
    nameEl.setAttribute("class", `r-name ${show ? cls : ""}`);
    row.querySelector(".r-val")!.textContent = show ? val : "";
  }

  function update(v: View, upTo: Phase): void {
    const u = usage(v);
    const ran = v.t;

    for (const b of BUSES) {
      const g = busEls.get(b.id)!;
      const lit = b.on(u, v) && b.phase <= upTo;
      g.classList.toggle("on", lit);
      if (b.tag) {
        const val = lit ? b.tag.value(v, u) : null;
        const tg = g.querySelector<SVGGElement>(".tag")!;
        tg.style.display = val === null ? "none" : "";
        if (val !== null) {
          tg.querySelector("text")!.textContent = val;
          const w = Math.max(28, val.length * 9.6 + 14);
          const r = tg.querySelector("rect")!;
          r.setAttribute("x", String(-w / 2));
          r.setAttribute("width", String(w));
        }
      }
    }

    // Units the instruction doesn't touch fade back.
    const decoded = upTo >= 1;
    svg.querySelector("#u-alu")!.classList.toggle("idle", !u.aluUsed || upTo < 2);
    svg.querySelector("#u-mux")!.classList.toggle("idle", !u.aluUsed || upTo < 2);
    svg.querySelector("#u-dm")!.classList.toggle("idle", !u.mem || upTo < 3);
    svg.querySelector("#u-ctl")!.classList.toggle("idle", !decoded);
    svg.querySelector("#u-regs")!.classList.toggle("idle", !decoded);

    field("pc").textContent = addr(v.pc);
    field("word").textContent = hex8(v.d.raw);
    field("asm").textContent = u.known ? v.d.disassembly : "not supported";

    // Control: the instruction, and only the signals that are on.
    field("ctl-asm").textContent = decoded ? (u.known ? v.d.disassembly : "?") : "";
    const chips = field("chips");
    chips.replaceChildren();
    if (decoded && u.known) {
      let x = 306;
      let y = 214;
      const on = SIGNALS.filter(([k]) => v.c[k] === true).map(([, n]) => n);
      if (u.aluUsed) on.push(`ALU ${v.c.alu_op}`);
      for (const name of on) {
        const w = name.length * 7 + 18;
        if (x + w > 556) {
          x = 306;
          y += 28;
        }
        chips.append(
          s("rect", { x, y: y - 11, width: w, height: 22, rx: 11, class: "chip" }),
          text(x + w / 2, y + 1, name, "chip-text"),
        );
        x += w + 6;
      }
    }

    // Registers: what is read and what is written.
    const rn = v.regName;
    setRow("rs", decoded && u.readsRs, rn(v.d.rs), dec(ran ? ran.rs_value : v.rsValue), "f-rs");
    setRow("rt", decoded && (u.readsRt || u.shift), rn(v.d.rt), dec(ran ? ran.rt_value : v.rtValue), "f-rt");
    const dest = ran && ran.reg_written ? ran.reg_dest : v.c.link ? 31 : v.c.reg_dst ? v.d.rd : v.d.rt;
    const wbVal = ran && ran.reg_written && upTo >= 4 ? dec(ran.reg_value) : "…";
    setRow("wr", decoded && v.c.reg_write, rn(dest), wbVal, v.c.reg_dst ? "f-rd" : "f-rt");

    field("alu-op").textContent = u.aluUsed && upTo >= 2 ? v.c.alu_op : "";
    // The two operands, as the ALU saw them (from the trace once the step has run).
    let ins = "";
    if (u.aluUsed && upTo >= 1) {
      const a = ran ? ran.alu_a : u.shift ? v.rtValue : v.rsValue;
      const b = ran ? ran.alu_b : u.aluBImm ? (u.shift ? v.d.shamt : immValue(v)) : v.rtValue;
      ins = u.aluA ? `${dec(a)}, ${dec(b)}` : dec(b);
    }
    field("alu-in").textContent = ins;

    // Next PC: value and the reason.
    field("next").textContent = upTo >= 4 && ran ? addr(ran.next_pc) : "";
    let why = "PC + 4";
    if (v.c.jump_reg) why = `jr: from ${rn(v.d.rs)}`;
    else if (v.c.jump) why = v.c.link ? "jump and link" : "jump";
    else if (v.c.branch) why = ran ? (ran.branch_taken ? "branch taken" : "branch not taken") : "branch?";
    field("next-why").textContent = upTo >= 2 || !v.c.branch ? why : "";

    // Data memory: the one word touched.
    const memShown = u.mem && upTo >= 3;
    field("dm-op").textContent = memShown ? (v.c.mem_write ? "write" : "read") : "";
    field("dm-addr").textContent = memShown && ran ? `[${addr(ran.mem_addr)}]` : "";
    field("dm-val").textContent = memShown && ran ? dec(v.c.mem_write ? ran.rt_value : ran.mem_data) : "";

    svg.setAttribute("aria-label", `Datapath: ${u.known ? v.d.disassembly : "unsupported instruction"}`);
  }

  return { svg, update };
}
