
# The version is const Version in version.go. Build the package (.), not
# main.go: only then does Go stamp the commit that -version prints.


build:
	go test -v ./...
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/vic_multi .
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/vic_multi_linux .
	cp bin/vic_multi /Users/mathieuchauvet/adaztech/code/infra/ansible/roles/mathieuchauvet.supermaths/files/supermaths_server_darwin

air:
	air