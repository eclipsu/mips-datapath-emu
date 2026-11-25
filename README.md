# MIPS Datapath & Pipeline Emulator

An educational 32-bit MIPS emulator that shows the datapath and the 5-stage pipeline (IF, ID, EX, MEM, WB).
The behavior follows the CE230 Computer Systems lectures (Lectures 18, 19, 21, and 22).

## Status

- [x] Core: memory, register file, ALU, decoder, control unit
- [x] Single-cycle CPU with a per-instruction trace
- [ ] 5-stage pipeline with pipeline registers
- [ ] Forwarding, load-use stalls, and branch/jump handling in ID
- [ ] Web UI (C++ core compiled to WebAssembly)

## Supported instructions

| Format | Instructions |
|---|---|
| R | `add` `sub` `and` `or` `xor` `nor` `slt` `sll` `srl` `sra` `jr` |
| I | `addi` `slti` `andi` `ori` `lui` `lw` `sw` `beq` `bne` |
| J | `j` `jal` |

## Build and test

Requires a C++17 compiler, CMake 3.16 or newer, and GoogleTest.

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build          # or: ./build/mipscore_tests
```

## Layout

```
src/
  memory.*      byte-addressable, big-endian memory
  regfile.*     32 registers, $zero hardwired to 0
  alu.*         ALU operations and the zero flag
  decode.*      instruction fields, opcodes, disassembly
  control.*     control-signal table (Lecture 19, slides 24-25)
  cpu.*         single-cycle CPU; step() returns a StepTrace
  encode.hpp    helpers for hand-assembling test programs
tests/          GoogleTest unit tests, one file per unit
```

## Notes on the model

- Branches are resolved in the ID stage, as in the lecture's improved design (Lecture 22). A taken branch or jump discards the instruction that followed it.
- Addresses are byte addresses. Word accesses must be 4-byte aligned.
- Overflow on `add` and `sub` wraps around. The trapping forms are not modeled.
- Floating-point arithmetic (Lecture 18, slides 2-6) is out of scope for this datapath.
