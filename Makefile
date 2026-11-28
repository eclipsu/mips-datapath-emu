# Convenience wrapper around CMake.
#   make regfile   build and run only the register-file tests (same for memory, alu, multiplier, decode, control, cpu)
#   make test      build everything and run the full suite
#   make probe     print what decode() returns for WORD=0x... (default 0x2237FFF1)
#   make clean     delete the build directory

SHELL := /bin/bash

BUILD := build
UNITS := regfile memory alu multiplier decode control cpu

.PHONY: all test clean configure probe $(UNITS)

all: test

configure:
	@cmake -S . -B $(BUILD) > /dev/null

# Build quietly: print the full log only if the build fails, otherwise only warnings.
# Then run the tests showing only failures and a summary (--gtest_brief=1).
$(UNITS): configure
	@cmake --build $(BUILD) --target test_$@ > $(BUILD)/build.log 2>&1 || (cat $(BUILD)/build.log; exit 1)
	@grep -A3 "warning:" $(BUILD)/build.log || true
	@set -o pipefail; ./$(BUILD)/test_$@ --gtest_brief=1 2>&1 | grep -v "Running main()"

# Print every field decode() returns, e.g. `make probe WORD=0x2237FFF1`
WORD ?= 0x2237FFF1
probe: configure
	@cmake --build $(BUILD) --target probe_decode > /dev/null
	@./$(BUILD)/probe_decode $(WORD)

test: configure
	@cmake --build $(BUILD)
	@./$(BUILD)/mipscore_tests

clean:
	rm -rf $(BUILD)
