# Convenience wrapper around CMake.
#   make regfile   build and run only the register-file tests (same for memory, alu, decode, control, cpu)
#   make test      build everything and run the full suite
#   make clean     delete the build directory

BUILD := build
UNITS := regfile memory alu decode control cpu

.PHONY: all test clean configure $(UNITS)

all: test

configure:
	@cmake -S . -B $(BUILD) > /dev/null

$(UNITS): configure
	@cmake --build $(BUILD) --target test_$@
	@./$(BUILD)/test_$@

test: configure
	@cmake --build $(BUILD)
	@./$(BUILD)/mipscore_tests

clean:
	rm -rf $(BUILD)
