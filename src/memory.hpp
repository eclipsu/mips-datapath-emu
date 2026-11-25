#pragma once

#include <cstdint>
#include <vector>

namespace mips {

// Byte-addressable main memory, big-endian (the MIPS default used by SPIM and MARS).
// Word accesses must be 4-byte aligned; violations throw.
class Memory {
public:
    explicit Memory(std::uint32_t size_bytes);

    std::uint8_t read8(std::uint32_t addr) const;
    std::uint32_t read32(std::uint32_t addr) const;

    void write8(std::uint32_t addr, std::uint8_t value);
    void write32(std::uint32_t addr, std::uint32_t value);

    std::uint32_t size() const { return static_cast<std::uint32_t>(bytes_.size()); }

private:
    void check(std::uint32_t addr, std::uint32_t width) const;

    std::vector<std::uint8_t> bytes_;
};

}  // namespace mips
