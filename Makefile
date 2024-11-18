
VERSION = 1.0.0-SNAPSHOT


build:
	#go test -v ./...
	env go build -o bin/vic_multi cmd/main.go

