#include "memory.hpp"

#include <gtest/gtest.h>

#include <stdexcept>

using mips::Memory;

TEST(Memory, WordIsStoredBigEndian) {
    Memory m(64);
    m.write32(0, 0x11223344);

    EXPECT_EQ(m.read8(0), 0x11);
    EXPECT_EQ(m.read8(1), 0x22);
    EXPECT_EQ(m.read8(2), 0x33);
    EXPECT_EQ(m.read8(3), 0x44);
    EXPECT_EQ(m.read32(0), 0x11223344u);
}

TEST(Memory, ByteWriteIsVisibleToWordRead) {
    Memory m(64);
    m.write32(4, 0);
    m.write8(7, 0xAB);
    EXPECT_EQ(m.read32(4), 0x000000ABu);
}

TEST(Memory, UnalignedWordAccessThrows) {
    Memory m(64);
    EXPECT_THROW(m.read32(2), std::invalid_argument);
    EXPECT_THROW(m.write32(6, 1), std::invalid_argument);
}

TEST(Memory, AccessPastEndThrows) {
    Memory m(16);
    EXPECT_THROW(m.read8(16), std::out_of_range);
    EXPECT_THROW(m.read32(16), std::out_of_range);
    EXPECT_NO_THROW(m.read32(12));  // last aligned word
}
