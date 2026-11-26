// Decoder tests: one 32-bit word in, one Instruction out.
//
// Field layout (Lecture 18):
//   R:  opcode[31:26] rs[25:21] rt[20:16] rd[15:11] shamt[10:6] funct[5:0]
//   I:  opcode[31:26] rs[25:21] rt[20:16] imm[15:0]
//   J:  opcode[31:26] target[25:0]
//
// Each test shows the word split into its fields, so a failure can be checked by hand.
// Tip: `make probe WORD=0x...` prints everything decode() returns for one word.

#include "decode.hpp"
#include "test_print.hpp"

#include <gtest/gtest.h>

using namespace mips;

// ---------------------------------------------------------------------------
// I-type
// ---------------------------------------------------------------------------

// Lecture 21, Example 2.9: 0x2237FFF1 is addi $s7, $s1, -15
//
//   0x2237FFF1 = 001000 10001 10111 1111111111110001
//                opcode  rs    rt   imm
//                   8    17    23   0xFFF1 = -15 (sign bit set)
TEST(Decode, AddiFromLecture21Example) {
    Instruction i = decode(0x2237FFF1u);

    EXPECT_EQ(i.op, Op::Addi)        << "opcode 8 is addi";
    EXPECT_EQ(i.format, Format::I)   << "addi is I-type";
    EXPECT_EQ(num(i.opcode), 8)      << "opcode = bits 31..26";
    EXPECT_EQ(num(i.rs), 17)         << "rs = bits 25..21 ($s1)";
    EXPECT_EQ(num(i.rt), 23)         << "rt = bits 20..16 ($s7)";
    EXPECT_EQ(i.imm_sext, -15)       << "0xFFF1 sign-extended";

    EXPECT_EQ(disassemble(i), "addi $s7, $s1, -15");
}

// Lecture 19, Q6: bne $t1, $zero, loop with a branch offset of -6.
//
//   0x1520FFFA = 000101 01001 00000 1111111111111010
//                opcode  rs    rt   imm
//                   5     9     0   0xFFFA = -6
TEST(Decode, BneNegativeOffset) {
    Instruction i = decode(0x1520FFFAu);

    EXPECT_EQ(i.op, Op::Bne)     << "opcode 5 is bne";
    EXPECT_EQ(num(i.rs), 9)      << "$t1";
    EXPECT_EQ(num(i.rt), 0)      << "$zero";
    EXPECT_EQ(i.imm_sext, -6)    << "0xFFFA sign-extended";
}

// Lecture 18: andi/ori zero-extend the immediate, addi sign-extends it.
// decode() fills in both versions; the CPU picks the right one per instruction.
//
//   andi $t0, $t0, 0xFFFF = 0x3108FFFF   (opcode 12)
//   addi $t0, $t0, -1     = 0x2108FFFF   (opcode 8)
//   Same low 16 bits: 0xFFFF = 1111111111111111
TEST(Decode, ImmediateIsBothZeroAndSignExtended) {
    Instruction andi = decode(0x3108FFFFu);
    EXPECT_EQ(andi.op, Op::Andi);
    EXPECT_EQ(andi.imm_zext, 0x0000FFFFu)  << "zero-extended: 65535";
    EXPECT_EQ(andi.imm_sext, -1)           << "sign-extended: -1";

    Instruction addi = decode(0x2108FFFFu);
    EXPECT_EQ(addi.op, Op::Addi);
    EXPECT_EQ(addi.imm_sext, -1);
}

// ---------------------------------------------------------------------------
// R-type (opcode 0, the funct field says which instruction)
// ---------------------------------------------------------------------------

// Lecture 18, slide 8: add $8, $9, $10
//
//   0x012A4020 = 000000 01001 01010 01000 00000 100000
//                opcode  rs    rt    rd  shamt  funct
//                   0     9    10     8    0    0x20 = add
TEST(Decode, RTypeAddFields) {
    Instruction i = decode(0x012A4020u);

    EXPECT_EQ(i.op, Op::Add)       << "opcode 0 + funct 0x20 is add";
    EXPECT_EQ(i.format, Format::R);
    EXPECT_EQ(num(i.rs), 9)        << "$t1";
    EXPECT_EQ(num(i.rt), 10)       << "$t2";
    EXPECT_EQ(num(i.rd), 8)        << "$t0";
    EXPECT_EQ(num(i.funct), 0x20)  << "funct = bits 5..0";

    EXPECT_EQ(disassemble(i), "add $t0, $t1, $t2");
}

// sll $t0, $t1, 4 (shifts read rt, and the amount comes from shamt)
//
//   0x00094100 = 000000 00000 01001 01000 00100 000000
//                opcode  rs    rt    rd  shamt  funct
//                   0     0     9     8    4    0x00 = sll
TEST(Decode, ShiftAmountIsDecoded) {
    Instruction i = decode(0x00094100u);

    EXPECT_EQ(i.op, Op::Sll)      << "opcode 0 + funct 0x00 is sll";
    EXPECT_EQ(num(i.shamt), 4)    << "shamt = bits 10..6";

    EXPECT_EQ(disassemble(i), "sll $t0, $t1, 4");
}

// ---------------------------------------------------------------------------
// J-type
// ---------------------------------------------------------------------------

// Lecture 19, Q5: j with target field 2 (jumps to address 2 * 4 = 8).
//
//   0x08000002 = 000010 00000000000000000000000010
//                opcode target
//                   2   2
TEST(Decode, JumpTargetField) {
    Instruction i = decode(0x08000002u);

    EXPECT_EQ(i.op, Op::J)          << "opcode 2 is j";
    EXPECT_EQ(i.format, Format::J);
    EXPECT_EQ(i.target, 2u)         << "target = bits 25..0, before the << 2";
}

// ---------------------------------------------------------------------------
// Bad input
// ---------------------------------------------------------------------------

// Opcode 63 is not a MIPS instruction.
//
//   0xFC000000 = 111111 00000000000000000000000000
//                opcode = 63
TEST(Decode, UnknownOpcodeIsUnknown) {
    Instruction i = decode(0xFC000000u);

    EXPECT_EQ(i.op, Op::Unknown);
    EXPECT_EQ(i.format, Format::Unknown)  << "an unknown op has no format either";
}
