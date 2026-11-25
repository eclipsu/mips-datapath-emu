#include "cpu.hpp"
#include "encode.hpp"

#include <gtest/gtest.h>

#include <stdexcept>

using namespace mips;

namespace {

// Register numbers used in the tests.
constexpr std::uint8_t kZero = 0, kT0 = 8, kT1 = 9, kT2 = 10, kT3 = 11, kRa = 31;

// Opcodes used in the tests.
constexpr std::uint8_t kOpBeq = 4, kOpBne = 5, kOpAddi = 8, kOpLw = 35, kOpSw = 43;
constexpr std::uint8_t kOpJ = 2, kOpJal = 3;
constexpr std::uint8_t kFunctAdd = 0x20;

}  // namespace

TEST(Cpu, RunsAddLoadStoreProgram) {
    Cpu cpu(1024);
    cpu.load_program(0, {
        enc_i(kOpAddi, kZero, kT0, 5),           // addi $t0, $zero, 5
        enc_i(kOpAddi, kZero, kT1, 7),           // addi $t1, $zero, 7
        enc_r(kFunctAdd, kT0, kT1, kT2),         // add  $t2, $t0, $t1
        enc_i(kOpSw, kZero, kT2, 0x100),         // sw   $t2, 0x100($zero)  (data kept away from code)
        enc_i(kOpLw, kZero, kT3, 0x100),         // lw   $t3, 0x100($zero)
    });

    for (int i = 0; i < 5; ++i) {
        cpu.step();
    }

    EXPECT_EQ(cpu.regs().read(kT2), 12u);
    EXPECT_EQ(cpu.regs().read(kT3), 12u);
    EXPECT_EQ(cpu.memory().read32(0x100), 12u);
    EXPECT_EQ(cpu.pc(), 20u);
}

TEST(Cpu, WritesToZeroAreIgnoredInAProgram) {
    Cpu cpu(1024);
    cpu.load_program(0, {enc_i(kOpAddi, kZero, kZero, 5)});  // addi $zero, $zero, 5
    cpu.step();
    EXPECT_EQ(cpu.regs().read(kZero), 0u);
}

// beq with offset 1 at address 0 targets (0 + 4) + 1*4 = 8, skipping the instruction at 4.
TEST(Cpu, TakenBranchSkipsInstruction) {
    Cpu cpu(1024);
    cpu.load_program(0, {
        enc_i(kOpBeq, kZero, kZero, 1),          // beq $zero, $zero, +1
        enc_i(kOpAddi, kZero, kT0, 99),          // skipped
        enc_i(kOpAddi, kZero, kT1, 1),           // addi $t1, $zero, 1
    });

    StepTrace t = cpu.step();
    EXPECT_TRUE(t.branch_taken);
    EXPECT_EQ(t.next_pc, 8u);

    cpu.step();
    EXPECT_EQ(cpu.regs().read(kT0), 0u);
    EXPECT_EQ(cpu.regs().read(kT1), 1u);
}

// Lecture 19, Q6: bne at address 0x54 with offset -6 targets 0x40 when taken.
TEST(Cpu, BneBackwardTargetMatchesLectureExample) {
    Cpu cpu(1024);
    cpu.set_pc(0x54);
    cpu.memory().write32(0x54, enc_i(kOpBne, kT1, kZero, -6));
    cpu.regs().write(kT1, 1);  // $t1 != $zero, so the branch is taken

    StepTrace t = cpu.step();
    EXPECT_TRUE(t.branch_taken);
    EXPECT_EQ(cpu.pc(), 0x40u);
}

TEST(Cpu, NotTakenBranchFallsThrough) {
    Cpu cpu(1024);
    cpu.set_pc(0x20);
    cpu.memory().write32(0x20, enc_i(kOpBne, kT1, kZero, -6));
    cpu.regs().write(kT1, 0);  // equal, so bne is not taken

    StepTrace t = cpu.step();
    EXPECT_FALSE(t.branch_taken);
    EXPECT_EQ(cpu.pc(), 0x24u);
}

// j to address 0x10 stores target field 4 (0x10 / 4).
TEST(Cpu, JumpSetsPcFromTargetField) {
    Cpu cpu(1024);
    cpu.load_program(0, {enc_j(kOpJ, 4)});
    cpu.step();
    EXPECT_EQ(cpu.pc(), 0x10u);
}

TEST(Cpu, JalSavesReturnAddressInRa) {
    Cpu cpu(1024);
    cpu.load_program(0, {enc_j(kOpJal, 4)});
    cpu.step();
    EXPECT_EQ(cpu.pc(), 0x10u);
    EXPECT_EQ(cpu.regs().read(kRa), 4u);  // PC + 4 of the jal
}

TEST(Cpu, TraceExposesControlAndAluValues) {
    Cpu cpu(1024);
    cpu.regs().write(kT0, 3);
    cpu.regs().write(kT1, 4);
    cpu.load_program(0, {enc_r(kFunctAdd, kT0, kT1, kT2)});

    StepTrace t = cpu.step();
    EXPECT_EQ(t.inst.op, Op::Add);
    EXPECT_TRUE(t.ctrl.reg_write);
    EXPECT_EQ(t.rs_value, 3u);
    EXPECT_EQ(t.rt_value, 4u);
    EXPECT_EQ(t.alu_result, 7u);
    EXPECT_TRUE(t.reg_written);
    EXPECT_EQ(t.reg_dest, kT2);
    EXPECT_EQ(t.reg_value, 7u);
}

TEST(Cpu, UnsupportedInstructionThrows) {
    Cpu cpu(1024);
    cpu.load_program(0, {enc_i(63, 0, 0, 0)});
    EXPECT_THROW(cpu.step(), std::runtime_error);
}
