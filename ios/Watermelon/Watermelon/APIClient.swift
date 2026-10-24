import Foundation

enum WatermelonError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

struct ContactDetails {
    var name = ""
    var email = ""
    var phone = ""
    var pickup = ""
    var language = "English"
    var notes = ""
    var valid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && !phone.trimmingCharacters(in: .whitespaces).isEmpty }
}

struct RequestSelection {
    var experience: Experience
    var option: ExperienceOption
    var date: String
    var time: String
    var guests: Int
    var tripItem: TripItem {
        TripItem(id: UUID().uuidString, title: experience.title, optionName: option.optionName,
                 date: date, time: time, guests: guests, location: experience.meetingPoint ?? experience.place,
                 total: experience.total(for: option, guests: guests), currency: option.currency ?? experience.currency ?? "EUR")
    }
}

struct APIClient {
    let session: URLSession
    let isTesting: Bool
    let baseURL = URL(string: "https://www.watermelonexperiences.pt")!
    init(session: URLSession = .shared, isTesting: Bool = false) {
        self.session = session
        self.isTesting = isTesting
    }

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil, bearerToken: String? = nil) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme == "https", url.host == baseURL.host else {
            throw WatermelonError.message(String(localized: "Invalid Watermelon address."))
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
        request.httpMethod = method
        request.httpBody = body
        if let bearerToken { request.setValue("Bearer " + bearerToken, forHTTPHeaderField: "Authorization") }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let error = try? JSONDecoder().decode(ServerError.self, from: data)
            throw WatermelonError.message(error?.error ?? String(localized: "Unable to connect. Please try again."))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private struct ServerError: Decodable { var error: String }
    private struct ReceiptResponse: Decodable { var reference: String; var status: String; var trackingToken: String? }

    func catalog() async throws -> CatalogResult {
        #if DEBUG
        if isTesting { return CatalogResult(products: Self.bundledCatalog(), liveCodes: Set(Self.bundledCatalog().map(\.code)), partial: false) }
        #endif
        async let studioLoad: CatalogResponse? = try? request("/api/watermelon-catalog")
        async let viatorLoad: CatalogResponse? = try? request("/api/viator-catalog")
        async let priceLoad: PriceResponse? = try? request("/api/viator-prices")
        async let promotionLoad: PromotionResponse? = try? request("/api/site-promotions")
        let (studio, viator, prices, promotions) = await (studioLoad, viatorLoad, priceLoad, promotionLoad)
        let validStudio = studio?.source == "watermelon-product-studio" && studio?.error == nil
        let validViator = viator?.source == "viator-partner-api" && viator?.error == nil
        guard validStudio || validViator else {
            throw WatermelonError.message(String(localized: "Catalogue unavailable. Saved details are still accessible."))
        }
        var byCode: [String: Experience] = [:]
        for var product in validViator ? viator?.products ?? [] : [] {
            product.isStudio = false
            if let price = prices?.prices.first(where: { $0.code == product.code }) {
                product.price = price.price
                product.currency = price.currency
            }
            byCode[product.code] = product
        }
        for var product in validStudio ? studio?.products ?? [] : [] {
            product.isStudio = true
            byCode[product.code] = product
        }
        for (code, var product) in byCode {
            if let offer = promotions?.promotions.first(where: { $0.product_code == code }),
               offer.now_price > 0, offer.before_price > offer.now_price {
                product.price = offer.now_price
                product.currency = offer.currency
                product.promotionApplied = true
            }
            byCode[code] = product
        }
        let products = byCode.values.sorted {
            if ($0.isStudio == true) != ($1.isStudio == true) { return $0.isStudio == true }
            return $0.displayTitle.localizedCaseInsensitiveCompare($1.displayTitle) == .orderedAscending
        }
        return CatalogResult(products: products, liveCodes: Set(byCode.keys), partial: !validStudio || !validViator)
    }

    static func bundledCatalog() -> [Experience] {
        guard let url = Bundle.main.url(forResource: "catalogue", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let products = try? JSONDecoder().decode([Experience].self, from: data) else { return [] }
        return products
    }

    func submit(_ selections: [RequestSelection], contact: ContactDetails, proposal: Bool) async throws -> RequestReceipt {
        guard contact.valid, !selections.isEmpty, selections.count <= 20,
              selections.allSatisfy({ $0.guests >= 1 && $0.guests <= $0.experience.guestLimit(for: $0.option) && !$0.date.isEmpty }) else {
            throw WatermelonError.message(String(localized: "Please complete the required details."))
        }
        #if DEBUG
        if isTesting {
            return RequestReceipt(reference: "WM-TEST-" + String(UUID().uuidString.prefix(6)), kind: proposal ? "proposal" : "booking",
                                  createdAt: Date(), items: selections.map(\.tripItem), trackingToken: proposal ? nil : UUID().uuidString)
        }
        #endif
        let customer: [String: Any] = ["customerName": contact.name.trimmingCharacters(in: .whitespacesAndNewlines),
                                       "customerEmail": contact.email.trimmingCharacters(in: .whitespacesAndNewlines),
                                       "customerPhone": contact.phone.trimmingCharacters(in: .whitespacesAndNewlines),
                                       "customerNotes": contact.notes]
        var payload = customer
        if proposal {
            payload["currency"] = "EUR"
            payload["items"] = selections.map { selection -> [String: Any] in
                ["code": selection.experience.code, "title": selection.experience.title,
                 "optionCode": selection.option.optionCode, "optionName": selection.option.optionName,
                 "date": selection.date, "preferredTime": selection.time, "guests": selection.guests,
                 "unitPrice": selection.experience.unitPrice(for: selection.option).map { $0 as Any } ?? NSNull(),
                 "pickupLocation": contact.pickup, "language": contact.language, "notes": contact.notes]
            }
        } else {
            guard selections.count == 1, let selection = selections.first,
                  let mode = selection.experience.basis(for: selection.option) else {
                throw WatermelonError.message(String(localized: "Please request a proposal for this experience."))
            }
            payload.merge(["productCode": selection.experience.code, "experienceTitle": selection.experience.title,
                           "optionCode": selection.option.optionCode, "optionName": selection.option.optionName,
                           "requestedDate": selection.date, "preferredTime": selection.time, "guests": selection.guests,
                           "unitPrice": selection.experience.unitPrice(for: selection.option).map { $0 as Any } ?? NSNull(),
                           "pricingMode": mode.rawValue, "currency": selection.option.currency ?? selection.experience.currency ?? "EUR",
                           "websitePromotion": selection.experience.promotionApplied == true && selection.option.id == selection.experience.availableOptions.first?.id,
                           "pickupLocation": contact.pickup, "language": contact.language]) { _, new in new }
        }
        let response: ReceiptResponse = try await request(proposal ? "/api/proposal-request" : "/api/booking-request",
                                                         method: "POST", body: JSONSerialization.data(withJSONObject: payload))
        return RequestReceipt(reference: response.reference, kind: proposal ? "proposal" : "booking",
                              createdAt: Date(), items: selections.map(\.tripItem), trackingToken: response.trackingToken)
    }

    func bookingStatus(_ receipt: RequestReceipt) async throws -> BookingProgress {
        guard receipt.kind == "booking", let token = receipt.trackingToken, UUID(uuidString: token) != nil,
              receipt.reference.range(of: #"^[A-Za-z0-9-]{1,80}$"#, options: .regularExpression) != nil else {
            throw WatermelonError.message(String(localized: "Contact Watermelon to update this older request."))
        }
        #if DEBUG
        if isTesting {
            return BookingProgress(reference: receipt.reference, status: "pending", payment_status: "not_requested", estimated_total: receipt.items.first?.total, currency: "EUR")
        }
        #endif
        var parts = URLComponents()
        parts.queryItems = [URLQueryItem(name: "reference", value: receipt.reference)]
        struct Response: Decodable { var booking: BookingProgress }
        let result: Response = try await request("/api/booking-status?" + (parts.percentEncodedQuery ?? ""), bearerToken: token)
        guard result.booking.reference == receipt.reference else {
            throw WatermelonError.message(String(localized: "Unable to update the booking. Please try again."))
        }
        return result.booking
    }

    // Calls the existing Watermelon server: the OpenAI key never ships in the iOS app.
    func concierge(message: String, history: [AIChatEntry], conversationId: String,
                   crmReference: String, language: String,
                   recommendations: [AIRecommendation], ideas: [AITailorMadeIdea]) async throws -> AIConciergeReply {
        #if DEBUG
        if isTesting {
            return AIConciergeReply(reply: "I can help you plan a trip in Portugal.", question: "",
                                    intentSummary: "Demo", recommendations: [], tailorMadeIdeas: [],
                                    crmReference: "", crmCreated: false)
        }
        #endif
        let payload: [String: Any] = [
            "message": String(message.prefix(1200)),
            "history": history.suffix(8).map { ["role": $0.role, "content": String($0.content.prefix(1200))] },
            "conversationId": conversationId,
            "crmReference": crmReference,
            "language": language,
            "currentRecommendations": recommendations.prefix(4).map {
                ["code": $0.code, "title": $0.title, "reason": $0.reason]
            },
            "currentTailorMadeIdeas": ideas.prefix(2).map {
                ["title": $0.title, "concept": $0.concept, "reason": $0.reason]
            }
        ]
        return try await request("/api/ai-concierge", method: "POST",
                                 body: JSONSerialization.data(withJSONObject: payload))
    }

    // The deliberate human handoff works independently from the generative AI API.
    func submitTailorMade(name: String, phone: String, email: String,
                          requestedDate: String?, guests: Int, notes: String,
                          history: [AIChatEntry], ideas: [AITailorMadeIdea],
                          conversationId: String, consent: Bool) async throws -> String {
        #if DEBUG
        if isTesting { return "WM-TEST-TAILOR" }
        #endif
        let payload: [String: Any] = [
            "conversationId": conversationId,
            "customerName": name.trimmingCharacters(in: .whitespacesAndNewlines),
            "customerPhone": phone.trimmingCharacters(in: .whitespacesAndNewlines),
            "customerEmail": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "requestedDate": requestedDate ?? "",
            "guests": guests,
            "notes": String(notes.prefix(1500)),
            "consent": consent,
            "history": history.suffix(8).map {
                ["role": $0.role, "content": String($0.content.prefix(600))]
            },
            "ideas": ideas.prefix(2).map {
                ["title": $0.title, "concept": $0.concept, "reason": $0.reason]
            },
        ]
        let receipt: ReceiptResponse = try await request(
            "/api/ai-tailor-request", method: "POST",
            body: JSONSerialization.data(withJSONObject: payload)
        )
        guard receipt.status == "new" || receipt.status == "received" else {
            throw WatermelonError.message(String(localized: "Please check the request status in Watermelon."))
        }
        return receipt.reference
    }

    func proposal(_ link: ProposalLink) async throws -> Proposal {
        var components = URLComponents()
        components.queryItems = [URLQueryItem(name: "reference", value: link.reference), URLQueryItem(name: "token", value: link.token)]
        struct Response: Decodable { var proposal: Proposal }
        let result: Response = try await request("/api/proposal?" + (components.percentEncodedQuery ?? ""))
        return result.proposal
    }

    func respond(_ link: ProposalLink, action: String, message: String = "") async throws {
        guard ["accept", "request_changes"].contains(action), action != "request_changes" || !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WatermelonError.message(String(localized: "Please describe the changes you would like."))
        }
        struct Response: Decodable { var status: String }
        let _: Response = try await request("/api/proposal", method: "POST", body: JSONSerialization.data(withJSONObject:
                ["reference": link.reference, "token": link.token, "action": action, "message": message]))
    }
}

struct AIChatEntry: Codable, Identifiable {
    let id: UUID
    let role: String
    let content: String
    init(role: String, content: String, id: UUID = UUID()) {
        self.id = id
        self.role = role
        self.content = content
    }
}

struct AIRecommendation: Decodable, Identifiable {
    let code: String
    let title: String
    let reason: String
    let location: String?
    let duration: String?
    let price: Double?
    let currency: String?
    let pricingMode: String?
    let livePrice: Bool?
    var id: String { code }
}

struct AITailorMadeIdea: Decodable, Identifiable {
    let title: String
    let concept: String
    let reason: String
    let status: String
    var id: String { title }
}

struct AIConciergeReply: Decodable {
    let reply: String
    let question: String
    let intentSummary: String
    let recommendations: [AIRecommendation]
    let tailorMadeIdeas: [AITailorMadeIdea]
    let crmReference: String
    let crmCreated: Bool
}
