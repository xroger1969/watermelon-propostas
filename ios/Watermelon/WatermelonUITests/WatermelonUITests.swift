import XCTest

final class WatermelonUITests: XCTestCase {
    @MainActor
    func testPortugueseControlsUsePortugalLocalization() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(pt-PT)", "-AppleLocale", "pt_PT"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Propostas"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.tabBars.buttons["As minhas viagens"].exists)
        app.tabBars.buttons["Explorar"].tap()
        XCTAssertTrue(app.staticTexts["Portugal, à sua maneira."].waitForExistence(timeout: 5))
    }
    @MainActor
    func testNativeAIConversationUsesMockWithoutCallingLiveCRM() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 15))
        let suggestion = app.buttons["Plan a three-day trip to Lisbon for four people."]
        XCTAssertTrue(suggestion.waitForExistence(timeout: 5))
        suggestion.tap()
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
    }

    @MainActor
    func testNativeNavigationAndProposalSelectionWithoutRealCRMRequests() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 15))
        app.tabBars.buttons["Explore"].tap()
        XCTAssertTrue(app.navigationBars["Watermelon"].waitForExistence(timeout: 5))
        let firstExperience = app.staticTexts["Private Tour South of Lisbon — Cacilhas, Almada & Costa da Caparica"]
        if !firstExperience.waitForExistence(timeout: 10) { app.swipeUp() }
        XCTAssertTrue(firstExperience.waitForExistence(timeout: 5))
        firstExperience.tap()
        let add = app.buttons["addToProposal"]
        for _ in 0..<6 where !add.isHittable { app.swipeUp() }
        XCTAssertTrue(add.exists)
        add.tap()
        XCTAssertTrue(app.navigationBars["Proposals"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["requestProposal"].exists)
        app.tabBars.buttons["My trips"].tap()
        XCTAssertTrue(app.staticTexts["Your trips start here"].waitForExistence(timeout: 5))
        app.tabBars.buttons["More"].tap()
        XCTAssertTrue(app.buttons["Remove saved data"].waitForExistence(timeout: 5))
    }
}
