#include "cpu.hpp"

#include "alu.hpp"

#include <stdexcept>
#include <cstdint>

namespace mips {

namespace {
bool is_shift(Op op) {
    return op == Op::Srl || op == Op::Sll || op == Op::Sra; 
}

bool does_zero_extend(Op op) {
    return op == Op::Andi || op == Op::Ori || op == Op::Lui; 
}
}  // namespace

Cpu::Cpu(std::uint32_t mem_bytes) : mem_(mem_bytes) {}

void Cpu::load_program(std::uint32_t base, const std::vector<std::uint32_t>& words) {
    for(std::size_t i = 0; i < words.size(); ++i) {
        std::uint32_t addr = base + static_cast<std::uint32_t>(4 * i);
        mem_.write32(addr, words[i]);
    }
}

StepTrace Cpu::step() {
    StepTrace trace;
    trace.pc = pc_;

    // FETCH
     std::uint32_t word = mem_.read32(pc_);

    // DECODE
    trace.inst = decode(word);
    trace.ctrl = control_for(trace.inst.op);

    if(trace.inst.op == Op::Unknown) {
        throw std::runtime_error("Unknown instruction");
    }

    
    // EXECUTE
    trace.rs_value = regs_.read(trace.inst.rs);
    trace.rt_value = regs_.read(trace.inst.rt);

    std::uint32_t a = trace.rs_value;
    std::uint32_t b = trace.rt_value;

    if (trace.ctrl.alu_src) {
        b = does_zero_extend(trace.inst.op) ? trace.inst.imm_zext : trace.inst.imm_sext;
    }

    if (is_shift(trace.inst.op)) {
        a = trace.rt_value;
        b = trace.inst.shamt;
    }

    if (trace.inst.op == Op::Lui) {
        b = trace.inst.imm_sext;
    }

    AluResult result = alu(trace.ctrl.alu_op, a, b);
    trace.alu_a = a;
    trace.alu_b = b;
    trace.alu_result = result.value;
    trace.alu_zero = result.zero;
    
    // MEMORY
    
    // lw
    // rt = addr + imm
    std::uint32_t mem_value = 0;
    if(trace.ctrl.mem_read) {
        mem_value = mem_.read32(trace.alu_result);
        trace.mem_read = true;
        trace.mem_addr = trace.alu_result;
        trace.mem_data = mem_value;
    }

    // sw
    // addr + imm = rt
    if(trace.ctrl.mem_write) {
        mem_.write32(trace.alu_result, trace.rt_value);
        trace.mem_write = true;
        trace.mem_addr = trace.alu_result;
        trace.mem_data = trace.rt_value;
    }

    // pc + 4 by default.
    const std::uint32_t pc_plus4 = pc_ + 4;
    std::uint32_t next = pc_plus4;

    // target = (pc + 4) + 4 * offset
    // 4 * offset is equivalent to << 2
    if (trace.ctrl.branch) {
        trace.branch_taken = (trace.inst.op == Op::Beq) ? trace.alu_zero : !trace.alu_zero;
        if (trace.branch_taken) {
            next = pc_plus4 + (static_cast<std::uint32_t>(trace.inst.imm_sext) << 2);
        }
    }

    // Jumps always happen.
    if (trace.ctrl.jump) {
        if (trace.ctrl.jump_reg) {
            next = trace.rs_value;
        } else {
            // reproducing the jump target 
            // take upper 4 bit, shift left lower 26 by 2
            next = (pc_plus4 & 0xF0000000u) | (trace.inst.target << 2);
        }
    }

    // WRITE BACK
    std::uint32_t w = trace.ctrl.reg_dst ? trace.inst.rd : trace.inst.rt;

    if (trace.ctrl.reg_write) {
        std::uint8_t dest;
        std::uint32_t value;
        if (trace.inst.op == Op::Jal) {
            dest = 31;
            value = pc_plus4;
        }
        else if (trace.ctrl.mem_to_reg) {
            dest = static_cast<std::uint8_t>(w);
            value = trace.mem_data;
        } else {
            dest = static_cast<std::uint8_t>(w);
            value = trace.alu_result;
        }
        regs_.write(dest, value);

        trace.reg_written = true;
        trace.reg_dest = dest;
        trace.reg_value = value;
    }

    pc_ = next;
    trace.next_pc = next;
    return trace;
}

}  // namespace mips
