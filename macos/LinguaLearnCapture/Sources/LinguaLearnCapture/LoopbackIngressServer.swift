import Foundation
import LinguaLearnCaptureCore
import Network

enum LoopbackIngressError: LocalizedError {
    case invalidPort

    var errorDescription: String? { "Invalid loopback ingress port" }
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
    private var listener: NWListener?

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
        guard let port = NWEndpoint.Port(rawValue: portNumber) else { throw LoopbackIngressError.invalidPort }
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port)
        let listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.stateUpdateHandler = { _ in }
        self.listener = listener
        listener.start(queue: queue)
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    deinit { stop() }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 2) {
            connection.cancel()
        }
        receive(on: connection, accumulated: Data())
    }

    private func receive(on connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
            guard let self else {
                connection.cancel()
                return
            }

            var buffer = accumulated
            if let data { buffer.append(data) }
            if buffer.count > 65_536 {
                self.respond(connection, status: 413, reason: "Payload Too Large", body: #"{"accepted":false}"#)
                return
            }

            if let request = self.parseCompleteRequest(buffer) {
                self.route(request, on: connection)
                return
            }
            if isComplete || error != nil {
                self.respond(connection, status: 400, reason: "Bad Request", body: #"{"accepted":false}"#)
                return
            }
            self.receive(on: connection, accumulated: buffer)
        }
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
        guard requestParts.count == 3 else { return nil }

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
        guard bodyStart <= data.count, contentLength <= data.count - bodyStart else { return nil }
        let body = data.subdata(in: bodyStart..<(bodyStart + contentLength))
        return HTTPRequest(method: requestParts[0], path: requestParts[1], headers: headers, body: body)
    }

    private func route(_ request: HTTPRequest, on connection: NWConnection) {
        if request.method == "GET", request.path == "/health" {
            let data = try? PayloadCoding.makeEncoder().encode(healthProvider())
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? #"{"ok":false}"#
            respond(connection, status: 200, reason: "OK", body: body)
            return
        }
        guard request.method == "POST", request.path == "/capture" else {
            respond(connection, status: 404, reason: "Not Found", body: #"{"accepted":false}"#)
            return
        }
        guard request.headers["x-lingualearn-ingress-token"] == ingressToken else {
            respond(connection, status: 401, reason: "Unauthorized", body: #"{"accepted":false}"#)
            return
        }

        do {
            let payload = try PayloadCoding.makeDecoder().decode(LocalIngressRequest.self, from: request.body)
            let result = handler(payload)
            switch result {
            case .queued:
                respond(connection, status: 202, reason: "Accepted", body: #"{"accepted":true}"#)
            case .duplicate:
                respond(connection, status: 200, reason: "OK", body: #"{"accepted":true,"duplicate":true}"#)
            case .filtered:
                respond(connection, status: 200, reason: "OK", body: #"{"accepted":false,"filtered":true}"#)
            case .paused:
                respond(connection, status: 503, reason: "Paused", body: #"{"accepted":false,"paused":true}"#)
            case .queueFull:
                respond(connection, status: 503, reason: "Queue Full", body: #"{"accepted":false,"queueFull":true}"#)
            case .storageUnavailable:
                respond(connection, status: 507, reason: "Insufficient Storage", body: #"{"accepted":false,"storageUnavailable":true}"#)
            }
        } catch {
            respond(connection, status: 400, reason: "Bad Request", body: #"{"accepted":false}"#)
        }
    }

    private func respond(_ connection: NWConnection, status: Int, reason: String, body: String) {
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
        connection.send(content: response, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
