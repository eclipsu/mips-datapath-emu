// embind bindings for the web UI. Built by web/scripts/build-wasm.sh.

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

    emscripten::function("decode", &decode_word);
    emscripten::function("registerName", &register_name);
}
