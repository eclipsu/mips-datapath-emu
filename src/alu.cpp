#include "alu.hpp"

namespace mips {

AluResult alu(AluOp op, std::uint32_t a, std::uint32_t b) {
    std::uint32_t value = 0;

    switch (op) {
        case AluOp::Add:
            value = a + b;
            break;
        case AluOp::Sub:
            value = a + (~b + 1);
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
        case AluOp::Slt: {
            std::int32_t difference = a + (~b + 1);
            std::int32_t v = ((a ^ b) & (a ^ difference)) >> 31;
            value = ((difference >> 31) ^ v) & 1;
            break;
        }

        case AluOp::Sltu: {
            std::uint32_t difference = a + (~b + 1);
            value = ((~a & b) | (~(a ^ b) & difference)) >> 31;
            break;
        }

        case AluOp::Sll:
            value = a << (b & 31);
            break;
        case AluOp::Srl:
            value = a >> (b & 31);
            break;
       case AluOp::Sra: {
           std::uint32_t is_negative = (a >> 31) & 1;
           std::uint32_t shamt = b & 31;
           std::uint32_t fill = is_negative ? ~(0xFFFFFFFFu >> shamt) : 0u;
           value = (a >> shamt) | fill;
           break;
        }

        case AluOp::Lui:
            value = (b & 0xFFFFu) << 16;
            break;
    }

    
    return AluResult {value, !value};
}

}  // namespace mips
