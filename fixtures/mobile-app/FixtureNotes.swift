// Fixture Notes: a minimal SwiftUI app for agentic-tests mobile checks (iOS simulator).
import SwiftUI

@main
struct FixtureNotesApp: App {
    var body: some Scene { WindowGroup { NotesView() } }
}

struct NotesView: View {
    @State private var notes = ["Welcome", "Groceries"]
    @State private var draft = ""
    @State private var message = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                HStack {
                    TextField("New note", text: $draft)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("note_input")
                    Button("Add") { add() }
                        .accessibilityIdentifier("add_button")
                }
                if !message.isEmpty {
                    Text(message).foregroundStyle(.red).accessibilityIdentifier("error_message")
                }
                Text("\(notes.count) notes").accessibilityIdentifier("note_count")
                List(notes, id: \.self) { Text($0) }
            }
            .padding()
            .navigationTitle("Fixture Notes")
        }
    }

    private func add() {
        let text = draft.trimmingCharacters(in: .whitespaces)
        if text.isEmpty { message = "Note cannot be empty"; return }
        if notes.contains(text) { message = "Note already exists"; return }
        notes.append(text); draft = ""; message = ""
    }
}
