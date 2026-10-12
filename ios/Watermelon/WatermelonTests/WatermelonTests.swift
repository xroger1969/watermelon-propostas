import XCTest
@testable import Watermelon

final class WatermelonTests: XCTestCase {
    private func product(_ json: String) throws -> Experience {
        try JSONDecoder().decode(Experience.self, from: Data(json.utf8))
    }
    func testGroupPriceIsNotMultipliedByGuests() throws {
        let p = try product(#"{"code":"9963P3","title":"Private boat","isStudio":true,"maxGuests":12,"options":[{"optionCode":"TG1","optionName":"Boat","price":980,"priceType":"Per group","capacity":12}]}"#)
        XCTAssertEqual(p.total(for: p.availableOptions[0], guests: 12), 980)
        XCTAssertNil(p.total(for: p.availableOptions[0], guests: 13))
        XCTAssertNil(p.total(for: p.availableOptions[0], guests: 0))
    }
    func testPerPersonPriceAndRounding() throws {
        let p = try product(#"{"code":"FOOD","title":"Food","isStudio":true,"options":[{"optionCode":"FOOD","optionName":"Tasting","price":60.125,"priceType":"Per person"}]}"#)
        XCTAssertEqual(p.total(for: p.availableOptions[0], guests: 3), 180.38)
    }
    func testNullOptionPriceDoesNotInheritBasePrice() throws {
        let p = try product(#"{"code":"9963P3","title":"Boat","price":980,"isStudio":true,"options":[{"optionCode":"TG1","optionName":"No transfer","price":980,"priceType":"Per group"},{"optionCode":"TG2","optionName":"With transfer","price":null,"priceType":"Per group"}]}"#)
        XCTAssertNil(p.unitPrice(for: p.availableOptions[1]))
        XCTAssertNil(p.total(for: p.availableOptions[1], guests: 10))
    }
    func testLegacyPrivateTourCapacityAndUnknownStudioBasis() throws {
        let legacy = try product(#"{"code":"9963P13","title":"Private Arrabida tour"}"#)
        XCTAssertEqual(legacy.basis(for: legacy.availableOptions[0]), .group)
        XCTAssertEqual(legacy.guestLimit(for: legacy.availableOptions[0]), 4)
        let studio = try product(#"{"code":"TEST","title":"Tour","isStudio":true,"options":[{"optionCode":"A","optionName":"A","price":100}]}"#)
        XCTAssertNil(studio.basis(for: studio.availableOptions[0]))
    }
    func testPrivateProposalLinkValidation() {
        let token = "c384c014-56a7-4f35-a730-05a036e60780"
        XCTAssertNotNil(ProposalLink.parse("https://www.watermelonexperiences.pt/proposal/WM-P-261012-ABC123?token=" + token))
        XCTAssertNotNil(ProposalLink.parse("watermelonexperiences://proposal/WM-P-261012-ABC123?token=" + token))
        XCTAssertNil(ProposalLink.parse("https://attacker.example/proposal/WM-P-TEST?token=" + token))
        XCTAssertNil(ProposalLink.parse("http://watermelonexperiences.pt/proposal/WM-P-TEST?token=" + token))
        XCTAssertNil(ProposalLink.parse("https://watermelonexperiences.pt.attacker.example/proposal/TEST?token=" + token))
        XCTAssertNil(ProposalLink.parse("https://watermelonexperiences.pt/proposal/TEST?token=invalid"))
        XCTAssertNil(ProposalLink.parse("https://user@watermelonexperiences.pt/proposal/TEST?token=" + token))
        XCTAssertNil(ProposalLink.parse("https://watermelonexperiences.pt/proposal/TEST/extra?token=" + token))
        XCTAssertNil(ProposalLink.parse("https://watermelonexperiences.pt/proposal/%2FTEST?token=" + token))
    }
    func testPortugalTimeAndInvalidDate() {
        let summer = PortugalDate.start(day: "2026-07-12", time: "10:00")!
        let winter = PortugalDate.start(day: "2026-12-12", time: "10:00")!
        XCTAssertEqual(PortugalDate.timeZone.secondsFromGMT(for: summer), 3600)
        XCTAssertEqual(PortugalDate.timeZone.secondsFromGMT(for: winter), 0)
        XCTAssertNil(PortugalDate.start(day: "2026-02-30", time: "10:00"))
    }
    func testBookingPayloadMatchesCRMAndKeepsGroupPrice() async throws {
        let p = try product(#"{"code":"9963P3","title":"Private boat","isStudio":true,"maxGuests":12,"options":[{"optionCode":"TG1","optionName":"Boat","price":980,"priceType":"Per group","capacity":12}]}"#)
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/booking-request")
            XCTAssertEqual(request.httpMethod, "POST")
            let json = try JSONSerialization.jsonObject(with: self.body(request)) as! [String: Any]
            XCTAssertEqual(json["unitPrice"] as? Double, 980)
            XCTAssertEqual(json["guests"] as? Int, 12)
            XCTAssertEqual(json["pricingMode"] as? String, "group")
            XCTAssertEqual(json["productCode"] as? String, "9963P3")
            return (200, #"{"reference":"WM-TEST-ONLY","status":"pending"}"#)
        }
        defer { MockURLProtocol.handler = nil }
        let selection = RequestSelection(experience: p, option: p.availableOptions[0], date: "2026-12-12", time: "10:00", guests: 12)
        let receipt = try await client().submit([selection], contact: ContactDetails(name: "QA", phone: "000000000"), proposal: false)
        XCTAssertEqual(receipt.reference, "WM-TEST-ONLY")
        XCTAssertEqual(receipt.items[0].total, 980)
    }
    func testServerFailureDoesNotCreateSuccessfulReceipt() async throws {
        let p = try product(#"{"code":"FOOD","title":"Food","price":60,"priceType":"Per person"}"#)
        MockURLProtocol.handler = { _ in (409, #"{"error":"The price has changed."}"#) }
        defer { MockURLProtocol.handler = nil }
        do {
            _ = try await client().submit([RequestSelection(experience: p, option: p.availableOptions[0], date: "2026-12-12", time: "Flexible", guests: 2)],
                                          contact: ContactDetails(name: "QA", phone: "000000000"), proposal: false)
            XCTFail("A rejected request must not be recorded as sent")
        } catch { XCTAssertEqual(error.localizedDescription, "The price has changed.") }
    }
    func testStudioOverridesDuplicateViatorProductAndOptionPrices() async throws {
        MockURLProtocol.handler = { request in
            switch request.url?.path {
            case "/api/watermelon-catalog": return (200, #"{"source":"watermelon-product-studio","products":[{"code":"9963P3","title":"Studio boat","price":980,"priceType":"Per group","options":[{"optionCode":"TG1","optionName":"Boat","price":980,"priceType":"Per group"},{"optionCode":"TG2","optionName":"Transfer","price":null,"priceType":"Per group"}]}]}"#)
            case "/api/viator-catalog": return (200, #"{"source":"viator-partner-api","products":[{"code":"9963P3","title":"Duplicate boat"},{"code":"FOOD","title":"Food"}]}"#)
            case "/api/viator-prices": return (200, #"{"prices":[{"code":"FOOD","price":60,"currency":"EUR"}]}"#)
            case "/api/site-promotions": return (200, #"{"promotions":[{"product_code":"9963P3","before_price":980,"now_price":900,"currency":"EUR"}]}"#)
            default: throw URLError(.badURL)
            }
        }
        defer { MockURLProtocol.handler = nil }
        let result = try await client().catalog()
        XCTAssertEqual(result.products.count, 2)
        let boat = result.products.first { $0.code == "9963P3" }!
        XCTAssertEqual(boat.title, "Studio boat")
        XCTAssertEqual(boat.unitPrice(for: boat.availableOptions[0]), 900)
        XCTAssertNil(boat.unitPrice(for: boat.availableOptions[1]))
        XCTAssertEqual(result.liveCodes, Set(["9963P3", "FOOD"]))
    }
    func testUnconfiguredFeedsDoNotEnableCachedBookings() async throws {
        MockURLProtocol.handler = { request in
            if request.url?.path == "/api/watermelon-catalog" { return (200, #"{"source":"legacy-fallback","products":[],"error":"Not configured"}"#) }
            return (503, #"{"error":"Unavailable"}"#)
        }
        defer { MockURLProtocol.handler = nil }
        do { _ = try await client().catalog(); XCTFail("Unconfigured catalogue is not a live catalogue") }
        catch {
            XCTAssertTrue(error is WatermelonError)
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
    }
    private func client() -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return APIClient(session: URLSession(configuration: config))
    }
    private func body(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data(), buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

final class MockURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, String))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw URLError(.badServerResponse) }
            let (status, json) = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(json.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() { }
}
