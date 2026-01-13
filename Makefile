
VERSION = 1.0.0-SNAPSHOT


build:
	go test -v ./...
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/vic_multi main.go
	cp bin/vic_multi /Users/mathieuchauvet/adaztech/code/infra/ansible/roles/mathieuchauvet.supermaths/files/supermaths_server

push_to_clever:
	git push clever main:master --force

air:
	air