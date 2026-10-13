import SwiftUI

@main
@MainActor
struct WatermelonApp: App {
    @StateObject private var store = TravelStore()
    @AppStorage("watermelon.languagePreference") private var languagePreference = "system"
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store)
                .environment(\.locale, languagePreference == "system" ? Locale.current : Locale(identifier: languagePreference))
                .tint(Brand.green)
                .preferredColorScheme(.light)
                .onOpenURL { store.open($0) }
        }
    }
}

enum Brand {
    static let green = Color(red: 0.09, green: 0.43, blue: 0.22)
    static let red = Color(red: 0.85, green: 0.04, blue: 0.25)
    static let navy = Color(red: 0.05, green: 0.13, blue: 0.19)
}

struct RootView: View {
    @EnvironmentObject private var store: TravelStore
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TabView(selection: $store.tab) {
            NavigationStack { AIConciergeView() }
                .tabItem { Label("Watermelon AI", systemImage: "sparkles") }.tag(0)
            NavigationStack { ExploreView() }
                .tabItem { Label("Explore", systemImage: "safari") }.tag(1)
            NavigationStack { ProposalsView() }
                .tabItem { Label("Proposals", systemImage: "doc.text") }.tag(2)
            NavigationStack { TripsView() }
                .tabItem { Label("My trips", systemImage: "suitcase.rolling") }.tag(3)
            NavigationStack { MoreView() }
                .tabItem { Label("More", systemImage: "ellipsis.circle") }.tag(4)
        }
        .task { await store.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, let last = store.lastRefresh, Date().timeIntervalSince(last) > 300 {
                Task { await store.refresh() }
            }
        }
        .sheet(item: $store.openingLink) { link in
            NavigationStack { NativeProposalView(link: link) }
        }
        .safeAreaInset(edge: .top) {
            if !store.persistenceError.isEmpty {
                Text(store.persistenceError).font(.caption).foregroundStyle(.white)
                    .padding().frame(maxWidth: .infinity).background(Brand.red)
            }
        }
    }
}

struct ExploreView: View {
    @EnvironmentObject private var store: TravelStore
    @State private var search = ""
    @State private var category = "All"
    @State private var favoritesOnly = false
    var categories: [String] { ["All"] + Set(store.experiences.compactMap(\.category)).sorted() }
    var filtered: [Experience] {
        store.experiences.filter {
            (category == "All" || $0.category == category) &&
            (!favoritesOnly || store.saved.favorites.contains($0.code)) &&
            (search.isEmpty || ($0.title + " " + $0.place + " " + $0.overview).localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Portugal, your way.").font(.largeTitle.bold())
                    Text("Memorable experiences. A proposal made for you.").font(.headline)
                    Label("Watermelon Experiences", systemImage: "location.fill").font(.subheadline)
                }
                .foregroundStyle(.white).padding(24).frame(maxWidth: .infinity, alignment: .leading)
                .background(LinearGradient(colors: [Brand.navy, Brand.green], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                if store.loading { HStack { ProgressView(); Text("Updating experiences…").font(.caption) } }
                if !store.catalogMessage.isEmpty {
                    Text(store.catalogMessage).font(.footnote).foregroundStyle(.secondary)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(categories, id: \.self) { value in
                            Button { category = value } label: {
                                Text(value == "All" ? String(localized: "All") : value)
                                    .font(.subheadline.weight(.semibold)).padding(.horizontal, 16).padding(.vertical, 10)
                                    .foregroundStyle(category == value ? .white : Brand.navy)
                                    .background(category == value ? Brand.green : Color(.secondarySystemGroupedBackground), in: Capsule())
                            }.accessibilityAddTraits(category == value ? .isSelected : [])
                        }
                    }
                }
                if filtered.isEmpty {
                    ContentUnavailableView("No experiences found", systemImage: "magnifyingglass",
                                           description: Text("Try another search or refresh the catalogue."))
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 20)], spacing: 20) {
                    ForEach(filtered) { product in
                        NavigationLink { ExperienceDetail(product: product) } label: { ExperienceCard(product: product) }
                            .buttonStyle(.plain)
                    }
                }
            }.padding(20).frame(maxWidth: 1100).frame(maxWidth: .infinity)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Watermelon")
        .searchable(text: $search, prompt: "Where would you like to go?")
        .toolbar {
            Button { favoritesOnly.toggle() } label: {
                Label("Favorites", systemImage: favoritesOnly ? "heart.fill" : "heart")
            }.tint(favoritesOnly ? Brand.red : Brand.green).accessibilityIdentifier("favoritesFilter")
        }
        .refreshable { await store.refresh() }
    }
}

