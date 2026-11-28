#include "multiplier.hpp"

#include <gtest/gtest.h>

using namespace mips;

// Slide 6: 0010 x 0011
TEST(SeqMultiplier, InitialValues) {
    auto s = seq_mul_init(0b0010, 0b0011);
    EXPECT_EQ(s.multiplier, 0b0011u);
    EXPECT_EQ(s.multiplicand, 0b0000'0010u);
    EXPECT_EQ(s.product, 0u);
}

TEST(SeqMultiplier, LectureTableEveryStep) {
    struct Row { std::uint32_t mlier; std::uint64_t mcand, prod; };
    const Row expected[] = {
        {0b0001, 0b0000'0100, 0b0000'0010},
        {0b0000, 0b0000'1000, 0b0000'0110},
        {0b0000, 0b0001'0000, 0b0000'0110},
        {0b0000, 0b0010'0000, 0b0000'0110},
    };
    auto s = seq_mul_init(0b0010, 0b0011);
    for (int step = 0; step < 4; ++step) {
        s = seq_mul_step(s);
        EXPECT_EQ(s.multiplier, expected[step].mlier) << "step " << step + 1;
        EXPECT_EQ(s.multiplicand, expected[step].mcand) << "step " << step + 1;
        EXPECT_EQ(s.product, expected[step].prod) << "step " << step + 1;
    }
}

// Slide 4: 1000 x 1001
TEST(SeqMultiplier, EightTimesNineIsSeventyTwo) {
    auto s = seq_mul_init(0b1000, 0b1001);
    for (int i = 0; i < 4; ++i) s = seq_mul_step(s);
    EXPECT_EQ(s.product, 0b0100'1000u);
}

// Slide 12: 0010 x 0011
TEST(RefinedMultiplier, InitialValuesPutMultiplierInRightHalf) {
    auto s = refined_mul_init(0b0010, 0b0011, 4);
    EXPECT_EQ(s.multiplicand, 0b0010u);
    EXPECT_EQ(s.product, 0b0000'0011u);
}

TEST(RefinedMultiplier, LectureTableEveryStep) {
    const std::uint64_t expected[] = {0b0001'0001, 0b0001'1000, 0b0000'1100, 0b0000'0110};
    auto s = refined_mul_init(0b0010, 0b0011, 4);
    for (int step = 0; step < 4; ++step) {
        s = refined_mul_step(s, 4);
        EXPECT_EQ(s.multiplicand, 0b0010u) << "step " << step + 1;
        EXPECT_EQ(s.product, expected[step]) << "step " << step + 1;
    }
}

TEST(RefinedMultiplier, CarryOutOfLeftHalfIsKept) {
    const std::uint64_t expected[] = {0b0111'1111, 0b1011'0111, 0b1101'0011, 0b1110'0001};
    auto s = refined_mul_init(0b1111, 0b1111, 4);
    for (int step = 0; step < 4; ++step) {
        s = refined_mul_step(s, 4);
        EXPECT_EQ(s.product, expected[step]) << "step " << step + 1;
    }
}

TEST(RefinedMultiplier, ThirtyTwoBitsMatchesNativeMultiply) {
    const std::uint32_t a = 123456789u, b = 987654321u;
    auto s = refined_mul_init(a, b);
    for (int i = 0; i < 32; ++i) s = refined_mul_step(s);
    EXPECT_EQ(s.product, std::uint64_t{a} * b);
}

// Slide 15
TEST(MultInstruction, LectureExampleSplitsIntoHiAndLo) {
    auto r = mult(0x7FFFFFFFu, 0x40000000u);
    EXPECT_EQ(r.hi, 0x1FFFFFFFu);
    EXPECT_EQ(r.lo, 0xC0000000u);
}

TEST(MultInstruction, SmallProductLeavesHiZero) {
    auto r = multu(6, 7);
    EXPECT_EQ(r.hi, 0u);
    EXPECT_EQ(r.lo, 42u);
}

TEST(MultInstruction, SignedAndUnsignedDifferOnlyInHi) {
    auto s = mult(0xFFFFFFFFu, 2u);
    auto u = multu(0xFFFFFFFFu, 2u);
    EXPECT_EQ(s.hi, 0xFFFFFFFFu);
    EXPECT_EQ(u.hi, 0x00000001u);
    EXPECT_EQ(s.lo, 0xFFFFFFFEu);
    EXPECT_EQ(u.lo, 0xFFFFFFFEu);
}

TEST(MultInstruction, NegativeTimesNegativeIsPositive) {
    auto r = mult(static_cast<std::uint32_t>(-3), static_cast<std::uint32_t>(-5));
    EXPECT_EQ(r.hi, 0u);
    EXPECT_EQ(r.lo, 15u);
}

TEST(MultInstruction, MostNegativeSquared) {
    auto r = mult(0x80000000u, 0x80000000u);
    EXPECT_EQ(r.hi, 0x40000000u);
    EXPECT_EQ(r.lo, 0u);
}
