#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string_view>

namespace mips {

// 32 general-purpose registers. Register $zero (index 0) always reads as 0,
// and writes to it are silently ignored.
class RegisterFile {
public:
    static constexpr std::uint8_t kCount = 32;

    std::uint32_t read(std::uint8_t reg) const;
    void write(std::uint8_t reg, std::uint32_t value);

    // Conventional name, e.g. "$t0" for register 8.
    static const char* name(std::uint8_t reg);

    // Accepts "$t0", "t0", "$8", or "8". Returns nullopt if the name is unknown.
    static std::optional<std::uint8_t> index_of(std::string_view name);

private:
    std::array<std::uint32_t, kCount> regs_{};
};

}  // namespace mips
