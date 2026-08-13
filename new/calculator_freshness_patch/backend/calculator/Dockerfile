FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY pkg/ pkg/
COPY calculator/ calculator/
WORKDIR /src/calculator
RUN CGO_ENABLED=0 GOOS=linux go build -o /out ./cmd/main.go

FROM ubuntu:22.04
WORKDIR /
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out /calculator
COPY calculator/configs /configs
RUN chmod +x /calculator
ENTRYPOINT ["/calculator"]
