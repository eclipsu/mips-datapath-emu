import createModule, { type DecodedWord as RawDecodedWord, type MainModule } from "../wasm/mipscore.mjs";

export type Format = "R" | "I" | "J" | "Unknown";

// Mirrors mips::Instruction (src/decode.hpp).
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

// Mirrors mips::ControlSignals (src/control.hpp); alu_op is the AluOp name.
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

export interface Core {
  decode(word: number): DecodedWord;
  control(word: number): Control;
  registerName(reg: number): string;
}

let corePromise: Promise<Core> | null = null;

export function loadCore(): Promise<Core> {
  if (!corePromise) corePromise = createModule().then(wrap);
  return corePromise;
}

function wrap(m: MainModule): Core {
  return {
    decode(word) {
      // JS numbers are signed; >>> 0 keeps the word unsigned.
      const d: RawDecodedWord = m.decode(word >>> 0);
      return {
        ...d,
        raw: d.raw >>> 0,
        format: String(d.format) as Format,
        mnemonic: String(d.mnemonic),
        disassembly: String(d.disassembly),
      };
    },
    control(word) {
      const c = m.control(word >>> 0);
      return { ...c, alu_op: String(c.alu_op) };
    },
    registerName: (reg) => m.registerName(reg),
  };
}
