
VERSION = 1.0.0-SNAPSHOT


build:
	go test -v ./...
	env go build -ldflags="-s -w" -o bin/vic_multi main.go

push_to_clever:
	git push clever main:master --force

air:
	air