import XCTest

final class WatermelonUITests: XCTestCase {
    @MainActor
    func testAppStoreScreenshots() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon"].waitForExistence(timeout: 15))
        for (name, tab) in [("01-Explore", "Explore"), ("02-Watermelon-AI", "Watermelon AI"), ("03-Proposals", "Proposals"), ("04-My-Trips", "My trips")] {
            let button = app.tabBars.buttons[tab]
            XCTAssertTrue(button.waitForExistence(timeout: 5))
            button.tap()
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    @MainActor
    private func switchToAI(_ app: XCUIApplication) {
        let tab = app.tabBars.buttons["Watermelon AI"]
        XCTAssertTrue(tab.waitForExistence(timeout: 15))
        tab.tap()
        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testOpensExploreAndShowsProgrammesBeforeAnyTap() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["explorePlanWithAI"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["quickAIInput"].exists)
        let programme = app.staticTexts["Private Tour South of Lisbon — Cacilhas, Almada & Costa da Caparica"]
        if !programme.exists { app.swipeUp() }
        XCTAssertTrue(programme.waitForExistence(timeout: 5), "Explore should display catalogue items at launch.")
    }

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
        switchToAI(app)
        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 15))
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText("Plan a three-day trip to Lisbon for four people.")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
    }

    @MainActor
    func testAIComposerExpandsForLongDraftsAndKeepsSendAccessible() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        switchToAI(app)

        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        let initialHeight = input.frame.height

        let draft = String(repeating: "Plan a day near Lisbon with local stops and suggested timings. ", count: 5)
        input.typeText(draft)
        XCTAssertGreaterThan(input.frame.height, initialHeight + 12,
                             "The composer must expand vertically as the message wraps.")
        XCTAssertTrue(app.buttons["aiSendMessage"].isHittable,
                      "The send button must remain available while typing a long message.")

        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
        XCTAssertLessThanOrEqual(input.frame.height, initialHeight + 5,
                                 "The composer must shrink back after sending.")
    }

    @MainActor
    func testAIConversationAutomaticallyShowsLatestMessagesAboveComposer() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        switchToAI(app)
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Explore unforgettable experiences in Portugal, or tell Watermelon AI what you imagine. We'll help shape a personal programme."].exists)

        input.tap()
        input.typeText("A three-day trip to Lisbon")
        app.buttons["aiSendMessage"].tap()
        let replies = app.staticTexts.matching(identifier: "aiAssistantMessage")
        XCTAssertTrue(replies.firstMatch.waitForExistence(timeout: 10))
        let firstVisible = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hittable == true"), object: replies.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [firstVisible], timeout: 5), .completed,
                       "The AI reply must appear beside the composer without scrolling up.")
        XCTAssertFalse(app.staticTexts["Discover more. Travel your way."].exists,
                       "The introductory card must disappear after starting the chat.")

        let priorReplyCount = replies.count
        input.tap()
        input.typeText("Please include the beach")
        app.buttons["aiSendMessage"].tap()
        let latestReply = replies.element(boundBy: priorReplyCount)
        XCTAssertTrue(latestReply.waitForExistence(timeout: 10))
        let latestVisible = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hittable == true"), object: latestReply)
        XCTAssertEqual(XCTWaiter.wait(for: [latestVisible], timeout: 5), .completed,
                       "The latest AI reply must stay visible above the input.")
        XCTAssertTrue(app.buttons["aiNewConversation"].exists)
        XCTAssertTrue(input.exists)
    }

    @MainActor
    func testQuickAIIsAvailableFromExploreAndProposals() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon"].waitForExistence(timeout: 15))
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
        switchToAI(app)
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
    func testVoiceAndCatalogueNavigationAreDiscoverableWithoutLiveMicrophone() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        switchToAI(app)
        XCTAssertTrue(app.buttons["homeExplore"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["homeProposals"].exists)
        XCTAssertTrue(app.buttons["homeSpeakAI"].exists)
        XCTAssertTrue(app.buttons["aiMicrophone"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["aiMessageInput"].exists)
        app.buttons["homeExplore"].tap()
        XCTAssertTrue(app.buttons["explorePlanWithAI"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["quickAIVoice"].exists)
        app.buttons["explorePlanWithAI"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["aiMessageInput"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["aiMicrophone"].exists)
    }

    @MainActor
    func testProminentAIComposerStaysAvailableAcrossConversationAndExplore() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        switchToAI(app)

        XCTAssertTrue(app.staticTexts["Talk to Watermelon AI"].waitForExistence(timeout: 15))
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.exists)
        XCTAssertTrue(app.buttons["aiMicrophone"].exists)
        XCTAssertTrue(app.buttons["aiSendMessage"].exists)

        input.tap()
        input.typeText("A family tour around Lisbon")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Talk to Watermelon AI"].exists)

        app.tabBars.buttons["Explore"].tap()
        XCTAssertTrue(app.staticTexts["Ask Watermelon AI"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["quickAIInput"].exists)
        app.tabBars.buttons["Proposals"].tap()
        XCTAssertTrue(app.staticTexts["Ask Watermelon AI"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["AI proposal enquiries"].exists)
        XCTAssertFalse(app.staticTexts["WM-AI-261013-58351237"].exists)
    }

    @MainActor
    func testNativeNavigationAndProposalSelectionWithoutRealCRMRequests() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Watermelon"].waitForExistence(timeout: 5))
        // Cards are refreshed asynchronously; do not tap a stale bundled-catalogue label.
        let experience = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "experienceCard-")).firstMatch
        if !experience.waitForExistence(timeout: 10) { app.swipeUp() }
        XCTAssertTrue(experience.waitForExistence(timeout: 5))
        experience.tap()
        XCTAssertTrue(app.navigationBars["Experience"].waitForExistence(timeout: 10))
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
    @MainActor
    func testTailorMadeButtonOpensDirectCRMFormWithoutAnotherAICall() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        switchToAI(app)
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        input.typeText("A custom Lisbon itinerary with vegan lunch and unusual pickup hours")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
        let handoff = app.buttons["aiTailorProposal"]
        for _ in 0..<6 where !handoff.isHittable { app.swipeUp() }
        XCTAssertTrue(handoff.waitForExistence(timeout: 5))
        handoff.tap()
        XCTAssertTrue(app.navigationBars["Tailor-made proposal"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["tailorCustomerName"].exists)
        XCTAssertTrue(app.textFields["tailorCustomerPhone"].exists)
        XCTAssertTrue(app.buttons["tailorSubmit"].exists)
        XCTAssertFalse(app.buttons["tailorSubmit"].isEnabled)
    }


}
