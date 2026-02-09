
VERSION = 1.0.0-SNAPSHOT


build:
	go test -v ./...
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/vic_multi main.go
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/vic_multi_linux main.go
	cp bin/vic_multi /Users/mathieuchauvet/adaztech/code/infra/ansible/roles/mathieuchauvet.supermaths/files/supermaths_server_darwin

push_to_clever:
	git push clever main:master --force

air:
	air