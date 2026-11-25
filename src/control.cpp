#include "control.hpp"

namespace mips {

namespace {

ControlSignals rtype(AluOp op) {
    ControlSignals c;
    c.reg_dst = true;
    c.reg_write = true;
    c.alu_op = op;
    return c;
}

ControlSignals itype_alu(AluOp op) {
    ControlSignals c;
    c.alu_src = true;
    c.reg_write = true;
    c.alu_op = op;
    return c;
}

}  // namespace

ControlSignals control_for(Op op) {
    switch (op) {
        case Op::Add:  return rtype(AluOp::Add);
        case Op::Sub:  return rtype(AluOp::Sub);
        case Op::And:  return rtype(AluOp::And);
        case Op::Or:   return rtype(AluOp::Or);
        case Op::Xor:  return rtype(AluOp::Xor);
        case Op::Nor:  return rtype(AluOp::Nor);
        case Op::Slt:  return rtype(AluOp::Slt);
        case Op::Sll:  return rtype(AluOp::Sll);
        case Op::Srl:  return rtype(AluOp::Srl);
        case Op::Sra:  return rtype(AluOp::Sra);

        case Op::Jr: {
            ControlSignals c;
            c.jump = true;
            c.jump_reg = true;
            return c;
        }

        case Op::Addi: return itype_alu(AluOp::Add);
        case Op::Slti: return itype_alu(AluOp::Slt);
        case Op::Andi: return itype_alu(AluOp::And);
        case Op::Ori:  return itype_alu(AluOp::Or);
        case Op::Lui:  return itype_alu(AluOp::Lui);

        case Op::Lw: {
            ControlSignals c = itype_alu(AluOp::Add);
            c.mem_read = true;
            c.mem_to_reg = true;
            return c;
        }

        case Op::Sw: {
            ControlSignals c;
            c.alu_src = true;
            c.mem_write = true;
            c.alu_op = AluOp::Add;  // address = base + offset
            return c;
        }

        case Op::Beq:
        case Op::Bne: {
            ControlSignals c;
            c.branch = true;
            c.alu_op = AluOp::Sub;  // the zero flag tells us whether rs == rt
            return c;
        }

        case Op::J: {
            ControlSignals c;
            c.jump = true;
            return c;
        }

        case Op::Jal: {
            ControlSignals c;
            c.jump = true;
            c.link = true;
            c.reg_write = true;  // writes $ra
            return c;
        }

        case Op::Unknown:
            return ControlSignals{};
    }
    return ControlSignals{};
}

}  // namespace mips
