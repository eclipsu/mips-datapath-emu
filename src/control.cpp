#include "control.hpp"

namespace mips {

namespace {

ControlSignals r_type(AluOp alu_op) {
    ControlSignals c;
    c.reg_dst = true;
    c.reg_write = true;
    c.alu_op = alu_op;
    return c;
}

ControlSignals i_type_alu(AluOp alu_op) {
    ControlSignals c;
    c.alu_src = true;
    c.reg_write = true;
    c.alu_op = alu_op;
    return c;
}

}  // namespace

ControlSignals control_for(Op op) {
    ControlSignals control;

    switch (op) {
        // R-type
        case Op::Add:
            control = r_type(AluOp::Add);
            break;
        case Op::Sub:
            control = r_type(AluOp::Sub);
            break;
        case Op::And:
            control = r_type(AluOp::And);
            break;
        case Op::Or:
            control = r_type(AluOp::Or);
            break;
        case Op::Xor:
            control = r_type(AluOp::Xor);
            break;
        case Op::Nor:
            control = r_type(AluOp::Nor);
            break;
        case Op::Slt:
            control = r_type(AluOp::Slt);
            break;
        case Op::Sll:
            control = r_type(AluOp::Sll);
            break;
        case Op::Srl:
            control = r_type(AluOp::Srl);
            break;
        case Op::Sra:
            control = r_type(AluOp::Sra);
            break;

        // jr: jump to rs, no register write.
        case Op::Jr:
            control.jump = true;
            control.jump_reg = true;
            break;

        // I-type ALU
        case Op::Addi:
            control = i_type_alu(AluOp::Add);
            break;
        case Op::Slti:
            control = i_type_alu(AluOp::Slt);
            break;
        case Op::Andi:
            control = i_type_alu(AluOp::And);
            break;
        case Op::Ori:
            control = i_type_alu(AluOp::Or);
            break;
        case Op::Lui:
            control = i_type_alu(AluOp::Lui);
            break;

        // Memory
        case Op::Lw:
            control.alu_src = true;
            control.mem_read = true;
            control.mem_to_reg = true;
            control.reg_write = true;
            control.alu_op = AluOp::Add;  // address = rs + offset
            break;
        case Op::Sw:
            control.alu_src = true;
            control.mem_write = true;
            control.alu_op = AluOp::Add;  // address = rs + offset
            break;

        case Op::Beq:
        case Op::Bne:
            control.branch = true;
            control.alu_op = AluOp::Sub;
            break;

        case Op::J:
            control.jump = true;
            break;
        case Op::Jal:
            control.jump = true;
            control.link = true;     // save PC+4 in $ra
            control.reg_write = true;
            break;

        case Op::Unknown:
            break;
    }

    return control;
}

}  // namespace mips