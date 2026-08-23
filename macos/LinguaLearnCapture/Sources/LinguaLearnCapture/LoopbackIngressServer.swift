import Foundation
import LinguaLearnCaptureCore

enum LoopbackIngressError: LocalizedError {
    case invalidPort
    case bindFailed

    var errorDescription: String? {
        switch self {
        case .invalidPort:
            return "Invalid loopback ingress port"
        case .bindFailed:
            return "Failed to bind to loopback port"
        }
    }
}

final class LoopbackIngressServer {
    typealias Handler = (LocalIngressRequest) -> CaptureSubmissionResult
    typealias HealthProvider = () -> HealthStatus

    struct HealthStatus: Codable {
        let ok: Bool
        let accessibilityTrusted: Bool
        let inputMonitoringGranted: Bool
        let eventTapRunning: Bool
        let paused: Bool
        let queueDepth: Int
        let storageHealthy: Bool
        let lastInputEvent: String?
        let lastCaptureDecision: String?
        let lastCaptureSourceApp: String?
        let lastInputEventAt: Date?
    }

    private let portNumber: UInt16
    private let ingressToken: String
    private let handler: Handler
    private let healthProvider: HealthProvider
    private let queue = DispatchQueue(label: "com.lingualearn.capture.loopback")
    private var serverFD: Int32 = -1
    private var source: DispatchSourceRead?

    init(
        port: UInt16,
        ingressToken: String,
        healthProvider: @escaping HealthProvider,
        handler: @escaping Handler
    ) {
        portNumber = port
        self.ingressToken = ingressToken
        self.healthProvider = healthProvider
        self.handler = handler
    }

