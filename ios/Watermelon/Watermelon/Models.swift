import Foundation

enum PricingBasis: String, Codable {
    case group, per_person
}

struct ExperienceOption: Codable, Identifiable, Hashable {
    var optionCode: String
    var optionName: String
    var optionDescription: String?
    var price: Double?
    var currency: String?
    var priceType: String?
    var startTimes: [String]?
    var capacity: Int?
    var id: String { optionCode }
}

struct Experience: Codable, Identifiable, Hashable {
    var code: String
    var title: String
    var shortTitle: String?
    var description: String?
    var summary: String?
    var category: String?
    var destination: String?
    var location: String?
    var duration: String?
    var image: String?
    var gallery: [String]?
    var highlights: [String]?
    var itinerary: [String]?
    var included: [String]?
    var excluded: [String]?
    var meetingPoint: String?
    var pickup: String?
    var cancellation: String?
    var languages: [String]?
    var maxGuests: Int?
    var price: Double?
    var currency: String?
    var priceType: String?
    var options: [ExperienceOption]?
    var isStudio: Bool?
    var promotionApplied: Bool?
    var id: String { code }
    var displayTitle: String { shortTitle ?? title }
    var place: String { destination ?? location ?? "Portugal" }
    var overview: String { description ?? summary ?? "" }
    var imageURL: URL? { URL(string: image ?? gallery?.first ?? "") }
    var availableOptions: [ExperienceOption] {
        if let options, !options.isEmpty { return options }
        return [ExperienceOption(optionCode: "DEFAULT", optionName: "Standard option")]
    }

    func basis(for option: ExperienceOption) -> PricingBasis? {
        if let type = option.priceType ?? priceType {
            switch type {
            case "Per person", "per_person": return .per_person
            case "Per group", "per_group", "Per vehicle", "per_vehicle", "Fixed", "fixed": return .group
            default: return nil
            }
        }
        // Mirrors the website's legacy pricing rules. Studio pricing must be explicit.
        if isStudio == true { return nil }
        if ["9963P13", "9963P11", "9963P17", "9963P18"].contains(code) { return .group }
        let text = [title, overview, option.optionName, option.optionDescription ?? ""].joined(separator: " ")
        return text.range(of: #"\b(per\s+group|group\s+price|private\s+group|pax\s+group|for\s+groups?)\b"#,
                          options: [.regularExpression, .caseInsensitive]) != nil ? .group : .per_person
    }

    func guestLimit(for option: ExperienceOption) -> Int {
        let legacy = ["9963P13": 4, "9963P11": 6, "9963P17": 4, "9963P18": 12][code]
        return [maxGuests, option.capacity, isStudio == true ? nil : legacy, 50]
            .compactMap { $0 }.filter { $0 > 0 }.min() ?? 50
    }

    func unitPrice(for option: ExperienceOption) -> Double? {
        // A null option price means quotation required, even when the base product has a price.
        let value: Double?
        if isStudio == true {
            value = promotionApplied == true && option.id == availableOptions.first?.id ? price : option.price
        } else { value = option.price ?? price }
        guard let value, value.isFinite, value > 0 else { return nil }
        return value
    }

    func total(for option: ExperienceOption, guests: Int) -> Double? {
        guard guests >= 1, guests <= guestLimit(for: option),
              let price = unitPrice(for: option), let basis = basis(for: option) else { return nil }
        return ((basis == .group ? price : price * Double(guests)) * 100).rounded() / 100
    }
}

struct CatalogResponse: Decodable { var products: [Experience]; var error: String?; var source: String? }
struct PriceResponse: Decodable {
    struct Price: Decodable { var code: String; var price: Double; var currency: String }
    var prices: [Price]
}
struct PromotionResponse: Decodable {
    struct Promotion: Decodable {
        var product_code: String; var before_price: Double; var now_price: Double; var currency: String
    }
    var promotions: [Promotion]
}

struct CatalogResult {
    var products: [Experience]
    var liveCodes: Set<String>
    var partial: Bool
}

struct TripItem: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var optionName: String
    var date: String
    var time: String
    var guests: Int
    var location: String
    var total: Double?
    var currency: String
}

struct RequestReceipt: Codable, Identifiable {
    var reference: String
    var kind: String
    var createdAt: Date
    var items: [TripItem]
    var id: String { reference }
}

struct ProposalLink: Codable, Identifiable, Hashable {
    var reference: String
    var token: String
    var id: String { reference + token }
    var url: URL {
        var components = URLComponents(string: "https://www.watermelonexperiences.pt/proposal/" + reference)!
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        return components.url!
    }
    static func parse(_ input: String) -> ProposalLink? {
        guard let url = URLComponents(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.user == nil, url.password == nil, url.port == nil,
              !url.percentEncodedPath.contains("%"), !url.path.contains("//") else { return nil }
        var path: [String]
        if url.scheme?.lowercased() == "watermelonexperiences", url.host == "proposal" {
            path = ["proposal"] + url.path.split(separator: "/").map(String.init)
        } else {
            guard url.scheme?.lowercased() == "https",
                  ["watermelonexperiences.pt", "www.watermelonexperiences.pt"].contains(url.host?.lowercased() ?? "") else { return nil }
            path = url.path.split(separator: "/").map(String.init)
        }
        guard path.count == 2, path[0] == "proposal",
              path[1].range(of: #"^[A-Za-z0-9-]{1,80}$"#, options: .regularExpression) != nil,
              let token = url.queryItems?.first(where: { $0.name == "token" })?.value,
              token.range(of: #"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"#,
                          options: .regularExpression) != nil else { return nil }
        return ProposalLink(reference: path[1], token: token)
    }
}

struct Proposal: Codable, Identifiable {
    struct Item: Codable, Identifiable {
        var id: String; var experience_title: String; var option_name: String?
        var proposed_date: String?; var proposed_time: String?; var guests: Int
        var line_total: Double; var pickup_location: String?; var notes: String?
    }
    var proposal_id: String
    var reference: String
    var version: Int
    var status: String
    var is_expired: Bool
    var currency: String
    var intro_text: String?
    var conditions_text: String?
    var total: Double
    var customer_name: String
    var payment_status: String
    var payment_token: String?
    var items: [Item]
    var id: String { proposal_id }
    var canRespond: Bool { !is_expired && status != "accepted" }
    var tripItems: [TripItem] {
        items.map { TripItem(id: $0.id, title: $0.experience_title, optionName: $0.option_name ?? "",
                             date: $0.proposed_date ?? "", time: $0.proposed_time ?? "",
                             guests: $0.guests, location: $0.pickup_location ?? "",
                             total: $0.line_total, currency: currency) }
    }
}

enum PortugalDate {
    static let timeZone = TimeZone(identifier: "Europe/Lisbon")!
    static func selectedDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    static func start(day: String, time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false
        let clock = time.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) == nil ? "10:00" : time
        return formatter.date(from: day + " " + clock)
    }
    static func display(_ day: String) -> String {
        guard let date = start(day: day, time: "12:00") else { return day.isEmpty ? String(localized: "To be agreed") : day }
        let formatter = DateFormatter()
        formatter.timeZone = timeZone
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}

func money(_ value: Double, _ currency: String = "EUR") -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = currency
    return formatter.string(from: NSNumber(value: value)) ?? "\(value) \(currency)"
}
