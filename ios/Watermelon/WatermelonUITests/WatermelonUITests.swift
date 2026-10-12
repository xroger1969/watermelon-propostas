import XCTest

final class WatermelonUITests: XCTestCase {
    @MainActor
    func testNativeNavigationAndProposalSelectionWithoutRealCRMRequests() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon"].waitForExistence(timeout: 15))
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
