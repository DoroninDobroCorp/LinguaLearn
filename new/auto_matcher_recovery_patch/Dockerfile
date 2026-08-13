FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY pkg/ pkg/
COPY auto_matcher/ auto_matcher/
WORKDIR /src/auto_matcher
RUN CGO_ENABLED=0 GOOS=linux go build -o /out ./cmd/main.go

FROM ubuntu:22.04
WORKDIR /
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out /auto_matcher
COPY auto_matcher/configs /configs
RUN chmod +x /auto_matcher
ENTRYPOINT ["/auto_matcher"]
