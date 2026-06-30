# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /secure-notes-api ./cmd/server

# Runtime stage
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -H notes
USER notes
WORKDIR /app
COPY --from=builder /secure-notes-api /app/secure-notes-api
EXPOSE 4000
ENTRYPOINT ["/app/secure-notes-api"]
