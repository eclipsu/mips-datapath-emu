#pragma once

#include "alu.hpp"
#include "decode.hpp"

namespace mips {

// The control signals of the single-cycle datapath (Lecture 19, slides 24-25).
struct ControlSignals {
    bool reg_dst = false;     // 1: destination is rd (R-type); 0: destination is rt
    bool alu_src = false;     // 1: second ALU operand is the immediate; 0: it is rt
    bool mem_read = false;    // lw
    bool mem_write = false;   // sw
    bool mem_to_reg = false;  // 1: write-back data comes from memory; 0: from the ALU
    bool reg_write = false;   // write the destination register
    bool branch = false;      // beq / bne
    bool jump = false;        // j, jal, jr
    bool jump_reg = false;    // jr: target comes from rs
    bool link = false;        // jal: save PC+4 in $ra
    AluOp alu_op = AluOp::Add;
};

ControlSignals control_for(Op op);

}  // namespace mips
