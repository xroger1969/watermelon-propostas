import SwiftUI
import Speech
import AVFoundation

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


@MainActor
final class WatermelonVoiceInput: ObservableObject {
    @Published private(set) var listening = false
    @Published private(set) var transcript = ""
    @Published var error = ""
    private let engine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var tapInstalled = false

    func start(locale: Locale) async {
        guard !listening else { return }
        error = ""
        transcript = ""
        let speechAllowed = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speechAllowed else {
            error = String(localized: "Allow speech recognition in iPhone Settings, or type your request.")
            return
        }
        let micAllowed = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard micAllowed else {
            error = String(localized: "Allow microphone access in iPhone Settings, or type your request.")
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            error = String(localized: "Voice transcription is unavailable for this language. You can still type your request.")
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.record, mode: .measurement, options: .duckOthers)
            try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            recognitionRequest = request
            let node = engine.inputNode
            let format = node.outputFormat(forBus: 0)
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            tapInstalled = true
            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, failure in
                Task { @MainActor [weak self] in
                    guard let self, self.listening else { return }
                    if let result { self.transcript = result.bestTranscription.formattedString }
                    if let failure {
                        self.error = failure.localizedDescription
                        self.stop()
                    } else if result?.isFinal == true {
                        self.stop()
                    }
                }
            }
            engine.prepare()
            try engine.start()
            listening = true
        } catch {
            stop()
            self.error = error.localizedDescription
        }
    }
    func stop() {
        if engine.isRunning { engine.stop() }
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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

// Compact composer shared by catalogue and proposal screens. A single AI conversation
// handles all requests, keeping commercial handoff exclusively on the server.
struct AIQuickAskBar: View {
    @EnvironmentObject private var store: TravelStore
    @State private var question = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .foregroundStyle(Brand.green)
                .accessibilityHidden(true)
            TextField("Ask Watermelon AI anything…", text: $question)
                .submitLabel(.send)
                .focused($isFocused)
                .accessibilityIdentifier("quickAIInput")
                .onSubmit { ask() }
            Button {
                if question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    isFocused = false
                    store.openAI()
                } else {
                    ask()
                }
            } label: {
                Image(systemName: question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                      ? "arrow.up.right.circle.fill" : "arrow.up.circle.fill")
                    .font(.title2)
            }
            .accessibilityLabel("Open Watermelon AI")
            .accessibilityIdentifier("quickAISend")
            Button {
                isFocused = false
                store.openAI(voice: true)
            } label: {
                Image(systemName: "mic.fill").font(.headline)
            }
            .accessibilityLabel("Speak with Watermelon AI")
            .accessibilityIdentifier("quickAIVoice")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Brand.green.opacity(0.15)))
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private func ask() {
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        isFocused = false
        question = ""
        store.askAI(text)
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
                    Text("Discover handpicked experiences, or ask our AI to design a personalised day.")
                        .font(.subheadline)
                    HStack(spacing: 8) {
                        Button { store.openAI() } label: {
                            Label("Plan with AI", systemImage: "sparkles")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.white)
                        .foregroundStyle(Brand.green)
                        .accessibilityIdentifier("explorePlanWithAI")
                        Button { store.tab = 2 } label: {
                            Label("My proposals", systemImage: "doc.text")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.white)
                    }
                    .font(.caption.weight(.semibold))
                    .controlSize(.small)
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
        .safeAreaInset(edge: .bottom) { AIQuickAskBar() }
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
    @FocusState private var composerFocused: Bool
    @StateObject private var voice = WatermelonVoiceInput()
    @State private var dictatedPrefix = ""
    @State private var handledComposerRequest = 0
    @State private var handledVoiceRequest = 0

    private var canSend: Bool { !sending && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        ScrollViewReader { scroll in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("WATERMELON EXPERIENCES", systemImage: "sparkles")
                            .font(.caption.bold()).tracking(1.3)
                        Text("Discover more. Travel your way.")
                            .font(.title.bold())
                        Text("Explore unforgettable experiences in Portugal, or tell Watermelon AI what you imagine. We'll help shape a personal programme.")
                            .font(.subheadline)
                        HStack(spacing: 8) {
                            Button { store.tab = 1 } label: {
                                Label("Explore", systemImage: "safari").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.white)
                            .foregroundStyle(Brand.green)
                            .accessibilityIdentifier("homeExplore")
                            Button { store.tab = 2 } label: {
                                Label("Proposals", systemImage: "doc.text").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .tint(.white)
                            .accessibilityIdentifier("homeProposals")
                        }
                        .font(.caption.weight(.semibold))
                        .controlSize(.small)
                        Button { toggleVoice() } label: {
                            Label("Speak with Watermelon AI", systemImage: "mic.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.white)
                        .accessibilityIdentifier("homeSpeakAI")
                    }
                    .foregroundStyle(.white)
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(LinearGradient(colors: [Brand.navy, Brand.green], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 24))

                    if messages.isEmpty {
                        if !store.experiences.isEmpty {
                            HStack {
                                Text("Discover our experiences").font(.headline)
                                Spacer()
                                Button {
                                    store.tab = 1
                                } label: {
                                    Label("Browse all experiences", systemImage: "arrow.right")
                                }
                                .font(.caption.weight(.semibold))
                            }
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(Array(store.experiences.prefix(3))) { product in
                                        NavigationLink {
                                            ExperienceDetail(product: product)
                                        } label: {
                                            VStack(alignment: .leading, spacing: 0) {
                                                ExperienceImage(url: product.imageURL)
                                                    .frame(width: 178, height: 108).clipped()
                                                Text(product.displayTitle)
                                                    .font(.subheadline.weight(.semibold))
                                                    .foregroundStyle(.primary)
                                                    .lineLimit(2)
                                                    .padding(10)
                                            }
                                            .frame(width: 178, height: 172, alignment: .top)
                                            .background(Color(.secondarySystemGroupedBackground),
                                                        in: RoundedRectangle(cornerRadius: 16))
                                            .clipShape(RoundedRectangle(cornerRadius: 16))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .accessibilityIdentifier("featuredExperiences")
                        }
                        Text("Tell us what you'd love to experience").font(.headline)
                        Text("Find something from our catalogue, or create something entirely your own.")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Text("Try asking…").font(.subheadline.weight(.semibold))
                        Button {
                            input = String(localized: "Plan a three-day trip to Lisbon for four people.", locale: locale)
                        } label: {
                            Label("Plan a three-day trip to Lisbon for four people.", systemImage: "bubble.left.and.text.bubble.right")
                        }.buttonStyle(.bordered)
                        Button {
                            input = String(localized: "I'd love to go horse riding by the sea. What can you suggest?", locale: locale)
                            composerFocused = true
                        } label: {
                            Label("Horse riding by the sea", systemImage: "figure.equestrian.sports")
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
                                if let product = store.experiences.first(where: { $0.code == suggestion.code }) {
                                    ExperienceImage(url: product.imageURL)
                                        .frame(height: 130).clipped()
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                    NavigationLink {
                                        ExperienceDetail(product: product)
                                    } label: {
                                        Label("View experience", systemImage: "arrow.up.right.square")
                                    }
                                    .font(.subheadline.weight(.semibold))
                                }
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

                    if !recommendations.isEmpty {
                        Button {
                            input = String(localized: "I'd like a tailor-made experience inspired by your suggestions. What could Watermelon design for me?", locale: locale)
                            composerFocused = false
                            Task { await send() }
                        } label: {
                            Label("Prefer a tailor-made experience?", systemImage: "sparkles.rectangle.stack")
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                        .disabled(sending)
                        .accessibilityIdentifier("requestTailorMade")
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

                    if !ideas.isEmpty && crmReference.isEmpty {
                        Button {
                            input = String(localized: "I'd like to request a proposal for one of these tailor-made ideas. Please ask me for the details needed to send my request.", locale: locale)
                            composerFocused = false
                            Task { await send() }
                        } label: {
                            Label("Request a tailor-made proposal", systemImage: "paperplane")
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(sending)
                        .accessibilityIdentifier("aiTailorProposal")
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
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: messages.count) { _, _ in
                if let latest = messages.last {
                    withAnimation { scroll.scrollTo(latest.id, anchor: .bottom) }
                }
            }
            .onChange(of: sending) { _, _ in
                withAnimation { scroll.scrollTo("chatBottom", anchor: .bottom) }
            }
            .onChange(of: composerFocused) { _, focused in
                if focused { withAnimation { scroll.scrollTo("chatBottom", anchor: .bottom) } }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Tell Watermelon AI about your trip…", text: $input, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .focused($composerFocused)
                    .accessibilityIdentifier("aiMessageInput")
                    .submitLabel(.send)
                    .onSubmit { if canSend { Task { await send() } } }
                Button { toggleVoice() } label: {
                    Image(systemName: voice.listening ? "stop.circle.fill" : "mic.circle.fill")
                        .font(.title)
                        .foregroundStyle(voice.listening ? Brand.red : Brand.green)
                }
                .accessibilityLabel(voice.listening ? "Stop recording" : "Speak with Watermelon AI")
                .accessibilityIdentifier("aiMicrophone")
                Button {
                    voice.stop()
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
            .overlay(alignment: .topLeading) {
                if voice.listening {
                    Label("Listening… tap stop when finished", systemImage: "waveform")
                        .font(.caption)
                        .foregroundStyle(Brand.red)
                        .padding(.horizontal, 12)
                        .offset(y: -22)
                        .accessibilityIdentifier("aiVoiceListening")
                }
            }
        }
        .navigationTitle("Watermelon AI")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { composerFocused = false }
                    .accessibilityIdentifier("dismissAIKeyboard")
            }
        }
        .onAppear {
            consumePendingQuestion()
            handleAIRequests()
        }
        .onDisappear { voice.stop() }
        .onChange(of: store.pendingAIQuestion) { _, _ in consumePendingQuestion() }
        .onChange(of: store.aiComposerRequest) { _, _ in handleAIRequests() }
        .onChange(of: store.aiVoiceRequest) { _, _ in handleAIRequests() }
        .onChange(of: voice.transcript) { _, value in input = dictatedPrefix + value }
        .onChange(of: sending) { _, busy in if !busy { consumePendingQuestion() } }
        .safeAreaInset(edge: .top) {
            if !voice.error.isEmpty {
                Text(voice.error).font(.caption).foregroundStyle(Brand.red)
                    .padding(8).frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemGroupedBackground))
            }
        }
    }

    private func handleAIRequests() {
        if store.aiVoiceRequest > handledVoiceRequest {
            handledVoiceRequest = store.aiVoiceRequest
            if !voice.listening { toggleVoice() }
        } else if store.aiComposerRequest > handledComposerRequest {
            handledComposerRequest = store.aiComposerRequest
            composerFocused = true
        }
    }

    private func toggleVoice() {
        if voice.listening {
            voice.stop()
        } else {
            composerFocused = false
            dictatedPrefix = input.trimmingCharacters(in: .whitespacesAndNewlines)
            if !dictatedPrefix.isEmpty { dictatedPrefix += " " }
            Task { await voice.start(locale: locale) }
        }
    }

    private func consumePendingQuestion() {
        guard !sending, let question = store.pendingAIQuestion else { return }
        store.pendingAIQuestion = nil
        composerFocused = false
        input = question
        Task { await send() }
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
        composerFocused = false
        voice.stop()
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
