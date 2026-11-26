// Debug helper: decode one instruction word and print every field of the result.
// Usage: make probe WORD=0x2237FFF1
//
// This only prints what decode() returns; it does not check anything.
// The tests in tests/test_decode.cpp are what decide right or wrong.

#include "decode.hpp"

#include <bitset>
#include <cstdint>
#include <cstdlib>
#include <iostream>

namespace {

const char* format_name(mips::Format f) {
    switch (f) {
        case mips::Format::R: return "R";
        case mips::Format::I: return "I";
        case mips::Format::J: return "J";
        case mips::Format::Unknown: return "Unknown";
    }
    return "(invalid enum value)";
}

// Prints a field as decimal, hex and binary (only the low `bits` bits).
template <std::size_t Bits>
void field(const char* label, std::uint32_t value) {
    std::cout << "  " << label << " = " << std::dec << value << "  (0x" << std::hex << value
              << std::dec << ", 0b" << std::bitset<Bits>(value) << ")\n";
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: " << argv[0] << " <word, e.g. 0x2237FFF1>\n";
        return 1;
    }
    const auto word = static_cast<std::uint32_t>(std::strtoul(argv[1], nullptr, 0));
    const mips::Instruction i = mips::decode(word);

    std::cout << "word   0x" << std::hex << word << std::dec << "\n";
    std::cout << "       0b" << std::bitset<32>(word) << "\n\n";

    std::cout << "  raw     = 0x" << std::hex << i.raw << std::dec << "\n";
    std::cout << "  format  = " << format_name(i.format) << "\n";
    std::cout << "  op      = " << static_cast<int>(i.op)
              << "  (enum position in decode.hpp; 0 = Unknown)\n";
    std::cout << "  mnemonic(op) = \"" << mips::mnemonic(i.op) << "\"\n";
    field<6>("opcode ", i.opcode);
    field<5>("rs     ", i.rs);
    field<5>("rt     ", i.rt);
    field<5>("rd     ", i.rd);
    field<5>("shamt  ", i.shamt);
    field<6>("funct  ", i.funct);
    std::cout << "  imm_sext = " << i.imm_sext << "\n";
    field<16>("imm_zext", i.imm_zext);
    field<26>("target ", i.target);
    std::cout << "\n  disassemble = \"" << mips::disassemble(i) << "\"\n";
    return 0;
}
