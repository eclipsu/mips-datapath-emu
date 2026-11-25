#include "alu.hpp"

namespace mips {

AluResult alu(AluOp op, std::uint32_t a, std::uint32_t b) {
    std::uint32_t value = 0;
    const std::uint32_t shamt = b & 31u;

    switch (op) {
        case AluOp::Add:
            value = a + b;
            break;
        case AluOp::Sub:
            value = a - b;
            break;
        case AluOp::And:
            value = a & b;
            break;
        case AluOp::Or:
            value = a | b;
            break;
        case AluOp::Xor:
            value = a ^ b;
            break;
        case AluOp::Nor:
            value = ~(a | b);
            break;
        case AluOp::Slt:
            value = static_cast<std::int32_t>(a) < static_cast<std::int32_t>(b) ? 1u : 0u;
            break;
        case AluOp::Sltu:
            value = a < b ? 1u : 0u;
            break;
        case AluOp::Sll:
            value = a << shamt;
            break;
        case AluOp::Srl:
            value = a >> shamt;
            break;
        case AluOp::Sra: {
            const bool negative = (a & 0x80000000u) != 0;
            value = a >> shamt;
            if (negative && shamt != 0) {
                value |= ~0u << (32 - shamt);  // refill the vacated high bits with the sign
            }
            break;
        }
        case AluOp::Lui:
            value = (b & 0xFFFFu) << 16;
            break;
    }

    return AluResult{value, value == 0};
}

}  // namespace mips
