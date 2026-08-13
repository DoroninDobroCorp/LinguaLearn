FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY pkg/ pkg/
COPY parsers/parse_sansabet/ parsers/parse_sansabet/
WORKDIR /src/parsers/parse_sansabet
RUN CGO_ENABLED=0 GOOS=linux go build -o /out ./cmd/main.go

FROM ubuntu:22.04
WORKDIR /
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out /app
COPY parsers/parse_sansabet/configs /configs
RUN chmod +x /app
ENTRYPOINT ["/app"]
