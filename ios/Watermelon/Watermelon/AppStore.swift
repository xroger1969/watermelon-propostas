import SwiftUI

@MainActor
final class TravelStore: ObservableObject {
    struct Saved: Codable {
        var favorites: Set<String> = []
        var cart: [String] = []
        var catalog: [Experience] = []
        var receipts: [RequestReceipt] = []
        var links: [ProposalLink] = []
        var proposals: [String: Proposal] = [:]
    }
    @Published var saved: Saved
    @Published var loading = false
    @Published var catalogMessage = ""
    @Published var persistenceError = ""
    @Published var liveCodes = Set<String>()
    @Published var tab = 0
    @Published var openingLink: ProposalLink?
    var lastRefresh: Date?
    let api: APIClient
    private let fileURL: URL

    init() {
        #if DEBUG
        let testing = ProcessInfo.processInfo.arguments.contains("--ui-testing")
        #else
        let testing = false
        #endif
        api = APIClient(isTesting: testing)
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        fileURL = root.appendingPathComponent(testing ? "watermelon-ui-test.json" : "watermelon-travel.json")
        if testing { try? FileManager.default.removeItem(at: fileURL) }
        if let data = try? Data(contentsOf: fileURL), let decoded = try? JSONDecoder().decode(Saved.self, from: data) {
            saved = decoded
        } else { saved = Saved(catalog: APIClient.bundledCatalog()) }
    }

    var experiences: [Experience] { saved.catalog }
    var cart: [Experience] { saved.cart.compactMap { code in saved.catalog.first(where: { $0.code == code }) } }
    func persist() {
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(saved)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            persistenceError = ""
        } catch { persistenceError = String(localized: "Unable to save on this iPhone. Keep your request reference.") }
    }
    func toggleFavorite(_ experience: Experience) {
        if saved.favorites.contains(experience.code) { saved.favorites.remove(experience.code) }
        else { saved.favorites.insert(experience.code) }
        persist()
    }
    func addToCart(_ experience: Experience) {
        if !saved.cart.contains(experience.code), saved.cart.count < 20 { saved.cart.append(experience.code) }
        persist()
        tab = 1
    }
    func removeFromCart(_ code: String) { saved.cart.removeAll { $0 == code }; persist() }
    func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let result = try await api.catalog()
            // Retain details of saved favorites when a product leaves the live catalogue, for offline viewing only.
            let retained = saved.catalog.filter { !result.liveCodes.contains($0.code) && saved.favorites.contains($0.code) }
            saved.catalog = result.products + retained
            liveCodes = result.liveCodes
            lastRefresh = Date()
            catalogMessage = result.partial ? String(localized: "Some catalogue sources are temporarily unavailable.") : ""
            persist()
        } catch {
            liveCodes = []
            catalogMessage = error.localizedDescription
        }
    }
    func currentSelections(_ selections: [RequestSelection]) async throws -> [RequestSelection] {
        if lastRefresh == nil || Date().timeIntervalSince(lastRefresh!) > 60 { await refresh() }
        return try selections.map { selection in
            guard liveCodes.contains(selection.experience.code),
                  let product = experiences.first(where: { $0.code == selection.experience.code }),
                  let option = product.availableOptions.first(where: { $0.id == selection.option.id }),
                  selection.guests <= product.guestLimit(for: option) else {
                throw WatermelonError.message(String(localized: "Refresh the catalogue before sending this request."))
            }
            guard product.unitPrice(for: option) == selection.experience.unitPrice(for: selection.option),
                  product.basis(for: option) == selection.experience.basis(for: selection.option) else {
                throw WatermelonError.message(String(localized: "The price has changed. Reopen the form to review it before sending."))
            }
            return RequestSelection(experience: product, option: option, date: selection.date, time: selection.time, guests: selection.guests)
        }
    }
    func saveReceipt(_ receipt: RequestReceipt) {
        saved.receipts.insert(receipt, at: 0)
        if receipt.kind == "proposal" { saved.cart.removeAll() }
        persist()
        tab = 2
    }
    func open(_ url: URL) {
        if let link = ProposalLink.parse(url.absoluteString) { tab = 1; openingLink = link }
    }
    func saveProposal(_ proposal: Proposal, link: ProposalLink) {
        if !saved.links.contains(link) { saved.links.insert(link, at: 0) }
        saved.proposals[link.id] = proposal
        persist()
    }
    func removeProposal(_ link: ProposalLink) {
        saved.links.removeAll { $0 == link }
        saved.proposals.removeValue(forKey: link.id)
        persist()
    }
    func clear() {
        saved = Saved(catalog: saved.catalog)
        persist()
    }
}
