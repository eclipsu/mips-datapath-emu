cmake_minimum_required(VERSION 3.16)
project(mips_pipe_emu LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Core emulator library: pure logic, no I/O, so it can later be compiled to WebAssembly.
add_library(mipscore
    src/memory.cpp
    src/regfile.cpp
    src/alu.cpp
    src/decode.cpp
    src/control.cpp
    src/cpu.cpp
)
target_include_directories(mipscore PUBLIC src)
target_compile_options(mipscore PRIVATE -Wall -Wextra -Wpedantic)

option(MIPS_BUILD_TESTS "Build the unit tests" ON)
if(MIPS_BUILD_TESTS)
    enable_testing()
    find_package(GTest REQUIRED)
    file(GLOB MIPS_TEST_SOURCES CONFIGURE_DEPENDS tests/*.cpp)
    add_executable(mipscore_tests ${MIPS_TEST_SOURCES})
    target_link_libraries(mipscore_tests PRIVATE mipscore GTest::gtest_main)
    target_compile_options(mipscore_tests PRIVATE -Wall -Wextra -Wpedantic)
    include(GoogleTest)
    gtest_discover_tests(mipscore_tests)

    # One small test binary per unit, linking only the sources that unit needs,
    # so each unit can be tested before the rest of the core exists.
    # Not built by default; use `make <unit>` from the top-level Makefile.
    function(mips_unit_test unit)
        add_executable(test_${unit} EXCLUDE_FROM_ALL tests/test_${unit}.cpp ${ARGN})
        target_include_directories(test_${unit} PRIVATE src)
        target_link_libraries(test_${unit} PRIVATE GTest::gtest_main)
        target_compile_options(test_${unit} PRIVATE -Wall -Wextra -Wpedantic)
    endfunction()

    mips_unit_test(regfile src/regfile.cpp)
    mips_unit_test(memory  src/memory.cpp)
    mips_unit_test(alu     src/alu.cpp)
    mips_unit_test(decode  src/decode.cpp src/regfile.cpp)   # disassemble() uses RegisterFile::name
    mips_unit_test(control src/control.cpp)
    mips_unit_test(cpu     src/memory.cpp src/regfile.cpp src/alu.cpp
                           src/decode.cpp src/control.cpp src/cpu.cpp)
endif()
