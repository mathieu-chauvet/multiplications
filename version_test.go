package main

import (
	"strings"
	"testing"
)

// The OTA support agent keeps only the first whitespace-separated token of
// the -version output, so it must be the bare version.
func TestVersionStringStartsWithBareVersion(t *testing.T) {
	fields := strings.Fields(versionString())
	if len(fields) == 0 || fields[0] != Version {
		t.Fatalf("first token of %q is not %q", versionString(), Version)
	}
}