struct ExperienceCard: View {
    @EnvironmentObject private var store: TravelStore
    let product: Experience
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ExperienceImage(url: product.imageURL).frame(height: 190).clipped()
                .overlay(alignment: .topTrailing) {
                    Button { store.toggleFavorite(product) } label: {
                        Image(systemName: store.saved.favorites.contains(product.code) ? "heart.fill" : "heart")
                            .foregroundStyle(Brand.red).padding(12).background(.regularMaterial, in: Circle())
                    }.padding(12).accessibilityLabel("Save to favorites")
                }
            VStack(alignment: .leading, spacing: 9) {
                Text(product.place.uppercased()).font(.caption.weight(.bold)).foregroundStyle(Brand.green)
                Text(product.displayTitle).font(.title3.bold()).foregroundStyle(.primary).lineLimit(3)
                Label(product.duration ?? String(localized: "Duration on request"), systemImage: "clock")
                    .font(.caption).foregroundStyle(.secondary)
                if let option = product.availableOptions.first, let price = product.unitPrice(for: option) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(money(price, product.currency ?? "EUR")).font(.headline).foregroundStyle(Brand.navy)
                        Text(product.basis(for: option) == .group ? "per group" : "per person").font(.caption).foregroundStyle(.secondary)
                    }
                } else { Text("Price on request").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.green) }
            }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

struct ExperienceImage: View {
    let url: URL?
    var body: some View {
        AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: {
            ZStack { Brand.navy; Image(systemName: "sun.horizon.fill").font(.largeTitle).foregroundStyle(.white) }
        }.accessibilityHidden(true)
    }
}

struct ExperienceDetail: View {
    @EnvironmentObject private var store: TravelStore
    let product: Experience
    @State private var request = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ExperienceImage(url: product.imageURL).frame(height: 260).clipped().clipShape(RoundedRectangle(cornerRadius: 20))
                Text(product.displayTitle).font(.largeTitle.bold())
                Label(product.place, systemImage: "mappin.and.ellipse")
                Label(product.duration ?? String(localized: "Duration on request"), systemImage: "clock")
                Text(product.overview).textSelection(.enabled)
                facts("Highlights", lines: product.highlights)
                facts("Itinerary", lines: product.itinerary)
                facts("Included", lines: product.included)
                facts("Not included", lines: product.excluded)
                if let point = product.meetingPoint, !point.isEmpty {
                    Text("Meeting point").font(.headline)
                    Text(point)
                    DirectionsButton(place: point)
                }
                if let cancellation = product.cancellation, !cancellation.isEmpty {
                    DisclosureGroup("Cancellation conditions") { Text(cancellation).font(.footnote).padding(.top, 8) }
                }
                Text("Availability and final arrangements are confirmed by Watermelon.").font(.footnote).foregroundStyle(.secondary)
                Button { store.addToCart(product) } label: {
                    Label("Add to my proposal", systemImage: "plus.circle").frame(maxWidth: .infinity).padding(6)
                }.buttonStyle(.bordered).accessibilityIdentifier("addToProposal")
                Button { request = true } label: {
                    Text("Request a reservation").frame(maxWidth: .infinity).padding(6)
                }.buttonStyle(.borderedProminent).disabled(!store.liveCodes.contains(product.code))
                if !store.liveCodes.contains(product.code) { Text("Refresh to request this experience.").font(.caption).foregroundStyle(.secondary) }
            }.padding(20).frame(maxWidth: 760).frame(maxWidth: .infinity)
        }
        .navigationTitle("Experience").navigationBarTitleDisplayMode(.inline)
        .toolbar { Button { store.toggleFavorite(product) } label: { Image(systemName: store.saved.favorites.contains(product.code) ? "heart.fill" : "heart") }.tint(Brand.red) }
        .sheet(isPresented: $request) { NavigationStack { RequestForm(products: [product], proposal: false) } }
    }
    @ViewBuilder private func facts(_ title: LocalizedStringKey, lines: [String]?) -> some View {
        if let lines, !lines.isEmpty {
            VStack(alignment: .leading, spacing: 9) {
                Text(title).font(.headline)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in Label(line, systemImage: "checkmark.circle").font(.subheadline) }
            }
        }
    }
}


