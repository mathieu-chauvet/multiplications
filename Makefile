
VERSION = 1.0.0-SNAPSHOT


build:
	#go test -v ./...
	env go build -o bin/flashcards cmd/main.go

deploy:
	git push clever master