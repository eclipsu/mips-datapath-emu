#pragma once

// Test-only helpers that make GoogleTest failure messages readable.
//
// Without these, GoogleTest prints an enum as raw bytes ("1-byte object <01>").
// GoogleTest looks for a function named PrintTo in the enum's own namespace,
// so these live in namespace mips. They are NOT part of the emulator.

#include "alu.hpp"
#include "decode.hpp"

#include <cstdint>
#include <ostream>

namespace mips {

inline void PrintTo(Format f, std::ostream* os) {
    switch (f) {
        case Format::R:       *os << "Format::R"; return;
        case Format::I:       *os << "Format::I"; return;
        case Format::J:       *os << "Format::J"; return;
        case Format::Unknown: *os << "Format::Unknown"; return;
    }
    *os << "Format(" << static_cast<int>(f) << ")";
}

inline void PrintTo(Op op, std::ostream* os) {
    switch (op) {
        case Op::Unknown: *os << "Op::Unknown"; return;
        case Op::Sll:  *os << "Op::Sll";  return;
        case Op::Srl:  *os << "Op::Srl";  return;
        case Op::Sra:  *os << "Op::Sra";  return;
        case Op::Jr:   *os << "Op::Jr";   return;
        case Op::Add:  *os << "Op::Add";  return;
        case Op::Sub:  *os << "Op::Sub";  return;
        case Op::And:  *os << "Op::And";  return;
        case Op::Or:   *os << "Op::Or";   return;
        case Op::Xor:  *os << "Op::Xor";  return;
        case Op::Nor:  *os << "Op::Nor";  return;
        case Op::Slt:  *os << "Op::Slt";  return;
        case Op::Addi: *os << "Op::Addi"; return;
        case Op::Slti: *os << "Op::Slti"; return;
        case Op::Andi: *os << "Op::Andi"; return;
        case Op::Ori:  *os << "Op::Ori";  return;
        case Op::Lui:  *os << "Op::Lui";  return;
        case Op::Lw:   *os << "Op::Lw";   return;
        case Op::Sw:   *os << "Op::Sw";   return;
        case Op::Beq:  *os << "Op::Beq";  return;
        case Op::Bne:  *os << "Op::Bne";  return;
        case Op::J:    *os << "Op::J";    return;
        case Op::Jal:  *os << "Op::Jal";  return;
    }
    *os << "Op(" << static_cast<int>(op) << ")";
}

inline void PrintTo(AluOp op, std::ostream* os) {
    switch (op) {
        case AluOp::Add:  *os << "AluOp::Add";  return;
        case AluOp::Sub:  *os << "AluOp::Sub";  return;
        case AluOp::And:  *os << "AluOp::And";  return;
        case AluOp::Or:   *os << "AluOp::Or";   return;
        case AluOp::Xor:  *os << "AluOp::Xor";  return;
        case AluOp::Nor:  *os << "AluOp::Nor";  return;
        case AluOp::Slt:  *os << "AluOp::Slt";  return;
        case AluOp::Sltu: *os << "AluOp::Sltu"; return;
        case AluOp::Sll:  *os << "AluOp::Sll";  return;
        case AluOp::Srl:  *os << "AluOp::Srl";  return;
        case AluOp::Sra:  *os << "AluOp::Sra";  return;
        case AluOp::Lui:  *os << "AluOp::Lui";  return;
    }
    *os << "AluOp(" << static_cast<int>(op) << ")";
}

}  // namespace mips

// Instruction fields are std::uint8_t, which GoogleTest prints as a character ('\x11').
// Wrap a field in num() to compare and print it as a plain number (17).
inline int num(std::uint8_t field) { return static_cast<int>(field); }
