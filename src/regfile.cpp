#include "regfile.hpp"

#include <cctype>
#include <string>

namespace mips {

namespace {

constexpr const char* kNames[RegisterFile::kCount] = {
    "$zero", "$at", "$v0", "$v1", "$a0", "$a1", "$a2", "$a3",
    "$t0",   "$t1", "$t2", "$t3", "$t4", "$t5", "$t6", "$t7",
    "$s0",   "$s1", "$s2", "$s3", "$s4", "$s5", "$s6", "$s7",
    "$t8",   "$t9", "$k0", "$k1", "$gp", "$sp", "$fp", "$ra",
};

}  // namespace

std::uint32_t RegisterFile::read(std::uint8_t reg) const {
    return regs_[reg & 31u];
}

void RegisterFile::write(std::uint8_t reg, std::uint32_t value) {
    const std::uint8_t idx = reg & 31u;
    if (idx == 0) {
        return;  // $zero is hardwired
    }
    regs_[idx] = value;
}

const char* RegisterFile::name(std::uint8_t reg) {
    return kNames[reg & 31u];
}

std::optional<std::uint8_t> RegisterFile::index_of(std::string_view name) {
    std::string s(name);
    if (!s.empty() && s[0] == '$') {
        s.erase(0, 1);
    }
    if (s.empty()) {
        return std::nullopt;
    }

    // Numeric form: "8"
    if (std::isdigit(static_cast<unsigned char>(s[0]))) {
        int value = 0;
        for (char c : s) {
            if (!std::isdigit(static_cast<unsigned char>(c))) {
                return std::nullopt;
            }
            value = value * 10 + (c - '0');
            if (value > 31) {
                return std::nullopt;
            }
        }
        return static_cast<std::uint8_t>(value);
    }

    // Symbolic form: "t0"
    for (std::uint8_t i = 0; i < kCount; ++i) {
        if (std::string_view(kNames[i]).substr(1) == s) {
            return i;
        }
    }
    return std::nullopt;
}

}  // namespace mips
