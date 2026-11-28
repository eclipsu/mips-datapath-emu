#pragma once

#include <cstdint>

// CE230 lecture 14: shift-and-add multiplication.

namespace mips {

// Sequential version (slides 5-7).
struct SeqMulState {
    std::uint64_t multiplicand;
    std::uint32_t multiplier;
    std::uint64_t product;
};

SeqMulState seq_mul_init(std::uint32_t multiplicand, std::uint32_t multiplier);
SeqMulState seq_mul_step(SeqMulState s);

// Refined version (slides 11-14).
struct RefinedMulState {
    std::uint32_t multiplicand;
    std::uint64_t product;
};

RefinedMulState refined_mul_init(std::uint32_t multiplicand, std::uint32_t multiplier,
                                 int nbits = 32);
RefinedMulState refined_mul_step(RefinedMulState s, int nbits = 32);

// mult / multu (slide 15).
struct MulResult {
    std::uint32_t hi;
    std::uint32_t lo;
};

MulResult multu(std::uint32_t a, std::uint32_t b);
MulResult mult(std::uint32_t a, std::uint32_t b);

}  // namespace mips