// Native conversational planner; commercial handoff is performed and confirmed only by the server.
struct AIConciergeView: View {
    @EnvironmentObject private var store: TravelStore
    @Environment(\.locale) private var locale
    @AppStorage("watermelon.ai.conversationId") private var conversationId = UUID().uuidString
    @AppStorage("watermelon.ai.crmReference") private var crmReference = ""
    @State private var messages: [AIChatEntry] = []
    @State private var input = ""
    @State private var sending = false
    @State private var errorText = ""
    @State private var recommendations: [AIRecommendation] = []
    @State private var ideas: [AITailorMadeIdea] = []

    private var canSend: Bool { !sending && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: "sparkles").font(.largeTitle)
                        Text("Your personal travel concierge").font(.largeTitle.bold())
                        Text("Describe your trip. Watermelon AI will suggest real experiences or a tailor-made concept, and help you request a proposal.")
                            .font(.subheadline)
                    }
                    .foregroundStyle(.white)
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(LinearGradient(colors: [Brand.navy, Brand.green], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 24))

                    if messages.isEmpty {
                        Text("Try asking…").font(.headline)
                        Button {
                            input = String(localized: "Plan a three-day trip to Lisbon for four people.", locale: locale)
                        } label: {
                            Label("Plan a three-day trip to Lisbon for four people.", systemImage: "bubble.left.and.text.bubble.right")
                        }.buttonStyle(.bordered)
                        Button {
                            store.tab = 1
                        } label: {
                            Label("Browse all experiences", systemImage: "safari")
                        }.buttonStyle(.bordered)
                    }

                    ForEach(messages) { entry in
                        HStack {
                            if entry.role == "user" { Spacer(minLength: 32) }
                            Text(entry.content)
                                .padding(14)
                                .background(entry.role == "user" ? Brand.green : Color(.secondarySystemGroupedBackground),
                                            in: RoundedRectangle(cornerRadius: 16))
                                .foregroundStyle(entry.role == "user" ? .white : .primary)
                                .textSelection(.enabled)
                            if entry.role != "user" { Spacer(minLength: 32) }
                        }
                    }
                    if sending {
                        HStack {
                            ProgressView()
                            Text("Watermelon AI is preparing your answer…").font(.footnote)
                        }.accessibilityIdentifier("aiThinking")
                    }
                    if !errorText.isEmpty {
                        Text(errorText).foregroundStyle(Brand.red).font(.footnote)
                            .accessibilityIdentifier("aiError")
                    }

                    if !recommendations.isEmpty {
                        Text("Experiences suggested for you").font(.headline)
                        ForEach(recommendations) { suggestion in
                            VStack(alignment: .leading, spacing: 9) {
                                Text(suggestion.title).font(.headline)
                                Text(suggestion.reason).font(.subheadline)
                                if let product = store.experiences.first(where: { $0.code == suggestion.code }),
                                   store.liveCodes.contains(suggestion.code) {
                                    if let price = product.availableOptions.first.flatMap({ product.unitPrice(for: $0) }) {
                                        HStack(alignment: .firstTextBaseline) {
                                            Text(money(price, product.currency ?? "EUR"))
                                                .foregroundStyle(Brand.green).font(.subheadline.bold())
                                            Text(product.basis(for: product.availableOptions[0]) == .group ? "per group" : "per person")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                    } else {
                                        Text("Price subject to confirmation").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Button {
                                        store.addToCart(product)
                                    } label: {
                                        Label("Add to my proposal", systemImage: "plus.circle")
                                    }.buttonStyle(.borderedProminent)
                                } else {
                                    Text("Check the live catalogue before requesting this experience.")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                        }
                    }

                    if !ideas.isEmpty {
                        Text("Tailor-made ideas").font(.headline)
                        ForEach(ideas) { idea in
                            VStack(alignment: .leading, spacing: 8) {
                                Label(idea.title, systemImage: "lightbulb").font(.headline)
                                Text(idea.concept).font(.subheadline)
                                Text(idea.reason).font(.footnote).foregroundStyle(.secondary)
                                Text("Concept only — subject to Watermelon review, feasibility, availability and quotation.")
                                    .font(.caption).foregroundStyle(Brand.red)
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                        }
                    }

                    if !crmReference.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Proposal request recorded in the CRM", systemImage: "checkmark.seal.fill")
                                .font(.headline).foregroundStyle(Brand.green)
                            Text(crmReference).font(.title3.monospaced()).textSelection(.enabled)
                            Text("Watermelon will review your request. This is not a confirmed reservation.")
                                .font(.footnote)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                    }

                    if !messages.isEmpty || !crmReference.isEmpty {
                        Button {
                            newConversation()
                        } label: {
                            Label("Start a new conversation", systemImage: "arrow.counterclockwise")
                        }.buttonStyle(.bordered).disabled(sending)
                    }
                    Text("AI suggestions are indicative. Prices, availability and reservations require confirmation. Do not share payment details in chat.")
                        .font(.caption).foregroundStyle(.secondary)
                    Link("Privacy policy", destination: URL(string: "https://www.watermelonexperiences.pt/privacy")!)
                        .font(.caption)
                    Color.clear.frame(height: 1).id("chatBottom")
                }
                .padding(16)
                .frame(maxWidth: 800).frame(maxWidth: .infinity)
            }
            .onChange(of: messages.count) { _, _ in
                withAnimation { scroll.scrollTo("chatBottom", anchor: .bottom) }
            }
            .onChange(of: sending) { _, _ in
                withAnimation { scroll.scrollTo("chatBottom", anchor: .bottom) }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Tell Watermelon AI about your trip…", text: $input, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("aiMessageInput")
                    .submitLabel(.send)
                    .onSubmit { if canSend { Task { await send() } } }
                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title)
                }
                .disabled(!canSend)
                .accessibilityLabel("Send message")
                .accessibilityIdentifier("aiSendMessage")
            }
            .padding(12)
            .background(.regularMaterial)
        }
        .navigationTitle("Watermelon AI")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func newConversation() {
        messages = []
        input = ""
        recommendations = []
        ideas = []
        errorText = ""
        crmReference = ""
        conversationId = UUID().uuidString
    }

    @MainActor
    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sending, !text.isEmpty else { return }
        let previous = messages
        input = ""
        errorText = ""
        sending = true
        messages.append(AIChatEntry(role: "user", content: text))
        defer { sending = false }
        do {
            let reply = try await store.api.concierge(
                message: text, history: previous, conversationId: conversationId,
                crmReference: crmReference, language: locale.identifier,
                recommendations: recommendations, ideas: ideas
            )
            if reply.crmCreated, !reply.crmReference.isEmpty { crmReference = reply.crmReference }
            recommendations = reply.recommendations
            ideas = reply.tailorMadeIdeas.filter { $0.status == "tailor_made_concept" }
            if !reply.reply.isEmpty { messages.append(AIChatEntry(role: "assistant", content: reply.reply)) }
            if !reply.question.isEmpty { messages.append(AIChatEntry(role: "assistant", content: reply.question)) }
        } catch {
            messages = previous
            input = text
            errorText = error.localizedDescription
        }
    }
}
