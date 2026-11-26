#include "decode.hpp"
#include "regfile.hpp"

#include <cstdint>
#include <sstream>
#include <string>

namespace mips {

namespace {

std::string hex(std::uint32_t value) {
    std::ostringstream os;
    os << "0x" << std::hex << value;
    return os.str();
}

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
        case 0x08: return Op::Addi;
        case 0x0A: return Op::Slti;
        case 0x0C: return Op::Andi;
        case 0x0D: return Op::Ori;
        case 0x23: return Op::Lw;
        case 0x0F: return Op::Lui;
        case 0x2B: return Op::Sw;
        case 0x04: return Op::Beq;
        case 0x05: return Op::Bne;
        case 0x02: return Op::J;
        case 0x03: return Op::Jal;
        default:   return Op::Unknown;
    }
}

} // namespace


Instruction decode(std::uint32_t word) {
    Instruction inst;
    inst.raw = word;

    std::uint8_t opcode = (word >> 26) & 0x3F;
    std::uint8_t rs     = (word >> 21) & 0x1F;
    std::uint8_t rt     = (word >> 16) & 0x1F;
    std::uint8_t rd     = (word >> 11) & 0x1F;
    std::uint8_t shamt  = (word >> 6) & 0x1F;
    std::uint8_t funct  = word & 0x3F;

    std::uint32_t imm_zext = word & 0xFFFF;
    std::int32_t  imm_sext = static_cast<std::int16_t>(imm_zext);
    std::uint32_t target   = word & 0x03FFFFFF;

    inst.opcode   = opcode;
    inst.rs       = rs;
    inst.rt       = rt;
    inst.rd       = rd;
    inst.shamt    = shamt;
    inst.funct    = funct;
    inst.imm_sext = imm_sext;
    inst.imm_zext = imm_zext;
    inst.target   = target;

    switch (opcode) {
        case 0:
            inst.format = Format::R;
            inst.op = decode_funct(funct);
            break;

        case 2:
        case 3:
            inst.format = Format::J;
            inst.op = decode_opcode(opcode);
            break;

        default:
            inst.format = Format::I;
            inst.op = decode_opcode(opcode);
            break;
    }

    if (inst.op == Op::Unknown) {
        inst.format = Format::Unknown;
    }

    return inst;
}


std::string mnemonic(Op op) {
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

        case Op::Slti: return "slti";
        case Op::Addi: return "addi";
        case Op::Andi: return "andi";
        case Op::Ori:  return "ori";
        case Op::Lui:  return "lui";
        case Op::Lw:   return "lw";
        case Op::Sw:   return "sw";
        case Op::Beq:  return "beq";
        case Op::Bne:  return "bne";
        case Op::J:    return "j";
        case Op::Jal:  return "jal";

        case Op::Unknown:
        default:
            return "???";
    }
}


std::string disassemble(const Instruction& inst) {
    std::string dis;
    std::string name = mnemonic(inst.op);

    switch (inst.format) {
        case Format::R:
            switch (inst.op) {
                // rd, rt, shamt
                case Op::Sll:
                case Op::Srl:
                case Op::Sra:
                    dis = name + " " +
                          RegisterFile::name(inst.rd) + ", " +
                          RegisterFile::name(inst.rt) + ", " +
                          std::to_string(inst.shamt);
                    break;

                // rs
                case Op::Jr:
                    dis = name + " " + RegisterFile::name(inst.rs);
                    break;

                // rd, rs, rt
                case Op::Add:
                case Op::Sub:
                case Op::And:
                case Op::Or:
                case Op::Xor:
                case Op::Nor:
                case Op::Slt:
                    dis = name + " " +
                          RegisterFile::name(inst.rd) + ", " +
                          RegisterFile::name(inst.rs) + ", " +
                          RegisterFile::name(inst.rt);
                    break;

                default:
                    break;
            }
            break;

        case Format::I:
            switch (inst.op) {
                case Op::Lw:
                case Op::Sw:
                    dis = name + " " +
                          RegisterFile::name(inst.rt) + ", " +
                          std::to_string(inst.imm_sext) + "(" +
                          RegisterFile::name(inst.rs) + ")";
                    break;

                case Op::Beq:
                case Op::Bne:
                    dis = name + " " +
                          RegisterFile::name(inst.rs) + ", " +
                          RegisterFile::name(inst.rt) + ", " +
                          std::to_string(inst.imm_sext);
                    break;

                case Op::Addi:
                case Op::Slti:
                    dis = name + " " +
                          RegisterFile::name(inst.rt) + ", " +
                          RegisterFile::name(inst.rs) + ", " +
                          std::to_string(inst.imm_sext);
                    break;

                case Op::Andi:
                case Op::Ori:
                    dis = name + " " +
                          RegisterFile::name(inst.rt) + ", " +
                          RegisterFile::name(inst.rs) + ", " +
                          std::to_string(inst.imm_zext);
                    break;

                case Op::Lui:
                    dis = name + " " +
                          RegisterFile::name(inst.rt) + ", " +
                          std::to_string(inst.imm_zext);
                    break;

                default:
                    break;
            }
            break;

        case Format::J:
            dis = name + " " + hex(inst.target << 2);
            break;

        default:
            break;
    }

    return dis;
}

} // namespace mips