#include "control.hpp"
#include "test_print.hpp"

#include <gtest/gtest.h>

using namespace mips;

// Lecture 19, slides 24-25: the control signal table for the single-cycle datapath.

TEST(Control, RTypeAddWritesRdFromAlu) {
    ControlSignals c = control_for(Op::Add);
    EXPECT_TRUE(c.reg_dst);
    EXPECT_TRUE(c.reg_write);
    EXPECT_FALSE(c.alu_src);
    EXPECT_FALSE(c.mem_read);
    EXPECT_FALSE(c.mem_write);
    EXPECT_FALSE(c.mem_to_reg);
    EXPECT_EQ(c.alu_op, AluOp::Add);
}

TEST(Control, AddiUsesImmediateAndWritesRt) {
    ControlSignals c = control_for(Op::Addi);
    EXPECT_FALSE(c.reg_dst);
    EXPECT_TRUE(c.alu_src);
    EXPECT_TRUE(c.reg_write);
    EXPECT_EQ(c.alu_op, AluOp::Add);
}

TEST(Control, LwReadsMemoryIntoRt) {
    ControlSignals c = control_for(Op::Lw);
    EXPECT_TRUE(c.mem_read);
    EXPECT_TRUE(c.mem_to_reg);
    EXPECT_TRUE(c.reg_write);
    EXPECT_TRUE(c.alu_src);
    EXPECT_FALSE(c.reg_dst);
}

TEST(Control, SwWritesMemoryAndDoesNotWriteRegisters) {
    ControlSignals c = control_for(Op::Sw);
    EXPECT_TRUE(c.mem_write);
    EXPECT_FALSE(c.reg_write);
    EXPECT_TRUE(c.alu_src);
}

TEST(Control, BeqUsesSubtractionAndBranches) {
    ControlSignals c = control_for(Op::Beq);
    EXPECT_TRUE(c.branch);
    EXPECT_FALSE(c.reg_write);
    EXPECT_FALSE(c.alu_src);
    EXPECT_EQ(c.alu_op, AluOp::Sub);
}

TEST(Control, JumpDoesNotWriteRegisters) {
    ControlSignals c = control_for(Op::J);
    EXPECT_TRUE(c.jump);
    EXPECT_FALSE(c.reg_write);
}

TEST(Control, JalWritesReturnAddressRegister) {
    ControlSignals c = control_for(Op::Jal);
    EXPECT_TRUE(c.jump);
    EXPECT_TRUE(c.link);
    EXPECT_TRUE(c.reg_write);
}

// lui puts the immediate in the upper 16 bits: lui $t0, 0x1234 -> $t0 = 0x12340000.
// The ALU has a dedicated AluOp::Lui for this ((b & 0xFFFF) << 16, a ignored).
// AluOp::Sll would compute a << b instead, which for lui is rs (0) shifted: always 0.
TEST(Control, LuiUsesLuiAluOpAndWritesRt) {
    ControlSignals c = control_for(Op::Lui);
    EXPECT_EQ(c.alu_op, AluOp::Lui);
    EXPECT_TRUE(c.alu_src);
    EXPECT_TRUE(c.reg_write);
    EXPECT_FALSE(c.reg_dst);
}

// jr jumps to the address in rs and writes no register.
TEST(Control, JrJumpsThroughRegisterWithoutWriting) {
    ControlSignals c = control_for(Op::Jr);
    EXPECT_TRUE(c.jump);
    EXPECT_TRUE(c.jump_reg);
    EXPECT_FALSE(c.reg_write);
}

// An unknown instruction must not change anything: every signal off.
TEST(Control, UnknownTurnsEverythingOff) {
    ControlSignals c = control_for(Op::Unknown);
    EXPECT_FALSE(c.reg_write);
    EXPECT_FALSE(c.mem_read);
    EXPECT_FALSE(c.mem_write);
    EXPECT_FALSE(c.branch);
    EXPECT_FALSE(c.jump);
}
