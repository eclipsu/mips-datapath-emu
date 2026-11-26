# Convenience wrapper around CMake.
#   make regfile   build and run only the register-file tests (same for memory, alu, decode, control, cpu)
#   make test      build everything and run the full suite
#   make probe     print what decode() returns for WORD=0x... (default 0x2237FFF1)
#   make clean     delete the build directory

BUILD := build
UNITS := regfile memory alu decode control cpu

.PHONY: all test clean configure probe $(UNITS)

all: test

configure:
	@cmake -S . -B $(BUILD) > /dev/null

$(UNITS): configure
	@cmake --build $(BUILD) --target test_$@
	@./$(BUILD)/test_$@

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
