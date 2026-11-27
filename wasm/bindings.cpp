// JavaScript bindings for the emulator core (Emscripten embind).
// The web UI calls these; every result is computed here in C++.
// Built by web/scripts/build-wasm.sh.

#include "control.hpp"
#include "cpu.hpp"
#include "decode.hpp"
#include "regfile.hpp"

#include <emscripten/bind.h>

#include <cstdint>
#include <exception>
#include <string>
#include <vector>

namespace {

// Plain copy of mips::Instruction with the enums turned into strings,
// so JavaScript gets one flat object per decoded word.
struct DecodedWord {
    std::uint32_t raw = 0;
    std::string format;     // "R", "I", "J" or "Unknown"
    int op = 0;             // position in mips::Op (0 = Unknown)
    std::string mnemonic;   // mips::mnemonic(op)
    std::uint32_t opcode = 0;
    std::uint32_t rs = 0;
    std::uint32_t rt = 0;
    std::uint32_t rd = 0;
    std::uint32_t shamt = 0;
    std::uint32_t funct = 0;
    std::int32_t imm_sext = 0;
    std::uint32_t imm_zext = 0;
    std::uint32_t target = 0;
    std::string disassembly;  // mips::disassemble(inst)
};

std::string format_name(mips::Format f) {
    switch (f) {
        case mips::Format::R: return "R";
        case mips::Format::I: return "I";
        case mips::Format::J: return "J";
        case mips::Format::Unknown: return "Unknown";
    }
    return "Unknown";
}

DecodedWord decode_word(std::uint32_t word) {
    const mips::Instruction i = mips::decode(word);
    DecodedWord d;
    d.raw = i.raw;
    d.format = format_name(i.format);
    d.op = static_cast<int>(i.op);
    d.mnemonic = mips::mnemonic(i.op);
    d.opcode = i.opcode;
    d.rs = i.rs;
    d.rt = i.rt;
    d.rd = i.rd;
    d.shamt = i.shamt;
    d.funct = i.funct;
    d.imm_sext = i.imm_sext;
    d.imm_zext = i.imm_zext;
    d.target = i.target;
    d.disassembly = mips::disassemble(i);
    return d;
}

std::string register_name(std::uint32_t reg) {
    return reg < mips::RegisterFile::kCount
               ? mips::RegisterFile::name(static_cast<std::uint8_t>(reg))
               : std::string{};
}

std::string alu_op_name(mips::AluOp op) {
    switch (op) {
        case mips::AluOp::Add: return "add";
        case mips::AluOp::Sub: return "sub";
        case mips::AluOp::And: return "and";
        case mips::AluOp::Or: return "or";
        case mips::AluOp::Xor: return "xor";
        case mips::AluOp::Nor: return "nor";
        case mips::AluOp::Slt: return "slt";
        case mips::AluOp::Sltu: return "sltu";
        case mips::AluOp::Sll: return "sll";
        case mips::AluOp::Srl: return "srl";
        case mips::AluOp::Sra: return "sra";
        case mips::AluOp::Lui: return "lui";
    }
    return "add";
}

// mips::ControlSignals with the ALU operation as a string.
struct Control {
    bool reg_dst = false;
    bool alu_src = false;
    bool mem_read = false;
    bool mem_write = false;
    bool mem_to_reg = false;
    bool reg_write = false;
    bool branch = false;
    bool jump = false;
    bool jump_reg = false;
    bool link = false;
    std::string alu_op;
};

Control to_control(const mips::ControlSignals& c) {
    Control out;
    out.reg_dst = c.reg_dst;
    out.alu_src = c.alu_src;
    out.mem_read = c.mem_read;
    out.mem_write = c.mem_write;
    out.mem_to_reg = c.mem_to_reg;
    out.reg_write = c.reg_write;
    out.branch = c.branch;
    out.jump = c.jump;
    out.jump_reg = c.jump_reg;
    out.link = c.link;
    out.alu_op = alu_op_name(c.alu_op);
    return out;
}

// mips::control_for(decode(word)).op
Control control_word(std::uint32_t word) {
    return to_control(mips::control_for(mips::decode(word).op));
}

// Flat copy of mips::StepTrace. `error` is set when step() threw.
struct Trace {
    std::uint32_t fetched = 0;  // word at the PC before step(), read by the bindings
    std::uint32_t pc = 0;
    std::uint32_t raw = 0;
    Control ctrl;
    std::uint32_t rs_value = 0;
    std::uint32_t rt_value = 0;
    std::uint32_t alu_a = 0;
    std::uint32_t alu_b = 0;
    std::uint32_t alu_result = 0;
    bool alu_zero = false;
    bool mem_read = false;
    bool mem_write = false;
    std::uint32_t mem_addr = 0;
    std::uint32_t mem_data = 0;
    bool reg_written = false;
    std::uint32_t reg_dest = 0;
    std::uint32_t reg_value = 0;
    bool branch_taken = false;
    std::uint32_t next_pc = 0;
    std::string error;
};

// A whole single-cycle CPU (mips::Cpu) the page can load, poke and step.
class Machine {
public:
    explicit Machine(std::uint32_t mem_bytes) : cpu_(mem_bytes) {}

