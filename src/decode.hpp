#pragma once

#include <cstdint>
#include <string>

namespace mips {

enum class Format : std::uint8_t { R, I, J, Unknown };

// Every instruction in the supported MIPS32 subset.
enum class Op : std::uint8_t {
    Unknown,
    // R-type (opcode 0, selected by funct)
    Sll, Srl, Sra, Jr, Add, Sub, And, Or, Xor, Nor, Slt,
    // I-type
    Addi, Slti, Andi, Ori, Lui, Lw, Sw, Beq, Bne,
    // J-type
    J, Jal,
};

// The fields of a 32-bit instruction word, split out for display and execution.
struct Instruction {
    std::uint32_t raw = 0;
    Format format = Format::Unknown;
    Op op = Op::Unknown;

    std::uint8_t opcode = 0;  // bits 31..26
    std::uint8_t rs = 0;      // bits 25..21
    std::uint8_t rt = 0;      // bits 20..16
    std::uint8_t rd = 0;      // bits 15..11
    std::uint8_t shamt = 0;   // bits 10..6
    std::uint8_t funct = 0;   // bits 5..0

    std::int32_t imm_sext = 0;   // bits 15..0, sign-extended (branches, lw/sw, addi, slti)
    std::uint32_t imm_zext = 0;  // bits 15..0, zero-extended (andi, ori, lui)
    std::uint32_t target = 0;    // bits 25..0 (jump target field, before the <<2)
};

Instruction decode(std::uint32_t word);

const char* mnemonic(Op op);

// Human-readable form, e.g. "addi $s7, $s1, -15" or "lw $t3, 16($zero)".
std::string disassemble(const Instruction& inst);

}  // namespace mips
