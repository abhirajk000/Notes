.PHONY: build run tidy test clean

BINARY=bin/secure-notes-api

build:
	go build -ldflags="-s -w" -o $(BINARY) ./cmd/server

run: build
	./$(BINARY)

tidy:
	go mod tidy

clean:
	rm -rf bin/

test:
	go test ./...
