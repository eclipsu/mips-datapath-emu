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

export interface Core {
  decode(word: number): DecodedWord;
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
    registerName: (reg) => m.registerName(reg),
  };
}
