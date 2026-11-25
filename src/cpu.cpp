#include "cpu.hpp"

#include <sstream>
#include <stdexcept>

namespace mips {

namespace {

bool is_shift(Op op) {
    return op == Op::Sll || op == Op::Srl || op == Op::Sra;
}

// andi and ori zero-extend their immediate; addi, slti, lw, sw, beq and bne sign-extend it.
bool zero_extends_imm(Op op) {
    return op == Op::Andi || op == Op::Ori || op == Op::Lui;
}

}  // namespace

Cpu::Cpu(std::uint32_t mem_bytes) : mem_(mem_bytes) {}

void Cpu::load_program(std::uint32_t base, const std::vector<std::uint32_t>& words) {
    for (std::size_t i = 0; i < words.size(); ++i) {
        mem_.write32(base + static_cast<std::uint32_t>(4 * i), words[i]);
    }
}

StepTrace Cpu::step() {
    StepTrace t;
    t.pc = pc_;

    // IF: fetch the instruction at the PC.
    t.inst = decode(mem_.read32(pc_));
    const Instruction& d = t.inst;

    // ID: decode the instruction and read the registers it names.
    t.ctrl = control_for(d.op);
    if (d.op == Op::Unknown) {
        std::ostringstream msg;
        msg << "unsupported instruction 0x" << std::hex << d.raw << " at pc 0x" << pc_;
        throw std::runtime_error(msg.str());
    }
    const ControlSignals& c = t.ctrl;
    t.rs_value = regs_.read(d.rs);
    t.rt_value = regs_.read(d.rt);

    // EX: the ALU computes a result, an address, or a comparison.
    std::uint32_t a = t.rs_value;
    std::uint32_t b = t.rt_value;
    if (c.alu_src) {
        b = zero_extends_imm(d.op) ? d.imm_zext : static_cast<std::uint32_t>(d.imm_sext);
    }
    if (is_shift(d.op)) {
        a = t.rt_value;
        b = d.shamt;
    }
    if (d.op == Op::Lui) {
        a = 0;
        b = d.imm_zext;
    }
    const AluResult r = alu(c.alu_op, a, b);
    t.alu_a = a;
    t.alu_b = b;
    t.alu_result = r.value;
    t.alu_zero = r.zero;

    // MEM: loads and stores use the ALU result as the address.
    std::uint32_t mem_value = 0;
    if (c.mem_read) {
        t.mem_read = true;
        t.mem_addr = r.value;
        mem_value = mem_.read32(r.value);
        t.mem_data = mem_value;
    }
    if (c.mem_write) {
        t.mem_write = true;
        t.mem_addr = r.value;
        t.mem_data = t.rt_value;
        mem_.write32(r.value, t.rt_value);
    }

    // Next PC: PC+4 unless a branch is taken or a jump happens.
    const std::uint32_t pc_plus4 = pc_ + 4;
    std::uint32_t next = pc_plus4;
    if (c.branch) {
        t.branch_taken = (d.op == Op::Beq) ? r.zero : !r.zero;
        if (t.branch_taken) {
            next = pc_plus4 + (static_cast<std::uint32_t>(d.imm_sext) << 2);
        }
    }
    if (c.jump) {
        if (c.jump_reg) {
            next = t.rs_value;
        } else {
            next = (pc_plus4 & 0xF0000000u) | (d.target << 2);
        }
    }

    // WB: write the result back to the register file.
    if (c.reg_write) {
        t.reg_written = true;
        if (c.link) {
            t.reg_dest = 31;  // $ra
            t.reg_value = pc_plus4;
        } else {
            t.reg_dest = c.reg_dst ? d.rd : d.rt;
            t.reg_value = c.mem_to_reg ? mem_value : r.value;
        }
        regs_.write(t.reg_dest, t.reg_value);
    }

    pc_ = next;
    t.next_pc = next;
    return t;
}

}  // namespace mips
