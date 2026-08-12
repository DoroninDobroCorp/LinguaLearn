import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var email = ""
    @State private var password = ""
    @State private var inviteCode = ""
    @State private var isSignupMode = false

    var body: some View {
        VStack(spacing: 20) {
            Text("LinguaLearn English")
                .font(.largeTitle)
                .bold()

            Text("Everyday writing becomes your personalized English curriculum.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .autocapitalization(.none)
                    .keyboardType(.emailAddress)
                    .textFieldStyle(RoundedBorderTextFieldStyle())

                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())

                if isSignupMode {
                    TextField("Invite Code", text: $inviteCode)
                        .autocapitalization(.allCharacters)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                }
            }
            .padding(.horizontal)

            if let error = authManager.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }

            Button(action: {
                if isSignupMode {
                    authManager.signup(email: email, password: password, inviteCode: inviteCode) { _ in }
                } else {
                    authManager.login(email: email, password: password) { _ in }
                }
            }) {
                Text(isSignupMode ? "Create Beta Account" : "Log In")
                    .bold()
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            .padding(.horizontal)

            Button(action: {
                isSignupMode.toggle()
                authManager.errorMessage = nil
            }) {
                Text(isSignupMode ? "Already have an account? Log In" : "Have an invite code? Sign Up")
                    .font(.footnote)
                    .foregroundColor(.blue)
            }

            Spacer()
        }
        .padding(.top, 50)
    }
}
