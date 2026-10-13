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
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText("Plan a three-day trip to Lisbon for four people.")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
    }

    @MainActor
    func testQuickAIIsAvailableFromExploreAndProposals() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 15))

        app.tabBars.buttons["Explore"].tap()
        let exploreComposer = app.descendants(matching: .any)["quickAIInput"]
        XCTAssertTrue(exploreComposer.waitForExistence(timeout: 5))
        exploreComposer.tap()
        exploreComposer.typeText("horse riding")
        app.buttons["quickAISend"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))

        app.tabBars.buttons["Proposals"].tap()
        XCTAssertTrue(app.buttons["discoverFromProposals"].waitForExistence(timeout: 5))
        let proposalComposer = app.descendants(matching: .any)["quickAIInput"]
        XCTAssertTrue(proposalComposer.waitForExistence(timeout: 5))
        proposalComposer.tap()
        proposalComposer.typeText("tailor made day")
        app.buttons["quickAISend"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
    }

    @MainActor
    func testAIComposerCanDismissKeyboardAndContinueConversation() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        input.typeText("Horse riding near Lisbon")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))

        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        XCTAssertTrue(app.buttons["dismissAIKeyboard"].waitForExistence(timeout: 5))
        app.buttons["dismissAIKeyboard"].tap()
        XCTAssertTrue(input.exists)
        input.tap()
        input.typeText("another experience")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["aiSendMessage"].exists)
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
        XCTAssertTrue(app.navigationBars["Watermelon Experiences"].waitForExistence(timeout: 5))
        let remove = app.buttons["Remove saved data"]
        for _ in 0..<8 where !remove.exists { app.swipeUp() }
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
    }
}
