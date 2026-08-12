import SwiftUI

struct DeviceTokenView: View {
    @EnvironmentObject var deviceTokenManager: DeviceTokenManager
    @State private var deviceNameInput = "iOS Keyboard"
    @State private var showingTokenModal = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Keyboard & Device Pairing")
                .font(.headline)

            if let activeToken = deviceTokenManager.activeDeviceToken {
                HStack {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundColor(.green)
                    VStack(alignment: .leading) {
                        Text("Active Keyboard Token Paired")
                            .font(.subheadline)
                            .bold()
                        Text(String(activeToken.prefix(12)) + "...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding()
                .background(Color.green.opacity(0.1))
                .cornerRadius(8)
            } else {
                Text("No device token found in App Group. Pair this device to enable Keyboard Extension.")
                    .font(.caption)
                    .foregroundColor(.orange)
            }

            Button(action: {
                deviceTokenManager.createDeviceToken(deviceName: deviceNameInput) { token in
                    if token != nil {
                        showingTokenModal = true
                    }
                }
            }) {
                HStack {
                    Image(systemName: "key.fill")
                    Text("Pair Keyboard Token")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
            }

            List(deviceTokenManager.devices) { device in
                HStack {
                    VStack(alignment: .leading) {
                        Text(device.deviceName)
                            .font(.body)
                            .bold()
                        Text("Created: \(device.createdAt)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Button("Revoke") {
                        deviceTokenManager.revokeDeviceToken(id: device.id)
                    }
                    .foregroundColor(.red)
                    .font(.caption)
                }
            }
        }
        .padding()
        .alert("New Device Token Created", isPresented: $showingTokenModal, actions: {
            Button("OK", role: .cancel) { }
        }, message: {
            Text("Your iOS Custom Keyboard has been automatically configured via App Group container.\n\nToken: \(deviceTokenManager.newlyCreatedToken ?? "")")
        })
    }
}
