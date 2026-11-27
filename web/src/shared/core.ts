// Loads the C++ core (WebAssembly) once and gives pages a typed handle to it.
// All emulator logic lives in C++; this file only adapts the types.

import createModule, {
  type DecodedWord as RawDecodedWord,
  type Control as RawControl,
  type Trace as RawTrace,
  type MainModule,
} from "../wasm/mipscore.mjs";

export type Format = "R" | "I" | "J" | "Unknown";

/** What mips::decode() returns for one word (see src/decode.hpp). */
export interface DecodedWord {
  raw: number;
  format: Format;
  op: number;
  mnemonic: string;
  opcode: number;
  rs: number;
  rt: number;
  rd: number;
  shamt: number;
  funct: number;
  imm_sext: number;
  imm_zext: number;
  target: number;
  disassembly: string;
}

/** mips::ControlSignals (see src/control.hpp), ALU operation as its name. */
export interface Control {
  reg_dst: boolean;
  alu_src: boolean;
  mem_read: boolean;
  mem_write: boolean;
  mem_to_reg: boolean;
  reg_write: boolean;
  branch: boolean;
  jump: boolean;
  jump_reg: boolean;
  link: boolean;
  alu_op: string;
}

/** mips::StepTrace from Cpu::step() (see src/cpu.hpp). `error` is set if step() threw. */
export interface Trace {
  /** Word at the PC before step(), read by the bindings (not part of StepTrace). */
  fetched: number;
  pc: number;
  raw: number;
  ctrl: Control;
  rs_value: number;
  rt_value: number;
  alu_a: number;
  alu_b: number;
  alu_result: number;
  alu_zero: boolean;
  mem_read: boolean;
  mem_write: boolean;
  mem_addr: number;
  mem_data: number;
  reg_written: boolean;
  reg_dest: number;
  reg_value: number;
  branch_taken: boolean;
  next_pc: number;
  error: string;
}

/** A mips::Cpu living in WebAssembly. Call dispose() when done with it. */
export interface Machine {
  readonly memSize: number;
  pc(): number;
  setPc(pc: number): void;
  reg(r: number): number;
  setReg(r: number, value: number): void;
  readWord(addr: number): number;
  writeWord(addr: number, value: number): boolean;
  step(): Trace;
  dispose(): void;
}

export interface Core {
  decode(word: number): DecodedWord;
  /** Conventional register name, e.g. "$t0" for 8. */
  registerName(reg: number): string;
  /** mips::control_for() for the decoded word. */
  control(word: number): Control;
  newMachine(memBytes: number): Machine;
}

let corePromise: Promise<Core> | null = null;

export function loadCore(): Promise<Core> {
  if (!corePromise) corePromise = createModule().then(wrap);
  return corePromise;
}

function wrap(m: MainModule): Core {
  return {
    decode(word) {
      // >>> 0 keeps the value an unsigned 32-bit integer on the way in and out.
      const d: RawDecodedWord = m.decode(word >>> 0);
      return {
        ...d,
        raw: d.raw >>> 0,
        format: String(d.format) as Format,
        mnemonic: String(d.mnemonic),
        disassembly: String(d.disassembly),
      };
    },
    registerName: (reg) => m.registerName(reg),
    control: (word) => fixControl(m.control(word >>> 0)),
    newMachine(memBytes) {
      const cpu = new m.Machine(memBytes);
      return {
        memSize: cpu.memSize(),
        pc: () => cpu.pc() >>> 0,
        setPc: (pc) => cpu.setPc(pc >>> 0),
        reg: (r) => cpu.reg(r) >>> 0,
        setReg: (r, v) => cpu.setReg(r, v >>> 0),
        readWord: (a) => cpu.readWord(a >>> 0) >>> 0,
        writeWord: (a, v) => cpu.writeWord(a >>> 0, v >>> 0),
        step: () => fixTrace(cpu.step()),
        dispose: () => cpu.delete(),
      };
    },
  };
}

function fixControl(c: RawControl): Control {
  return { ...c, alu_op: String(c.alu_op) };
}

function fixTrace(t: RawTrace): Trace {
  const u = (v: number) => v >>> 0;
  return {
    ...t,
    fetched: u(t.fetched),
    pc: u(t.pc),
    raw: u(t.raw),
    ctrl: fixControl(t.ctrl),
    rs_value: u(t.rs_value),
    rt_value: u(t.rt_value),
    alu_a: u(t.alu_a),
    alu_b: u(t.alu_b),
    alu_result: u(t.alu_result),
    mem_addr: u(t.mem_addr),
    mem_data: u(t.mem_data),
    reg_value: u(t.reg_value),
    next_pc: u(t.next_pc),
    error: String(t.error),
  };
}