    func start() throws {
        guard portNumber > 0 else { throw LoopbackIngressError.invalidPort }

        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw LoopbackIngressError.bindFailed }

        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))

        // Set non-blocking on listener
        let flags = fcntl(fd, F_GETFL, 0)
        _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)

        var sin = sockaddr_in()
        sin.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        sin.sin_family = sa_family_t(AF_INET)
        sin.sin_port = in_port_t(portNumber).bigEndian
        inet_pton(AF_INET, "127.0.0.1", &sin.sin_addr)

        var addr = sockaddr()
        memcpy(&addr, &sin, Int(sin.sin_len))
        let bindRes = withUnsafePointer(to: &addr) {
            bind(fd, $0, socklen_t(sin.sin_len))
        }

        guard bindRes == 0, listen(fd, 32) == 0 else {
            close(fd)
            throw LoopbackIngressError.bindFailed
        }

        self.serverFD = fd
        let readSource = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        readSource.setEventHandler { [weak self] in
            self?.acceptConnections()
        }
        readSource.setCancelHandler {
            if fd >= 0 {
                close(fd)
            }
        }
        readSource.resume()
        self.source = readSource
        NSLog("[LoopbackIngressServer] Listening on 127.0.0.1:%u", portNumber)
    }

    func stop() {
        if let src = source {
            source = nil
            src.cancel()
        }
        serverFD = -1
    }

    deinit {
        stop()
    }

    private func acceptConnections() {
        guard serverFD >= 0 else { return }

        while true {
            var clientAddr = sockaddr()
            var clientLen = socklen_t(MemoryLayout<sockaddr>.size)
            let clientFD = accept(serverFD, &clientAddr, &clientLen)
            if clientFD < 0 {
                break // No more pending connections
            }

            // Handle client connection
            handleConnection(clientFD)
        }
    }

    private func handleConnection(_ fd: Int32) {
        var buffer = Data()
        var chunk = [UInt8](repeating: 0, count: 8192)

        var tv = timeval(tv_sec: 2, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        // Ensure socket is in blocking mode with timeout
        let flags = fcntl(fd, F_GETFL, 0)
        if flags >= 0 {
            _ = fcntl(fd, F_SETFL, flags & ~O_NONBLOCK)
        }

        while buffer.count < 65_536 {
            let bytesRead = read(fd, &chunk, chunk.count)
            if bytesRead <= 0 {
                break
            }
            buffer.append(contentsOf: chunk[0..<bytesRead])
            if let req = parseCompleteRequest(buffer) {
                route(req, fd: fd)
                close(fd)
                return
            }
        }

        if let request = parseCompleteRequest(buffer) {
            route(request, fd: fd)
        } else {
            respond(fd: fd, status: 400, reason: "Bad Request", body: #"{"accepted":false}"#)
        }
        close(fd)
    }

    private struct HTTPRequest {
        let method: String
        let path: String
        let headers: [String: String]
        let body: Data
    }

    private func parseCompleteRequest(_ data: Data) -> HTTPRequest? {
        let separator = Data("\r\n\r\n".utf8)
        guard let headerRange = data.range(of: separator) else { return nil }
        let headerData = data[..<headerRange.lowerBound]
        guard let headerText = String(data: headerData, encoding: .utf8) else { return nil }
        let lines = headerText.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else { return nil }
        let requestParts = requestLine.split(separator: " ", maxSplits: 2).map(String.init)
        guard requestParts.count >= 2 else { return nil }

        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespacesAndNewlines)
            headers[key] = value
        }
        let contentLength: Int
        if let lengthText = headers["content-length"] {
            guard let parsed = Int(lengthText), parsed >= 0, parsed <= 65_536 else { return nil }
            contentLength = parsed
        } else {
            contentLength = 0
        }
        let bodyStart = headerRange.upperBound
        guard data.count >= bodyStart + contentLength else { return nil }
        let body = Data(data[bodyStart..<(bodyStart + contentLength)])
        return HTTPRequest(method: requestParts[0].uppercased(), path: requestParts[1], headers: headers, body: body)
    }

    private func route(_ request: HTTPRequest, fd: Int32) {
        if request.method == "GET", request.path == "/health" {
            let data = try? PayloadCoding.makeEncoder().encode(healthProvider())
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? #"{"ok":false}"#
            respond(fd: fd, status: 200, reason: "OK", body: body)
            return
        }
        guard request.method == "POST", request.path == "/capture" else {
            respond(fd: fd, status: 404, reason: "Not Found", body: #"{"accepted":false}"#)
            return
        }
        guard request.headers["x-lingualearn-ingress-token"] == ingressToken else {
            respond(fd: fd, status: 401, reason: "Unauthorized", body: #"{"accepted":false}"#)
            return
        }

        do {
            let payload = try PayloadCoding.makeDecoder().decode(LocalIngressRequest.self, from: request.body)
            let result = handler(payload)
            switch result {
            case .queued:
                respond(fd: fd, status: 202, reason: "Accepted", body: #"{"accepted":true}"#)
            case .duplicate:
                respond(fd: fd, status: 200, reason: "OK", body: #"{"accepted":true,"duplicate":true}"#)
            case .filtered:
                respond(fd: fd, status: 200, reason: "OK", body: #"{"accepted":false,"filtered":true}"#)
            case .paused:
                respond(fd: fd, status: 503, reason: "Paused", body: #"{"accepted":false,"paused":true}"#)
            case .queueFull:
                respond(fd: fd, status: 503, reason: "Queue Full", body: #"{"accepted":false,"queueFull":true}"#)
            case .storageUnavailable:
                respond(fd: fd, status: 507, reason: "Insufficient Storage", body: #"{"accepted":false,"storageUnavailable":true}"#)
            }
        } catch {
            let bodyStr = String(data: request.body, encoding: .utf8) ?? ""
            NSLog("[LoopbackIngressServer] Decode error: %@ (body: %@)", error.localizedDescription, bodyStr)
            respond(fd: fd, status: 400, reason: "Bad Request", body: #"{"accepted":false}"#)
        }
    }

    private func respond(fd: Int32, status: Int, reason: String, body: String) {
        let bodyData = Data(body.utf8)
        let headers = [
            "HTTP/1.1 \(status) \(reason)",
            "Content-Type: application/json; charset=utf-8",
            "Content-Length: \(bodyData.count)",
            "Connection: close",
            "Cache-Control: no-store",
            "",
            ""
        ].joined(separator: "\r\n")
        var response = Data(headers.utf8)
        response.append(bodyData)
        response.withUnsafeBytes { rawBuffer in
            guard let ptr = rawBuffer.baseAddress else { return }
            _ = write(fd, ptr, response.count)
        }
    }
}
