package main

import (
	"fmt"
	"runtime/debug"
)

// Version is the release number, the one place to bump it. Bump it for every
// build that is deployed, otherwise the OTA server cannot tell two
// deployments apart.
//
// `supermaths_server -version` prints it as the first token of its output: the
// OTA support agent runs that command (version_args in the infra repo's
// support_agents.yml) and reports the first token as the device's version.
const Version = "1.0.0"

// versionString is the -version line: the bare version first, then the commit
// and its date, which Go stamps into the binary from git. Go only stamps them
// when the package is built (`go build .`), not a file (`go build main.go`).
func versionString() string {
	commit, date, dirty := "unknown", "unknown", false
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, s := range info.Settings {
			switch s.Key {
			case "vcs.revision":
				commit = s.Value
				if len(commit) > 12 {
					commit = commit[:12]
				}
			case "vcs.time":
				date = s.Value
			case "vcs.modified":
				dirty = s.Value == "true"
			}
		}
	}
	if dirty {
		commit += "-dirty"
	}
	return fmt.Sprintf("%s (commit %s, committed %s)", Version, commit, date)
}
