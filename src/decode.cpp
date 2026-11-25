#include "decode.hpp"

#include "regfile.hpp"

#include <sstream>

namespace mips {

namespace {

Op decode_funct(std::uint8_t funct) {
    switch (funct) {
        case 0x00: return Op::Sll;
        case 0x02: return Op::Srl;
        case 0x03: return Op::Sra;
        case 0x08: return Op::Jr;
        case 0x20: return Op::Add;
        case 0x22: return Op::Sub;
        case 0x24: return Op::And;
        case 0x25: return Op::Or;
        case 0x26: return Op::Xor;
        case 0x27: return Op::Nor;
        case 0x2A: return Op::Slt;
        default:   return Op::Unknown;
    }
}

Op decode_opcode(std::uint8_t opcode) {
    switch (opcode) {
        case 0x02: return Op::J;
        case 0x03: return Op::Jal;
        case 0x04: return Op::Beq;
        case 0x05: return Op::Bne;
        case 0x08: return Op::Addi;
        case 0x0A: return Op::Slti;
        case 0x0C: return Op::Andi;
        case 0x0D: return Op::Ori;
        case 0x0F: return Op::Lui;
        case 0x23: return Op::Lw;
        case 0x2B: return Op::Sw;
        default:   return Op::Unknown;
    }
}

Format format_of(Op op) {
    switch (op) {
        case Op::Sll: case Op::Srl: case Op::Sra: case Op::Jr:
        case Op::Add: case Op::Sub: case Op::And: case Op::Or:
        case Op::Xor: case Op::Nor: case Op::Slt:
            return Format::R;
        case Op::J: case Op::Jal:
            return Format::J;
        case Op::Unknown:
            return Format::Unknown;
        default:
            return Format::I;
    }
}

}  // namespace

Instruction decode(std::uint32_t word) {
    Instruction inst;
    inst.raw = word;
    inst.opcode = static_cast<std::uint8_t>((word >> 26) & 0x3F);
    inst.rs     = static_cast<std::uint8_t>((word >> 21) & 0x1F);
    inst.rt     = static_cast<std::uint8_t>((word >> 16) & 0x1F);
    inst.rd     = static_cast<std::uint8_t>((word >> 11) & 0x1F);
    inst.shamt  = static_cast<std::uint8_t>((word >> 6) & 0x1F);
    inst.funct  = static_cast<std::uint8_t>(word & 0x3F);
    inst.imm_zext = word & 0xFFFFu;
    inst.imm_sext = static_cast<std::int32_t>(static_cast<std::int16_t>(word & 0xFFFFu));
    inst.target = word & 0x03FFFFFFu;

    inst.op = (inst.opcode == 0) ? decode_funct(inst.funct) : decode_opcode(inst.opcode);
    inst.format = format_of(inst.op);
    return inst;
}

const char* mnemonic(Op op) {
    switch (op) {
        case Op::Sll:  return "sll";
        case Op::Srl:  return "srl";
        case Op::Sra:  return "sra";
        case Op::Jr:   return "jr";
        case Op::Add:  return "add";
        case Op::Sub:  return "sub";
        case Op::And:  return "and";
        case Op::Or:   return "or";
        case Op::Xor:  return "xor";
        case Op::Nor:  return "nor";
        case Op::Slt:  return "slt";
        case Op::Addi: return "addi";
        case Op::Slti: return "slti";
        case Op::Andi: return "andi";
        case Op::Ori:  return "ori";
        case Op::Lui:  return "lui";
        case Op::Lw:   return "lw";
        case Op::Sw:   return "sw";
        case Op::Beq:  return "beq";
        case Op::Bne:  return "bne";
        case Op::J:    return "j";
        case Op::Jal:  return "jal";
        case Op::Unknown: return "???";
    }
    return "???";
}

std::string disassemble(const Instruction& i) {
    std::ostringstream out;
    out << mnemonic(i.op);
    const char* rd = RegisterFile::name(i.rd);
    const char* rs = RegisterFile::name(i.rs);
    const char* rt = RegisterFile::name(i.rt);

    switch (i.op) {
        case Op::Add: case Op::Sub: case Op::And: case Op::Or:
        case Op::Xor: case Op::Nor: case Op::Slt:
            out << ' ' << rd << ", " << rs << ", " << rt;
            break;
        case Op::Sll: case Op::Srl: case Op::Sra:
            out << ' ' << rd << ", " << rt << ", " << static_cast<int>(i.shamt);
            break;
        case Op::Jr:
            out << ' ' << rs;
            break;
        case Op::Addi: case Op::Slti:
            out << ' ' << rt << ", " << rs << ", " << i.imm_sext;
            break;
        case Op::Andi: case Op::Ori:
            out << ' ' << rt << ", " << rs << ", 0x" << std::hex << i.imm_zext << std::dec;
            break;
        case Op::Lui:
            out << ' ' << rt << ", 0x" << std::hex << i.imm_zext << std::dec;
            break;
        case Op::Lw: case Op::Sw:
            out << ' ' << rt << ", " << i.imm_sext << '(' << rs << ')';
            break;
        case Op::Beq: case Op::Bne:
            out << ' ' << rs << ", " << rt << ", " << i.imm_sext;
            break;
        case Op::J: case Op::Jal:
            out << " 0x" << std::hex << (i.target << 2) << std::dec;
            break;
        case Op::Unknown:
            out << " (0x" << std::hex << i.raw << std::dec << ')';
            break;
    }
    return out.str();
}

}  // namespace mips
