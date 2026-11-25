#pragma once

#include <cstdint>

namespace mips {

// Small encoders for building test programs by hand. Each returns a 32-bit instruction word.

// R-type: opcode 0, then rs, rt, rd, shamt, funct.
inline std::uint32_t enc_r(std::uint8_t funct, std::uint8_t rs, std::uint8_t rt,
                           std::uint8_t rd, std::uint8_t shamt = 0) {
    return (static_cast<std::uint32_t>(rs & 31u) << 21) |
           (static_cast<std::uint32_t>(rt & 31u) << 16) |
           (static_cast<std::uint32_t>(rd & 31u) << 11) |
           (static_cast<std::uint32_t>(shamt & 31u) << 6) |
           static_cast<std::uint32_t>(funct & 63u);
}

// I-type: opcode, rs, rt, 16-bit immediate (negative values are allowed).
inline std::uint32_t enc_i(std::uint8_t opcode, std::uint8_t rs, std::uint8_t rt,
                           std::int32_t imm) {
    return (static_cast<std::uint32_t>(opcode & 63u) << 26) |
           (static_cast<std::uint32_t>(rs & 31u) << 21) |
           (static_cast<std::uint32_t>(rt & 31u) << 16) |
           (static_cast<std::uint32_t>(imm) & 0xFFFFu);
}

// J-type: opcode, 26-bit target field (the address divided by 4).
inline std::uint32_t enc_j(std::uint8_t opcode, std::uint32_t target26) {
    return (static_cast<std::uint32_t>(opcode & 63u) << 26) | (target26 & 0x03FFFFFFu);
}

}  // namespace mips
