#pragma once

#include <cstdint>

namespace mips {

// Operations the ALU can perform. The control unit chooses one per instruction.
enum class AluOp : std::uint8_t {
    Add,   // a + b (wraps on overflow; trapping add is not modeled)
    Sub,   // a - b; the zero flag drives beq/bne
    And,
    Or,
    Xor,
    Nor,
    Slt,   // signed a < b -> 1 or 0
    Sltu,  // unsigned a < b -> 1 or 0
    Sll,   // a << b, b is the shift amount (0..31)
    Srl,   // logical right shift
    Sra,   // arithmetic right shift (keeps the sign bit)
    Lui,   // result = b << 16, a is ignored
};

struct AluResult {
    std::uint32_t value;
    bool zero;  // true when value == 0
};

AluResult alu(AluOp op, std::uint32_t a, std::uint32_t b);

}  // namespace mips
