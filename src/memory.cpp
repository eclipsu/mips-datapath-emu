#include "memory.hpp"

#include <stdexcept>

namespace mips {

Memory::Memory(std::uint32_t size_bytes) : bytes_(size_bytes, 0) {}

void Memory::check(std::uint32_t addr, std::uint32_t width) const {
    if (addr > bytes_.size() || width > bytes_.size() - addr) {
        throw std::out_of_range("memory access out of range");
    }
    if (width == 4 && (addr & 0x3u) != 0) {
        throw std::invalid_argument("unaligned word access");
    }
}

std::uint8_t Memory::read8(std::uint32_t addr) const {
    check(addr, 1);
    return bytes_[addr];
}

std::uint32_t Memory::read32(std::uint32_t addr) const {
    check(addr, 4);
    return (static_cast<std::uint32_t>(bytes_[addr]) << 24) |
           (static_cast<std::uint32_t>(bytes_[addr + 1]) << 16) |
           (static_cast<std::uint32_t>(bytes_[addr + 2]) << 8) |
           static_cast<std::uint32_t>(bytes_[addr + 3]);
}

void Memory::write8(std::uint32_t addr, std::uint8_t value) {
    check(addr, 1);
    bytes_[addr] = value;
}

void Memory::write32(std::uint32_t addr, std::uint32_t value) {
    check(addr, 4);
    bytes_[addr]     = static_cast<std::uint8_t>(value >> 24);
    bytes_[addr + 1] = static_cast<std::uint8_t>(value >> 16);
    bytes_[addr + 2] = static_cast<std::uint8_t>(value >> 8);
    bytes_[addr + 3] = static_cast<std::uint8_t>(value);
}

}  // namespace mips
