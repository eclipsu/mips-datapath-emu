#pragma once

#include "control.hpp"
#include "decode.hpp"
#include "memory.hpp"
#include "regfile.hpp"

#include <cstdint>
#include <vector>

namespace mips {

// Everything that happened in one instruction's trip through the datapath.
// The UI draws from this, so every intermediate value is recorded.
struct StepTrace {
    std::uint32_t pc = 0;           // address the instruction was fetched from
    Instruction inst{};             // decoded fields
    ControlSignals ctrl{};          // control signals for this instruction

    std::uint32_t rs_value = 0;     // Read data 1
    std::uint32_t rt_value = 0;     // Read data 2

    std::uint32_t alu_a = 0;        // ALU input A
    std::uint32_t alu_b = 0;        // ALU input B (register or sign/zero-extended immediate)
    std::uint32_t alu_result = 0;
    bool alu_zero = false;

    bool mem_read = false;
    bool mem_write = false;
    std::uint32_t mem_addr = 0;
    std::uint32_t mem_data = 0;

    bool reg_written = false;
    std::uint8_t reg_dest = 0;
    std::uint32_t reg_value = 0;

    bool branch_taken = false;
    std::uint32_t next_pc = 0;
};

// Single-cycle MIPS CPU: each call to step() completes one whole instruction.
class Cpu {
public:
    explicit Cpu(std::uint32_t mem_bytes = 64 * 1024);

    Memory& memory() { return mem_; }
    const Memory& memory() const { return mem_; }
    RegisterFile& regs() { return regs_; }
    const RegisterFile& regs() const { return regs_; }

    std::uint32_t pc() const { return pc_; }
    void set_pc(std::uint32_t pc) { pc_ = pc; }

    // Writes consecutive instruction words starting at `base`.
    void load_program(std::uint32_t base, const std::vector<std::uint32_t>& words);

    // Throws std::runtime_error on an unsupported instruction.
    StepTrace step();

private:
    Memory mem_;
    RegisterFile regs_;
    std::uint32_t pc_ = 0;
};

}  // namespace mips
