import SwiftUI

struct ProposalsView: View {
    @EnvironmentObject private var store: TravelStore
    @State private var importLink = false
    @State private var sendRequest = false
    var body: some View {
        List {
            Section {
                Text("Choose experiences and ask for a personalized programme. Your request goes directly to Watermelon.")
                    .foregroundStyle(.secondary)
                Button { store.tab = 1 } label: {
                    Label("Discover all experiences", systemImage: "safari")
                }
                .accessibilityIdentifier("discoverFromProposals")
                Button { store.tab = 0 } label: {
                    Label("Plan with Watermelon AI", systemImage: "sparkles")
                }
                Button { importLink = true } label: { Label("Open a received proposal", systemImage: "link") }
            }
            Section("My programme") {
                if store.cart.isEmpty { Text("Add experiences from Explore.").foregroundStyle(.secondary) }
                ForEach(store.cart) { product in
                    VStack(alignment: .leading, spacing: 4) { Text(product.displayTitle).font(.headline); Text(product.place).font(.caption) }
                        .swipeActions { Button("Remove", role: .destructive) { store.removeFromCart(product.code) } }
                }
                if !store.cart.isEmpty {
                    Button { sendRequest = true } label: { Label("Request my proposal", systemImage: "paperplane.fill") }
                        .accessibilityIdentifier("requestProposal")
                }
            }
            if !store.saved.links.isEmpty {
                Section("Received proposals") {
                    ForEach(store.saved.links) { link in
                        NavigationLink { NativeProposalView(link: link) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(link.reference).font(.headline)
                                if let proposal = store.saved.proposals[link.id] {
                                    Text(money(proposal.total, proposal.currency)).font(.subheadline)
                                }
                            }
                        }.swipeActions { Button("Remove", role: .destructive) { store.removeProposal(link) } }
                    }
                }
            }
            if store.saved.receipts.contains(where: { $0.kind == "proposal" }) {
                Section("Sent requests") {
                    ForEach(store.saved.receipts.filter { $0.kind == "proposal" }) { receipt in
                        NavigationLink { ReceiptView(receipt: receipt) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(receipt.reference).font(.headline)
                                Text("Awaiting Watermelon response").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Proposals")
        .sheet(isPresented: $importLink) { NavigationStack { ImportProposalView() } }
        .sheet(isPresented: $sendRequest) { NavigationStack { RequestForm(products: store.cart, proposal: true) } }
        .safeAreaInset(edge: .bottom) { AIQuickAskBar() }
    }
}

struct ImportProposalView: View {
    @EnvironmentObject private var store: TravelStore
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var error = ""
    var body: some View {
        Form {
            Section {
                Text("Paste the complete proposal link received from Watermelon.")
                TextField("Proposal link", text: $input, axis: .vertical)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                if !error.isEmpty { Text(error).foregroundStyle(Brand.red) }
                Button("Open proposal") {
                    guard let link = ProposalLink.parse(input) else { error = String(localized: "Please use a valid Watermelon proposal link."); return }
                    dismiss()
                    Task { @MainActor in
                        // Present after this sheet has left the view hierarchy.
                        try? await Task.sleep(for: .milliseconds(350))
                        store.openingLink = link
                    }
                }
            }
        }.navigationTitle("Received proposal").toolbar { Button("Close") { dismiss() } }
    }
}

struct SelectionDraft: Identifiable {
    let product: Experience
    var optionID: String
    var date = Date()
    var guests = 2
    var time = "Flexible"
    var id: String { product.code }
    var option: ExperienceOption { product.availableOptions.first(where: { $0.id == optionID }) ?? product.availableOptions[0] }
    var selection: RequestSelection {
        RequestSelection(experience: product, option: option, date: PortugalDate.selectedDay(date), time: time, guests: guests)
    }
}

struct RequestForm: View {
    @EnvironmentObject private var store: TravelStore
    @Environment(\.dismiss) private var dismiss
    let proposal: Bool
    @State private var drafts: [SelectionDraft]
    @State private var contact = ContactDetails()
    @State private var consent = false
    @State private var sending = false
    @State private var error = ""
    @State private var sentReceipt: RequestReceipt?
    init(products: [Experience], proposal: Bool) {
        self.proposal = proposal
        _drafts = State(initialValue: products.map { SelectionDraft(product: $0, optionID: $0.availableOptions[0].id,
                                                                  guests: min(2, $0.guestLimit(for: $0.availableOptions[0]))) })
    }
    var body: some View {
        if let receipt = sentReceipt {
            ReceiptView(receipt: receipt).toolbar { Button("Done") { dismiss() } }
        } else {
            Form {
                Section {
                    Text(proposal ? "Watermelon will prepare a proposal for your programme." : "This sends a request. The reservation is confirmed after Watermelon checks availability.")
                    Text("Experience dates and times refer to Portugal.").font(.caption).foregroundStyle(.secondary)
                }
                ForEach($drafts) { $draft in
                    Section(draft.product.displayTitle) {
                        Picker("Option", selection: $draft.optionID) {
                            ForEach(draft.product.availableOptions) { option in Text(option.optionName).tag(option.id) }
                        }
                        DatePicker("Date", selection: $draft.date, in: Date()..., displayedComponents: .date)
                        Stepper("Guests: \(draft.guests)", value: $draft.guests, in: 1...draft.product.guestLimit(for: draft.option))
                        Picker("Preferred time", selection: $draft.time) {
                            Text("Flexible").tag("Flexible")
                            ForEach(draft.option.startTimes ?? [], id: \.self) { Text($0).tag($0) }
                        }
                        if let total = draft.product.total(for: draft.option, guests: draft.guests) {
                            LabeledContent("Estimated total", value: money(total, draft.option.currency ?? draft.product.currency ?? "EUR"))
                            Text(draft.product.basis(for: draft.option) == .group ? "Group price; not multiplied by guests." : "Price per person, multiplied by guests.")
                                .font(.caption).foregroundStyle(.secondary)
                        } else { Text("Price to be confirmed in your proposal.").font(.footnote).foregroundStyle(.secondary) }
                    }
                }
                Section("Your details") {
                    TextField("Name *", text: $contact.name).textContentType(.name).accessibilityIdentifier("customerName")
                    TextField("Phone *", text: $contact.phone).keyboardType(.phonePad).textContentType(.telephoneNumber).accessibilityIdentifier("customerPhone")
                    TextField("Email", text: $contact.email).keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Hotel / requested pickup", text: $contact.pickup)
                    Picker("Guide language", selection: $contact.language) {
                        ForEach(["English", "Portuguese", "Spanish", "French"], id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Notes, dietary or accessibility needs", text: $contact.notes, axis: .vertical).lineLimit(3...6)
                }
                Section {
                    Toggle("I agree to the privacy policy and to being contacted about this request.", isOn: $consent)
                        .accessibilityIdentifier("privacyConsent")
                    Link("Privacy policy", destination: URL(string: "https://www.watermelonexperiences.pt/privacy")!)
                    if !error.isEmpty { Text(error).foregroundStyle(Brand.red).accessibilityIdentifier("requestError") }
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack { if sending { ProgressView() }; Text(sending ? "Sending…" : "Send request") }
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(sending || !consent || !contact.valid || drafts.isEmpty)
                    .accessibilityIdentifier("sendRequest")
                }
            }
            .navigationTitle(proposal ? "Request a proposal" : "Reservation request")
            .toolbar { Button("Close") { dismiss() }.disabled(sending) }
            .interactiveDismissDisabled(sending)
        }
    }
    private func submit() async {
        guard !sending else { return }
        sending = true
        error = ""
        defer { sending = false }
        do {
            let current = try await store.currentSelections(drafts.map(\.selection))
            let receipt = try await store.api.submit(current, contact: contact, proposal: proposal)
            store.saveReceipt(receipt)
            sentReceipt = receipt
        } catch { self.error = error.localizedDescription }
    }
}

struct NativeProposalView: View {
    @EnvironmentObject private var store: TravelStore
    let link: ProposalLink
    @State private var proposal: Proposal?
    @State private var error = ""
    @State private var loading = false
    @State private var online = false
    @State private var accepting = false
    @State private var changes = false
    @State private var message = ""
    @State private var responding = false
    var body: some View {
        List {
            if loading { ProgressView("Updating proposal…") }
            if !error.isEmpty { Text(error).foregroundStyle(Brand.red) }
            if let proposal {
                Section {
                    Text(proposal.reference).font(.headline)
                    Text("Version \(proposal.version)").font(.caption)
                    Text(proposal.customer_name)
                    if let intro = proposal.intro_text { Text(intro) }
                    LabeledContent("Total", value: money(proposal.total, proposal.currency))
                    Text(status(proposal)).font(.headline).foregroundStyle(Brand.green)
                    if !online { Label("Saved copy — refresh before responding", systemImage: "wifi.slash").font(.caption) }
                }
                Section("Your programme") {
                    ForEach(proposal.tripItems) { item in TripItemView(item: item) }
                }
                if let conditions = proposal.conditions_text, !conditions.isEmpty {
                    Section("Conditions") { Text(conditions) }
                }
                Section {
                    if proposal.canRespond {
                        Button("Accept proposal") { accepting = true }.disabled(!online || responding)
                        Button("Request changes") { changes = true }.disabled(!online || responding)
                    }
                    if proposal.payment_status == "paid" { Label("Payment recorded", systemImage: "checkmark.seal") }
                    else if let token = proposal.payment_token, let url = paymentURL(token: token) {
                        Link("View payment options", destination: url)
                    }
                    Text("Accepting a proposal does not by itself confirm every reservation. Watermelon confirms the final arrangements.")
                        .font(.footnote).foregroundStyle(.secondary)
                    ShareLink(item: link.url) { Label("Share proposal", systemImage: "square.and.arrow.up") }
                    Button("Refresh proposal") { Task { await load() } }.disabled(loading || responding)
                }
            } else if !loading { ContentUnavailableView("Proposal unavailable", systemImage: "doc.text.magnifyingglass") }
        }
        .navigationTitle("Your proposal").navigationBarTitleDisplayMode(.inline)
        .task { proposal = store.saved.proposals[link.id]; await load() }
        .refreshable { await load() }
        .confirmationDialog("Accept this proposal?", isPresented: $accepting, titleVisibility: .visible) {
            Button("Accept proposal") { Task { await respond("accept") } }
            Button("Cancel", role: .cancel) { }
        }
        .sheet(isPresented: $changes) {
            NavigationStack {
                Form {
                    TextField("What would you like to change?", text: $message, axis: .vertical).lineLimit(4...8)
                    Button("Send changes") { Task { await respond("request_changes") } }
                        .disabled(responding || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }.navigationTitle("Request changes").toolbar { Button("Close") { changes = false } }
            }
        }
    }
    private func status(_ proposal: Proposal) -> String {
        if proposal.is_expired { return String(localized: "Proposal expired") }
        switch proposal.status {
        case "accepted": return String(localized: "Proposal accepted")
        case "changes_requested": return String(localized: "Changes requested")
        default: return String(localized: "Ready to review")
        }
    }
    private func paymentURL(token: String) -> URL? {
        var components = URLComponents(string: "https://www.watermelonexperiences.pt/payment/" + link.reference)
        components?.queryItems = [URLQueryItem(name: "token", value: token)]
        return components?.url
    }
    private func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let current = try await store.api.proposal(link)
            proposal = current
            online = true
            error = ""
            store.saveProposal(current, link: link)
        } catch { online = false; self.error = error.localizedDescription }
    }
    private func respond(_ action: String) async {
        guard !responding, online else { return }
        responding = true
        defer { responding = false }
        do {
            try await store.api.respond(link, action: action, message: message)
            changes = false
            await load()
        } catch { self.error = error.localizedDescription }
    }
}
