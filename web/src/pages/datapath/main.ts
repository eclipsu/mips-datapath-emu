// Datapath page: load a program into a mips::Cpu (WebAssembly), step it, and watch each
// instruction travel the single-cycle datapath. Which wires light up comes from
// mips::control_for(); every value on a wire comes from the StepTrace that Cpu::step() returns.

import "../../styles/base.css";
import "./datapath.css";

import { loadCore, type Core, type Machine, type Trace } from "../../shared/core";
import { navLinks, showLoadError } from "../../shared/frame";
import { createDiagram, PHASES, type Phase, type View } from "./diagram";

// ---------- Programs ----------

const PROGRAMS: { name: string; source: string }[] = [
  {
    name: "add, store, load",
    source: `# tests/test_cpu.cpp: RunsAddLoadStoreProgram
0x20080005  # addi $t0, $zero, 5
0x20090007  # addi $t1, $zero, 7
0x01095020  # add  $t2, $t0, $t1
0xAC0A0100  # sw   $t2, 0x100($zero)
0x8C0B0100  # lw   $t3, 0x100($zero)`,
  },
  {
    name: "loop: sum 3 + 2 + 1",
    source: `0x20080003  # addi $t0, $zero, 3      counter
0x20090000  # addi $t1, $zero, 0      sum
0x01284820  # add  $t1, $t1, $t0      loop:
0x2108FFFF  # addi $t0, $t0, -1
0x1500FFFD  # bne  $t0, $zero, loop   (offset -3)
0xAC090100  # sw   $t1, 0x100($zero)`,
  },
  {
    name: "call and return (jal, jr)",
    source: `0x20040006  # addi $a0, $zero, 6
0x0C000004  # jal  0x10               double($a0)
0xAC020100  # sw   $v0, 0x100($zero)
0x08000003  # j    0xC                halt: jump to self
0x00841020  # add  $v0, $a0, $a0      0x10: double
0x03E00008  # jr   $ra`,
  },
  {
    name: "logic and shifts",
    source: `0x3C081234  # lui  $t0, 0x1234
0x35085678  # ori  $t0, $t0, 0x5678
0x00084900  # sll  $t1, $t0, 4
0x01095024  # and  $t2, $t0, $t1
0x0128582A  # slt  $t3, $t1, $t0
0x280CFFFF  # slti $t4, $zero, -1`,
  },
];

const MEM_BYTES = 4096;
const MEM_ROWS = 8;
const RUN_DELAY_MS = 1400;
const PHASE_MS = 360;

// ---------- Helpers ----------

const hex8 = (v: number) => "0x" + (v >>> 0).toString(16).toUpperCase().padStart(8, "0");
const addr = (v: number) => "0x" + (v >>> 0).toString(16).toUpperCase();
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Parsed = { ok: true; words: number[] } | { ok: false; error: string };

