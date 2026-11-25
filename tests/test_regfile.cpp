#include "regfile.hpp"

#include <gtest/gtest.h>

using mips::RegisterFile;

TEST(RegisterFile, ZeroRegisterIsHardwiredToZero) {
    RegisterFile rf;
    rf.write(0, 0x12345678);
    EXPECT_EQ(rf.read(0), 0u);
}

TEST(RegisterFile, WriteThenReadReturnsValue) {
    RegisterFile rf;
    rf.write(9, 0x44);
    EXPECT_EQ(rf.read(9), 0x44u);
}

TEST(RegisterFile, ConventionalNamesMatchMipsNumbering) {
    EXPECT_STREQ(RegisterFile::name(0), "$zero");
    EXPECT_STREQ(RegisterFile::name(8), "$t0");   // Lecture 19: $t0-$t7 = $8-$15
    EXPECT_STREQ(RegisterFile::name(16), "$s0");  // $s0-$s7 = $16-$23
    EXPECT_STREQ(RegisterFile::name(29), "$sp");
    EXPECT_STREQ(RegisterFile::name(31), "$ra");
}

TEST(RegisterFile, IndexOfAcceptsNamesAndNumbers) {
    EXPECT_EQ(RegisterFile::index_of("$t0"), 8);
    EXPECT_EQ(RegisterFile::index_of("t0"), 8);
    EXPECT_EQ(RegisterFile::index_of("$8"), 8);
    EXPECT_EQ(RegisterFile::index_of("$s7"), 23);
    EXPECT_FALSE(RegisterFile::index_of("$nope").has_value());
    EXPECT_FALSE(RegisterFile::index_of("$32").has_value());
}
