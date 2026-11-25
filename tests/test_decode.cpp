#include "decode.hpp"
#include "encode.hpp"

#include <gtest/gtest.h>

using namespace mips;

// Lecture 21, Example 2.9: 0x2237FFF1 -> addi $s7, $s1, -15
TEST(Decode, AddiFromLecture21Example) {
    Instruction i = decode(0x2237FFF1u);
    EXPECT_EQ(i.format, Format::I);
    EXPECT_EQ(i.op, Op::Addi);
    EXPECT_EQ(i.rs, 17);   // $s1
    EXPECT_EQ(i.rt, 23);   // $s7
    EXPECT_EQ(i.imm_sext, -15);
    EXPECT_EQ(disassemble(i), "addi $s7, $s1, -15");
}

// Lecture 18, slide 8 field layout: add $8, $9, $10 is 0x012A4020.
TEST(Decode, RTypeAddFields) {
    Instruction i = decode(0x012A4020u);
    EXPECT_EQ(i.format, Format::R);
    EXPECT_EQ(i.op, Op::Add);
    EXPECT_EQ(i.rs, 9);
    EXPECT_EQ(i.rt, 10);
    EXPECT_EQ(i.rd, 8);
    EXPECT_EQ(i.funct, 32);
    EXPECT_EQ(disassemble(i), "add $t0, $t1, $t2");
}

// Lecture 19, Example (Q6): bne $t1, $zero, loop with offset -6 is 0x1520FFFA.
TEST(Decode, BneNegativeOffset) {
    Instruction i = decode(0x1520FFFAu);
    EXPECT_EQ(i.op, Op::Bne);
    EXPECT_EQ(i.rs, 9);
    EXPECT_EQ(i.rt, 0);
    EXPECT_EQ(i.imm_sext, -6);
}

// Lecture 19, Q5: j with target field 2 is 0x08000002.
TEST(Decode, JumpTargetField) {
    Instruction i = decode(0x08000002u);
    EXPECT_EQ(i.format, Format::J);
    EXPECT_EQ(i.op, Op::J);
    EXPECT_EQ(i.target, 2u);
}

TEST(Decode, AndiZeroExtendsButAddiSignExtends) {
    // Lecture 18: the immediate is sign-extended for arithmetic and zero-extended for logic.
    Instruction andi = decode(enc_i(12, 8, 8, -1));  // andi $t0, $t0, 0xFFFF
    EXPECT_EQ(andi.imm_zext, 0xFFFFu);
    EXPECT_EQ(andi.imm_sext, -1);

    Instruction addi = decode(enc_i(8, 8, 8, -1));
    EXPECT_EQ(addi.imm_sext, -1);
}

TEST(Decode, ShiftAmountIsDecoded) {
    Instruction i = decode(enc_r(0x00, 0, 9, 8, 4));  // sll $t0, $t1, 4
    EXPECT_EQ(i.op, Op::Sll);
    EXPECT_EQ(i.shamt, 4);
    EXPECT_EQ(disassemble(i), "sll $t0, $t1, 4");
}

TEST(Decode, UnknownOpcodeIsUnknown) {
    Instruction i = decode(enc_i(63, 0, 0, 0));
    EXPECT_EQ(i.op, Op::Unknown);
    EXPECT_EQ(i.format, Format::Unknown);
}