    std::uint32_t memSize() const { return cpu_.memory().size(); }
    std::uint32_t pc() const { return cpu_.pc(); }
    void setPc(std::uint32_t pc) { cpu_.set_pc(pc); }

    std::uint32_t reg(std::uint32_t r) const {
        return r < mips::RegisterFile::kCount ? cpu_.regs().read(static_cast<std::uint8_t>(r)) : 0;
    }
    void setReg(std::uint32_t r, std::uint32_t v) {
        if (r < mips::RegisterFile::kCount) cpu_.regs().write(static_cast<std::uint8_t>(r), v);
    }

    // Out-of-range or unaligned reads give 0 so the page never sees an exception.
    std::uint32_t readWord(std::uint32_t addr) const {
        try {
            return cpu_.memory().read32(addr);
        } catch (const std::exception&) {
            return 0;
        }
    }
    bool writeWord(std::uint32_t addr, std::uint32_t v) {
        try {
            cpu_.memory().write32(addr, v);
            return true;
        } catch (const std::exception&) {
            return false;
        }
    }

    Trace step() {
        Trace out;
        out.pc = cpu_.pc();
        out.fetched = readWord(out.pc);
        try {
            const mips::StepTrace t = cpu_.step();
            out.pc = t.pc;
            out.raw = t.inst.raw;
            out.ctrl = to_control(t.ctrl);
            out.rs_value = t.rs_value;
            out.rt_value = t.rt_value;
            out.alu_a = t.alu_a;
            out.alu_b = t.alu_b;
            out.alu_result = t.alu_result;
            out.alu_zero = t.alu_zero;
            out.mem_read = t.mem_read;
            out.mem_write = t.mem_write;
            out.mem_addr = t.mem_addr;
            out.mem_data = t.mem_data;
            out.reg_written = t.reg_written;
            out.reg_dest = t.reg_dest;
            out.reg_value = t.reg_value;
            out.branch_taken = t.branch_taken;
            out.next_pc = t.next_pc;
        } catch (const std::exception& e) {
            out.error = e.what();
        }
        return out;
    }

private:
    mips::Cpu cpu_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(mipscore) {
    emscripten::value_object<DecodedWord>("DecodedWord")
        .field("raw", &DecodedWord::raw)
        .field("format", &DecodedWord::format)
        .field("op", &DecodedWord::op)
        .field("mnemonic", &DecodedWord::mnemonic)
        .field("opcode", &DecodedWord::opcode)
        .field("rs", &DecodedWord::rs)
        .field("rt", &DecodedWord::rt)
        .field("rd", &DecodedWord::rd)
        .field("shamt", &DecodedWord::shamt)
        .field("funct", &DecodedWord::funct)
        .field("imm_sext", &DecodedWord::imm_sext)
        .field("imm_zext", &DecodedWord::imm_zext)
        .field("target", &DecodedWord::target)
        .field("disassembly", &DecodedWord::disassembly);

    emscripten::function("decode", &decode_word);
    emscripten::function("registerName", &register_name);

    emscripten::value_object<Control>("Control")
        .field("reg_dst", &Control::reg_dst)
        .field("alu_src", &Control::alu_src)
        .field("mem_read", &Control::mem_read)
        .field("mem_write", &Control::mem_write)
        .field("mem_to_reg", &Control::mem_to_reg)
        .field("reg_write", &Control::reg_write)
        .field("branch", &Control::branch)
        .field("jump", &Control::jump)
        .field("jump_reg", &Control::jump_reg)
        .field("link", &Control::link)
        .field("alu_op", &Control::alu_op);
    emscripten::function("control", &control_word);

    emscripten::value_object<Trace>("Trace")
        .field("fetched", &Trace::fetched)
        .field("pc", &Trace::pc)
        .field("raw", &Trace::raw)
        .field("ctrl", &Trace::ctrl)
        .field("rs_value", &Trace::rs_value)
        .field("rt_value", &Trace::rt_value)
        .field("alu_a", &Trace::alu_a)
        .field("alu_b", &Trace::alu_b)
        .field("alu_result", &Trace::alu_result)
        .field("alu_zero", &Trace::alu_zero)
        .field("mem_read", &Trace::mem_read)
        .field("mem_write", &Trace::mem_write)
        .field("mem_addr", &Trace::mem_addr)
        .field("mem_data", &Trace::mem_data)
        .field("reg_written", &Trace::reg_written)
        .field("reg_dest", &Trace::reg_dest)
        .field("reg_value", &Trace::reg_value)
        .field("branch_taken", &Trace::branch_taken)
        .field("next_pc", &Trace::next_pc)
        .field("error", &Trace::error);

    emscripten::class_<Machine>("Machine")
        .constructor<std::uint32_t>()
        .function("memSize", &Machine::memSize)
        .function("pc", &Machine::pc)
        .function("setPc", &Machine::setPc)
        .function("reg", &Machine::reg)
        .function("setReg", &Machine::setReg)
        .function("readWord", &Machine::readWord)
        .function("writeWord", &Machine::writeWord)
        .function("step", &Machine::step);
}
