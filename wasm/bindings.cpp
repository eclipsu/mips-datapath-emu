// embind bindings for the web UI. Built by web/scripts/build-wasm.sh.

#include "control.hpp"
#include "decode.hpp"
#include "regfile.hpp"

#include <emscripten/bind.h>

#include <cstdint>
#include <string>

namespace {

struct DecodedWord {
    std::uint32_t raw = 0;
    std::string format;
    int op = 0;  // index into mips::Op
    std::string mnemonic;
    std::uint32_t opcode = 0;
    std::uint32_t rs = 0;
    std::uint32_t rt = 0;
    std::uint32_t rd = 0;
    std::uint32_t shamt = 0;
    std::uint32_t funct = 0;
    std::int32_t imm_sext = 0;
    std::uint32_t imm_zext = 0;
    std::uint32_t target = 0;
    std::string disassembly;
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

std::string alu_op_name(mips::AluOp op) {
    switch (op) {
        case mips::AluOp::Add:  return "add";
        case mips::AluOp::Sub:  return "sub";
        case mips::AluOp::And:  return "and";
        case mips::AluOp::Or:   return "or";
        case mips::AluOp::Xor:  return "xor";
        case mips::AluOp::Nor:  return "nor";
        case mips::AluOp::Slt:  return "slt";
        case mips::AluOp::Sltu: return "sltu";
        case mips::AluOp::Sll:  return "sll";
        case mips::AluOp::Srl:  return "srl";
        case mips::AluOp::Sra:  return "sra";
        case mips::AluOp::Lui:  return "lui";
    }
    return "?";
}

Control control_for_word(std::uint32_t word) {
    const mips::ControlSignals c = mips::control_for(mips::decode(word).op);
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

std::string register_name(std::uint32_t reg) {
    return reg < mips::RegisterFile::kCount
               ? mips::RegisterFile::name(static_cast<std::uint8_t>(reg))
               : std::string{};
}

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

    emscripten::function("decode", &decode_word);
    emscripten::function("control", &control_for_word);
    emscripten::function("registerName", &register_name);
}
