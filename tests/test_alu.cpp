#include "alu.hpp"

#include <gtest/gtest.h>

using mips::alu;
using mips::AluOp;

TEST(Alu, AddWrapsAroundAndSetsZero) {
    auto r = alu(AluOp::Add, 0xFFFFFFFFu, 1u);
    EXPECT_EQ(r.value, 0u);
    EXPECT_TRUE(r.zero);
}

TEST(Alu, SubSetsZeroFlagWhenOperandsAreEqual) {
    // beq and bne rely on this: the zero flag from a subtraction tells us rs == rt.
    EXPECT_TRUE(alu(AluOp::Sub, 5, 5).zero);
    auto r = alu(AluOp::Sub, 7, 5);
    EXPECT_EQ(r.value, 2u);
    EXPECT_FALSE(r.zero);
}

TEST(Alu, SltIsSignedAndSltuIsUnsigned) {
    // 0xFFFFFFFF is -1 as a signed value but a large number as an unsigned value.
    EXPECT_EQ(alu(AluOp::Slt, 0xFFFFFFFFu, 1u).value, 1u);
    EXPECT_EQ(alu(AluOp::Sltu, 0xFFFFFFFFu, 1u).value, 0u);
}

TEST(Alu, LogicalOperations) {
    const std::uint32_t a = 0xF0F0F0F0u;
    const std::uint32_t b = 0x0FF00FF0u;
    EXPECT_EQ(alu(AluOp::And, a, b).value, 0x00F000F0u);
    EXPECT_EQ(alu(AluOp::Or, a, b).value, 0xFFF0FFF0u);
    EXPECT_EQ(alu(AluOp::Xor, a, b).value, 0xFF00FF00u);
    EXPECT_EQ(alu(AluOp::Nor, a, b).value, 0x000F000Fu);
}

TEST(Alu, ShiftLeftLogical) {
    EXPECT_EQ(alu(AluOp::Sll, 1, 4).value, 16u);
}

TEST(Alu, ShiftRightLogicalFillsWithZeros) {
    EXPECT_EQ(alu(AluOp::Srl, 0x80000000u, 31).value, 1u);
}

TEST(Alu, ShiftRightArithmeticKeepsSignBit) {
    EXPECT_EQ(alu(AluOp::Sra, 0x80000000u, 31).value, 0xFFFFFFFFu);
    EXPECT_EQ(alu(AluOp::Sra, 0x80000000u, 4).value, 0xF8000000u);
    EXPECT_EQ(alu(AluOp::Sra, 0x40000000u, 4).value, 0x04000000u);  // positive: no fill
}

TEST(Alu, LuiPlacesImmediateInUpperHalf) {
    EXPECT_EQ(alu(AluOp::Lui, 0, 0x1234).value, 0x12340000u);
}
