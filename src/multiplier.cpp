#include "multiplier.hpp"

namespace mips {

SeqMulState seq_mul_init(std::uint32_t multiplicand, std::uint32_t multiplier) {
    return {static_cast<std::uint64_t>(multiplicand), multiplier, 0};
}

SeqMulState seq_mul_step(SeqMulState s) {
    if(s.multiplier & 1) {
        s.product += s.multiplicand;
    }
    s.multiplicand = s.multiplicand << 1;
    s.multiplier = s.multiplier >> 1;
    return s;
}

RefinedMulState refined_mul_init(std::uint32_t multiplicand, std::uint32_t multiplier,
                                 int nbits) {
    // TODO
    (void)multiplicand;
    (void)multiplier;
    (void)nbits;
    return {0, 0};
}

RefinedMulState refined_mul_step(RefinedMulState s, int nbits) {
    // TODO
    (void)nbits;
    return s;
}

MulResult multu(std::uint32_t a, std::uint32_t b) {
    // TODO
    (void)a;
    (void)b;
    return {0, 0};
}

MulResult mult(std::uint32_t a, std::uint32_t b) {
    // TODO
    (void)a;
    (void)b;
    return {0, 0};
}

}  // namespace mips
