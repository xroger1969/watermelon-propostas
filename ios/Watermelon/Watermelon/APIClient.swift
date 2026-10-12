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

    private func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              url.scheme == "https", url.host == baseURL.host else {
            throw WatermelonError.message(String(localized: "Invalid Watermelon address."))
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
        request.httpMethod = method
        request.httpBody = body
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
    private struct ReceiptResponse: Decodable { var reference: String; var status: String }

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
        let products = byCode.values.sorted { $0.displayTitle.localizedCaseInsensitiveCompare($1.displayTitle) == .orderedAscending }
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
                                  createdAt: Date(), items: selections.map(\.tripItem))
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
                              createdAt: Date(), items: selections.map(\.tripItem))
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