function parseProgram(src: string): Parsed {
  const words: number[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.replace(/#.*/, "").trim().replace(/_/g, "").toLowerCase();
    if (!t) continue;
    const body = t.startsWith("0x") ? t.slice(2) : t;
    if (!/^[0-9a-f]{1,8}$/.test(body)) return { ok: false, error: `Line ${i + 1}: expected a hex word, got "${t}".` };
    words.push(parseInt(body, 16) >>> 0);
  }
  if (words.length === 0) return { ok: false, error: "The program is empty." };
  if (words.length * 4 > MEM_BYTES) return { ok: false, error: "Too long for memory." };
  return { ok: true, words };
}

function parseNumber(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^-?\d+$/.test(t)) return Number(t) >>> 0;
  if (/^0x[0-9a-f]{1,8}$/.test(t)) return parseInt(t.slice(2), 16) >>> 0;
  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// ---------- Page ----------

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  const nav = navLinks("datapath");
  if (nav) $("toolbar").prepend(nav);

  let core: Core;
  try {
    core = await loadCore();
  } catch (err) {
    showLoadError(stage, err);
    return;
  }

  const select = $<HTMLSelectElement>("programs");
  const stepBtn = $<HTMLButtonElement>("step");
  const runBtn = $<HTMLButtonElement>("run");
  const resetBtn = $<HTMLButtonElement>("reset");
  const phasesEl = $("phases");
  const status = $("status");
  const notice = $("notice");
  const listing = $("listing");
  const source = $<HTMLTextAreaElement>("source");
  const sourceError = $("source-error");
  const regsEl = $("regs");
  const memBase = $<HTMLInputElement>("mem-base");
  const memTable = $<HTMLTableElement>("mem");

  const diagram = createDiagram();
  $("figure").append(diagram.svg);

  PROGRAMS.forEach((p, i) => select.append(new Option(p.name, String(i))));
  select.append(new Option("custom", "custom"));

  // ---- State ----
  let machine: Machine | null = null;
  let program: number[] = [];
  let cycle = 0;
  let last: Trace | null = null;
  let view: View | null = null;
  let anim: number[] = [];
  let runTimer = 0;

  // ---- Phase bar ----
  const phaseBtns = PHASES.map((name, i) => {
    const b = el("button", "", name);
    b.type = "button";
    b.addEventListener("click", () => {
      stopAnim();
      showPhase(i as Phase, false);
    });
    const li = el("li");
    li.append(b);
    phasesEl.append(li);
    return b;
  });

  function showPhase(p: Phase, animate: boolean): void {
    if (!view) return;
    const before = new Set([...diagram.svg.querySelectorAll(".wire.on")]);
    diagram.update(view, p);
    diagram.svg.querySelectorAll(".wire").forEach((w) => {
      w.classList.toggle("draw", animate && w.classList.contains("on") && !before.has(w));
    });
    phaseBtns.forEach((b, i) => {
      b.classList.toggle("done", i < p);
      if (i === p) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
  }

  function stopAnim(): void {
    anim.forEach(clearTimeout);
    anim = [];
  }

  // ---- Building a view of one instruction ----
  function viewOf(word: number, pc: number, t: Trace | null): View {
    const d = core.decode(word);
    return {
      d,
      c: core.control(word),
      t,
      pc,
      regName: (r) => core.registerName(r),
      rsValue: machine ? machine.reg(d.rs) : 0,
      rtValue: machine ? machine.reg(d.rt) : 0,
    };
  }

  function previewNext(): void {
    if (!machine) return;
    const pc = machine.pc();
    view = viewOf(machine.readWord(pc), pc, null);
    showPhase(4, false);
  }

  // ---- Panels ----
  function renderListing(): void {
    const pc = machine ? machine.pc() : 0;
    listing.replaceChildren(
      ...program.map((w, i) => {
        const a = i * 4;
        const d = core.decode(w);
        const li = el("li");
        if (a === pc) li.classList.add("next");
        if (last && a === last.pc) li.classList.add("ran");
        li.append(
          el("span", "mark", a === pc ? "PC →" : ""),
          el("span", "a", addr(a)),
          el("span", "w", hex8(w)),
          el("span", "asm", d.format === "Unknown" ? "?" : d.disassembly),
        );
        return li;
      }),
    );
  }

  const regInputs: HTMLInputElement[] = [];
  const regCells: HTMLElement[] = [];
  for (let r = 0; r < 32; r++) {
    const cell = el("label", "reg");
    const input = el("input");
    input.type = "text";
    input.spellcheck = false;
    input.disabled = r === 0;
    input.setAttribute("aria-label", `${core.registerName(r)} value`);
    input.addEventListener("change", () => {
      const v = parseNumber(input.value);
      if (machine && v !== null) machine.setReg(r, v);
      renderRegs();
      if (!last) previewNext();
    });
    cell.append(el("span", "n", core.registerName(r)), input);
    regsEl.append(cell);
    regInputs.push(input);
    regCells.push(cell);
  }

  function renderRegs(): void {
    if (!machine) return;
    const d = view?.d;
    const c = view?.c;
    for (let r = 0; r < 32; r++) {
      const v = machine.reg(r);
      if (document.activeElement !== regInputs[r]) regInputs[r]!.value = String(v | 0);
      regInputs[r]!.title = hex8(v);
      regCells[r]!.classList.toggle("written", !!last && last.reg_written && last.reg_dest === r);
      regCells[r]!.classList.toggle("read-rs", !!d && !!c && !!last && d.format !== "J" && d.rs === r);
      regCells[r]!.classList.toggle("read-rt", !!d && !!c && !!last && d.format !== "J" && d.rt === r && d.rt !== d.rs);
    }
  }

  function renderMem(): void {
    if (!machine) return;
    const base = (parseNumber(memBase.value) ?? 0x100) & ~3;
    const rows: HTMLTableRowElement[] = [];
    for (let i = 0; i < MEM_ROWS; i++) {
      const a = (base + i * 4) >>> 0;
      if (a + 4 > machine.memSize) break;
      const v = machine.readWord(a);
      const tr = el("tr");
      tr.classList.toggle("written", !!last && last.mem_write && last.mem_addr === a);
      tr.classList.toggle("accessed", !!last && (last.mem_read || last.mem_write) && last.mem_addr === a);
      const input = el("input");
      input.type = "text";
      input.value = String(v | 0);
      input.spellcheck = false;
      input.setAttribute("aria-label", `Word at ${addr(a)}`);
      input.addEventListener("change", () => {
        const n = parseNumber(input.value);
        if (machine && n !== null) machine.writeWord(a, n);
        renderMem();
      });
      const tdIn = el("td");
      tdIn.append(input);
      tr.append(el("td", "a", addr(a)), tdIn, el("td", "h", hex8(v)));
      rows.push(tr);
    }
    memTable.replaceChildren(...rows);
  }

  function renderStatus(): void {
    status.replaceChildren();
    if (!last || !view) {
      status.append(el("span", "muted", "Next instruction, not run yet: "), view?.d.format === "Unknown" ? "?" : view?.d.disassembly ?? "");
      return;
    }
    status.append(
      el("span", "muted", `Cycle ${cycle} · ${addr(last.pc)} `),
      view.d.format === "Unknown" ? "?" : view.d.disassembly,
      el("span", "muted", `  → next PC ${addr(last.next_pc)}`),
    );
  }

  /** Points out when the StepTrace from Cpu::step() disagrees with what the bindings saw. */
  function renderNotice(t: Trace | null): void {
    notice.hidden = true;
    notice.classList.remove("bad");
    if (!t) return;
    if (t.error) {
      notice.hidden = false;
      notice.classList.add("bad");
      notice.replaceChildren("Cpu::step() threw: ", el("code", "", t.error));
      return;
    }
    const problems: string[] = [];
    if (t.raw !== t.fetched) problems.push(`StepTrace.inst.raw is ${hex8(t.raw)} but the word at the PC is ${hex8(t.fetched)}`);
    const want = core.control(t.fetched);
    const ctrlKeys = Object.keys(want) as (keyof typeof want)[];
    if (ctrlKeys.some((k) => want[k] !== t.ctrl[k])) problems.push("StepTrace.ctrl differs from control_for()");
    if (t.next_pc === t.pc && view && !view.c.jump && !view.c.branch) problems.push("the PC did not move");
    if (problems.length === 0) return;
    notice.hidden = false;
    notice.replaceChildren(
      el("strong", "", "Your Cpu::step() trace looks incomplete: "),
      problems.join("; ") + ". ",
      "Lit paths come from control_for(); values on the wires come from the StepTrace, so they fill in as src/cpu.cpp is finished.",
    );
  }

  function renderAll(): void {
    renderListing();
    renderRegs();
    renderMem();
    renderStatus();
  }

  // ---- Actions ----
  function load(words: number[]): void {
    stopRun();
    stopAnim();
    machine?.dispose();
    machine = core.newMachine(MEM_BYTES);
    words.forEach((w, i) => machine!.writeWord(i * 4, w));
    program = words;
    cycle = 0;
    last = null;
    renderNotice(null);
    previewNext();
    renderAll();
    stepBtn.disabled = false;
    runBtn.disabled = false;
  }

  function step(): boolean {
    if (!machine) return false;
    stopAnim();
    const t = machine.step();
    cycle++;
    last = t;
    view = viewOf(t.fetched, t.pc, t);
    renderNotice(t);
    renderAll();

    if (reducedMotion()) {
      showPhase(4, false);
    } else {
      showPhase(0, true);
      for (let p = 1; p <= 4; p++) anim.push(window.setTimeout(() => showPhase(p as Phase, true), p * PHASE_MS));
    }
    const ok = !t.error;
    if (!ok) {
      stopRun();
      stepBtn.disabled = true;
      runBtn.disabled = true;
    }
    return ok;
  }

  function stopRun(): void {
    clearInterval(runTimer);
    runTimer = 0;
    runBtn.setAttribute("aria-pressed", "false");
    runBtn.textContent = "Run";
  }

  function startRun(): void {
    runBtn.setAttribute("aria-pressed", "true");
    runBtn.textContent = "Pause";
    const tick = () => {
      if (!machine) return stopRun();
      const pcBefore = machine.pc();
      const ok = step();
      const done = !ok || !last || last.next_pc === pcBefore || machine.pc() >= program.length * 4;
      if (done) stopRun();
    };
    tick();
    if (runBtn.getAttribute("aria-pressed") === "true") runTimer = window.setInterval(tick, RUN_DELAY_MS);
  }

  stepBtn.addEventListener("click", () => {
    stopRun();
    step();
  });
  runBtn.addEventListener("click", () => (runTimer ? stopRun() : startRun()));
  resetBtn.addEventListener("click", () => load(program));

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "s" && !stepBtn.disabled) stepBtn.click();
    else if (e.key === "r" && !runBtn.disabled) runBtn.click();
  });

  function loadSource(): void {
    const p = parseProgram(source.value);
    if (!p.ok) {
      sourceError.textContent = p.error;
      return;
    }
    sourceError.textContent = "";
    load(p.words);
  }

  select.addEventListener("change", () => {
    if (select.value === "custom") {
      source.closest("details")!.open = true;
      source.focus();
      return;
    }
    source.value = PROGRAMS[Number(select.value)]!.source;
    loadSource();
  });
  $("load").addEventListener("click", () => {
    select.value = PROGRAMS.findIndex((p) => p.source === source.value).toString();
    if (select.value === "-1" || select.value === "") select.value = "custom";
    loadSource();
  });
  memBase.addEventListener("change", renderMem);

  source.value = PROGRAMS[0]!.source;
  loadSource();
}

void main();
