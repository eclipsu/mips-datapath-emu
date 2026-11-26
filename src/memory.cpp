#include "memory.hpp"

#include <stdexcept>
#include <cstdint>


namespace mips {

Memory::Memory(std::uint32_t size_btyes) {
    bytes_.assign(size_btyes, 0);
}

void Memory::check(std::uint32_t addr, std::uint32_t width) const {
    if (addr > bytes_.size() || width > bytes_.size() - addr) {
        throw std::out_of_range("memory access out of range");
    }
    if (width == 4 && addr % 4 != 0) {
        throw std::invalid_argument("unaligned word access");
    }
}

std::uint8_t Memory::read8(std::uint32_t addr) const {
    check(addr, 1);
    return bytes_[addr];
}

std::uint32_t Memory::read32(std::uint32_t addr) const {
    check(addr, 4);

    std::uint32_t byte0 = static_cast<std::uint32_t>(bytes_[addr + 0]);
    std::uint32_t byte1 = static_cast<std::uint32_t>(bytes_[addr + 1]);
    std::uint32_t byte2 = static_cast<std::uint32_t>(bytes_[addr + 2]);
    std::uint32_t byte3 = static_cast<std::uint32_t>(bytes_[addr + 3]);

    return (byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3;
}

void Memory::write8(std::uint32_t addr, std::uint8_t value) {
    check(addr, 1);
    bytes_[addr] = value;
}

void Memory::write32(std::uint32_t addr, std::uint32_t value) {
    check(addr, 4);
    bytes_[addr + 0] = static_cast<std::uint8_t>((value >> 24) & 0xFF);
    bytes_[addr + 1] = static_cast<std::uint8_t>((value >> 16) & 0xFF);
    bytes_[addr + 2] = static_cast<std::uint8_t>((value >> 8) & 0xFF);
    bytes_[addr + 3] = static_cast<std::uint8_t>(value & 0xFF);
}

}  // namespace mips
