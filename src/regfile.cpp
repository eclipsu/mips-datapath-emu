#include "regfile.hpp"
#include "array"
#include "string"
#include <charconv>
#include <cstdint>


namespace mips {

std::array<std::string, RegisterFile::kCount> names = {
    "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3",
    "t0",   "t1", "t2", "t3", "t4", "t5", "t6", "t7",
    "s0",   "s1", "s2", "s3", "s4", "s5", "s6", "s7",
    "t8",   "t9", "k0", "k1", "gp", "sp", "fp", "ra"
};

std::uint32_t RegisterFile::read(std::uint8_t reg) const {
    return regs_[reg];
}

void RegisterFile::write(std::uint8_t reg, std::uint32_t value) {
    if (reg != 0) {
        regs_[reg] = value;
    }
}

std::string RegisterFile::name(std::uint8_t reg) {
    std::string prefix = "$";
    return prefix + names[reg];
}

std::optional<std::uint8_t> RegisterFile::index_of(std::string_view name) {
    if (name[0] == '$') {
        name.remove_prefix(1);
    }

    if(name.empty()) {
        return std::nullopt;
    }

    std::uint8_t value = 0;
    auto [ptr, ec] = std::from_chars(name.data(), name.data() + name.size(), value);
    if (ec == std::errc{} && ptr == name.data() + name.size()) {
        return (value < kCount) ? std::optional<std::uint8_t>{value} : std::nullopt;
    }


    for (std::size_t i = 0; i < names.size(); ++i) {
        if (name == names[i]) {
            return static_cast<std::uint8_t>(i);
        }
    }

    return std::nullopt;
}


}
