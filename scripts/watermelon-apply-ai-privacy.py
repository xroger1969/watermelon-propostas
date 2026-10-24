#!/usr/bin/env python3
"""Apply a bounded, checked privacy change to the Watermelon release source."""
from pathlib import Path
import json
import plistlib

ROOT = Path('ios/Watermelon')
edits = {}
def read(path):
    path = Path(path)
    return edits.get(path, path.read_text())
def replace(path, old, new):
    path = Path(path)
    value = read(path)
    if value.count(old) != 1:
        raise RuntimeError(f'Expected one source anchor in {path}: {old[:90]!r}')
    edits[path] = value.replace(old, new)
def append(path, text):
    path = Path(path)
    edits[path] = read(path) + text

store = ROOT / 'Watermelon/AppStore.swift'
append(store, r'''

// A single permission gate covers every AI entry point, including catalogue prompts
// and speech. Declining leaves catalogue, favourites and manual requests available.
@MainActor
final class AIConsentController: ObservableObject {
    static let consentKey = "watermelon.ai.dataSharingConsentVersion"
    static let currentVersion = 1
    static let shared: AIConsentController = {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            let name = "watermelon.ui-tests.ai-consent"
            let defaults = UserDefaults(suiteName: name)!
            defaults.removePersistentDomain(forName: name)
            return AIConsentController(defaults: defaults)
        }
        #endif
        return AIConsentController(defaults: .standard)
    }()
    @Published var showDisclosure = false
    @Published private(set) var hasPermission: Bool
    private let defaults: UserDefaults
    private var pending: [UUID: CheckedContinuation<Bool, Never>] = [:]

    init(defaults: UserDefaults) {
        self.defaults = defaults
        hasPermission = defaults.integer(forKey: Self.consentKey) == Self.currentVersion
    }

    func requestPermission() async -> Bool {
        guard !Task.isCancelled else { return false }
        if hasPermission { return true }
        let id = UUID()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                guard !Task.isCancelled else {
                    continuation.resume(returning: false)
                    return
                }
                pending[id] = continuation
                showDisclosure = true
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.cancelRequest(id) }
        }
    }

    func resolve(allow: Bool) {
        hasPermission = allow
        if allow { defaults.set(Self.currentVersion, forKey: Self.consentKey) }
        else { defaults.removeObject(forKey: Self.consentKey) }
        showDisclosure = false
        let continuations = Array(pending.values)
        pending.removeAll()
        continuations.forEach { $0.resume(returning: allow) }
    }

    func dismissPending() {
        // Closing the disclosure without pressing Allow is not permission.
        // Dismissing an already-authorised settings screen retains that choice.
        if !pending.isEmpty { resolve(allow: false) }
    }

    private func cancelRequest(_ id: UUID) {
        pending.removeValue(forKey: id)?.resume(returning: false)
        if pending.isEmpty { showDisclosure = false }
    }
}

@MainActor
struct AIPrivacyDisclosureView: View {
    @ObservedObject var consent: AIConsentController
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Label(consent.hasPermission ? "AI sharing is enabled." : "AI sharing is disabled.", systemImage: "hand.raised")
                            .font(.headline)
                        Text("Watermelon sends your messages, recent conversation, conversation identifier and relevant trip or proposal details to OpenAI to generate suggestions. This includes any personal details you type.")
                            .accessibilityIdentifier("aiPrivacyDisclosure")
                        Text("Voice input uses Apple speech recognition. Audio may be processed by Apple; only the resulting text is sent to the AI service.")
                        Text("You can refuse and still browse experiences or request proposals without AI. Change this choice here at any time.")
                        Text("Stopping sharing prevents future AI requests. For deletion of information already sent, contact info@watermelonexperiences.pt.")
                            .font(.footnote)
                        Link("Privacy policy", destination: URL(string: "https://www.watermelonexperiences.pt/privacy")!)
                    }
                    .padding(20)
                    .frame(maxWidth: 660, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                VStack(spacing: 10) {
                    if consent.hasPermission {
                        Button("Stop sharing with OpenAI", role: .destructive) { consent.resolve(allow: false) }
                            .accessibilityIdentifier("aiPrivacyRevoke")
                            .buttonStyle(.bordered)
                        Button("Done") { consent.showDisclosure = false }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Button("Allow sharing with OpenAI") { consent.resolve(allow: true) }
                            .accessibilityIdentifier("aiPrivacyAllow")
                            .buttonStyle(.borderedProminent)
                        Button("Not now", role: .cancel) { consent.resolve(allow: false) }
                            .accessibilityIdentifier("aiPrivacyDecline")
                            .buttonStyle(.bordered)
                    }
                }
                .controlSize(.large)
                .padding(16)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("AI privacy")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
''')
replace(store, '    func clear() {\n        saved = Saved(catalog: saved.catalog)',
        '    func clear() {\n        AIConsentController.shared.resolve(allow: false)\n        saved = Saved(catalog: saved.catalog)')

app = ROOT / 'Watermelon/WatermelonApp.swift'
replace(app, 'struct RootView: View {\n    @EnvironmentObject private var store: TravelStore',
        '@MainActor\nstruct RootView: View {\n    @StateObject private var aiConsent = AIConsentController.shared\n    @EnvironmentObject private var store: TravelStore')
replace(app, '        .task { await store.refresh() }\n        .onChange(of: scenePhase)',
        '        .sheet(isPresented: $aiConsent.showDisclosure, onDismiss: { aiConsent.dismissPending() }) {\n            AIPrivacyDisclosureView(consent: aiConsent)\n        }\n        .task { await store.refresh() }\n        .onChange(of: scenePhase)')
replace(app, '    func start(locale: Locale) async {\n        guard !listening else { return }',
        '    func start(locale: Locale) async {\n        guard !listening else { return }\n        guard await AIConsentController.shared.requestPermission(), !Task.isCancelled, !listening else { return }')
replace(app, '        .navigationTitle("Watermelon AI")\n        .navigationBarTitleDisplayMode(.inline)\n        .toolbar {',
        '        .navigationTitle("Watermelon AI")\n        .navigationBarTitleDisplayMode(.inline)\n        .toolbar {\n            ToolbarItem(placement: .topBarTrailing) {\n                Button { AIConsentController.shared.showDisclosure = true } label: {\n                    Label("AI privacy", systemImage: "hand.raised")\n                }.accessibilityIdentifier("aiPrivacySettings")\n            }')
# If consent is revoked while a response is in flight, do not append it to the chat.
replace(app, '            if reply.crmCreated, !reply.crmReference.isEmpty {',
        '            guard AIConsentController.shared.hasPermission else { return }\n            if reply.crmCreated, !reply.crmReference.isEmpty {')

api = ROOT / 'Watermelon/APIClient.swift'
replace(api, '                   recommendations: [AIRecommendation], ideas: [AITailorMadeIdea]) async throws -> AIConciergeReply {\n        #if DEBUG',
        '                   recommendations: [AIRecommendation], ideas: [AITailorMadeIdea]) async throws -> AIConciergeReply {\n        guard await AIConsentController.shared.requestPermission() else {\n            throw WatermelonError.message(String(localized: "Permission required to use Watermelon AI."))\n        }\n        try Task.checkCancellation()\n        #if DEBUG')
more = ROOT / 'Watermelon/TripViews.swift'
replace(more, '            Section("Privacy") {\n                Link("Privacy policy",',
        '            Section("Privacy") {\n                Button("AI privacy") { AIConsentController.shared.showDisclosure = true }\n                    .accessibilityIdentifier("aiPrivacySettings")\n                Link("Privacy policy",')

ui = ROOT / 'WatermelonUITests/WatermelonUITests.swift'
replace(ui, '        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 5))\n    }',
        '        XCTAssertTrue(app.navigationBars["Watermelon AI"].waitForExistence(timeout: 5))\n        app.buttons["aiPrivacySettings"].tap()\n        let allow = app.buttons["aiPrivacyAllow"]\n        XCTAssertTrue(allow.waitForExistence(timeout: 5))\n        allow.tap()\n    }')
needle = '''    func testQuickAIIsAvailableFromExploreAndProposals() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
'''
replace(ui, needle, needle + '        switchToAI(app)\n        app.tabBars.buttons["Explore"].tap()\n')
replace(ui, 'final class WatermelonUITests: XCTestCase {\n', r'''final class WatermelonUITests: XCTestCase {
    @MainActor
    func testAIRequiresPermissionAndDecliningKeepsCatalogueUsable() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        let input = app.descendants(matching: .any)["quickAIInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        input.typeText("Plan a coastal day")
        app.buttons["quickAISend"].tap()
        let decline = app.buttons["aiPrivacyDecline"]
        XCTAssertTrue(decline.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["aiPrivacyDisclosure"].exists)
        XCTAssertFalse(app.staticTexts["I can help you plan a trip in Portugal."].exists)
        decline.tap()
        XCTAssertTrue(app.staticTexts["Permission required to use Watermelon AI."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["I can help you plan a trip in Portugal."].exists)
        app.tabBars.buttons["Explore"].tap()
        XCTAssertTrue(app.buttons["explorePlanWithAI"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testAIAllowThenRevokeRequiresFreshPermission() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "-AppleLanguages", "(en)", "-AppleLocale", "en_GB"]
        app.launch()
        switchToAI(app)
        let input = app.descendants(matching: .any)["aiMessageInput"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText("Plan a day in Portugal")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.staticTexts["I can help you plan a trip in Portugal."].waitForExistence(timeout: 10))
        app.buttons["aiPrivacySettings"].tap()
        let revoke = app.buttons["aiPrivacyRevoke"]
        XCTAssertTrue(revoke.waitForExistence(timeout: 5))
        revoke.tap()
        input.tap()
        input.typeText("Add a beach visit")
        app.buttons["aiSendMessage"].tap()
        XCTAssertTrue(app.buttons["aiPrivacyAllow"].waitForExistence(timeout: 5))
        app.buttons["aiPrivacyDecline"].tap()
    }

''')
unit = ROOT / 'WatermelonTests/WatermelonTests.swift'
replace(unit, 'final class WatermelonTests: XCTestCase {\n', r'''final class WatermelonTests: XCTestCase {
    @MainActor
    func testAIConsentDefaultsToDeniedAndCanBeRevoked() async {
        let name = "watermelon.consent-unit.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let consent = AIConsentController(defaults: defaults)
        XCTAssertFalse(consent.hasPermission)
        let denied = Task { await consent.requestPermission() }
        for _ in 0..<100 where !consent.showDisclosure { await Task.yield() }
        XCTAssertTrue(consent.showDisclosure)
        consent.dismissPending()
        let deniedValue = await denied.value
        XCTAssertFalse(deniedValue)
        XCTAssertFalse(consent.hasPermission)
        let allowed = Task { await consent.requestPermission() }
        for _ in 0..<100 where !consent.showDisclosure { await Task.yield() }
        consent.resolve(allow: true)
        let allowedValue = await allowed.value
        XCTAssertTrue(allowedValue)
        XCTAssertTrue(AIConsentController(defaults: defaults).hasPermission)
        consent.resolve(allow: false)
        XCTAssertFalse(AIConsentController(defaults: defaults).hasPermission)
    }

    @MainActor
    func testOldAIConsentVersionDoesNotCountAsPermission() {
        let name = "watermelon.consent-unit.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        defaults.set(-1, forKey: AIConsentController.consentKey)
        XCTAssertFalse(AIConsentController(defaults: defaults).hasPermission)
    }

''')
manifest = ROOT / 'Watermelon/PrivacyInfo.xcprivacy'
value = plistlib.loads(read(manifest).encode())
reasons = value.setdefault('NSPrivacyAccessedAPITypes', [])
if not any(item.get('NSPrivacyAccessedAPIType') == 'NSPrivacyAccessedAPICategoryUserDefaults' for item in reasons):
    reasons.append({'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults', 'NSPrivacyAccessedAPITypeReasons': ['CA92.1']})
edits[manifest] = plistlib.dumps(value, sort_keys=False).decode()

policy = Path('app/privacy/page.tsx')
replace(policy, 'Last updated: 30 September 2026', 'Last updated: 24 October 2026')
replace(policy, '          <h2>5. AI Concierge</h2>\n', '''          <h2>5. AI Concierge</h2>
          <p>
            In the iOS app, we ask for your explicit permission before the first
            AI request or AI voice input. The disclosure identifies OpenAI and
            explains that your message, recent conversation, conversation
            identifier and relevant trip or proposal details are sent through
            Watermelon to OpenAI to generate suggestions. Any personal details
            you include in those messages are part of this processing.
          </p>
          <p>
            You may decline and continue browsing experiences or sending manual
            requests without AI. Open AI privacy in the AI screen or More to
            change your choice. Withdrawing permission prevents future AI
            requests; it does not recall information already transmitted.
            Contact info@watermelonexperiences.pt for deletion requests.
          </p>
          <p>
            Voice input also requires the iOS microphone and speech-recognition
            permissions. Audio may be processed by Apple speech services; the
            app sends the resulting text, not the audio recording, to the AI
            service. You can stop dictation or type instead.
          </p>
''')

# Every disclosure is localised in the app's eight supported languages.
keys = [
 'AI privacy',
 'AI sharing is enabled.',
 'AI sharing is disabled.',
 'Watermelon sends your messages, recent conversation, conversation identifier and relevant trip or proposal details to OpenAI to generate suggestions. This includes any personal details you type.',
 'Voice input uses Apple speech recognition. Audio may be processed by Apple; only the resulting text is sent to the AI service.',
 'You can refuse and still browse experiences or request proposals without AI. Change this choice here at any time.',
 'Stopping sharing prevents future AI requests. For deletion of information already sent, contact info@watermelonexperiences.pt.',
 'Allow sharing with OpenAI',
 'Not now',
 'Stop sharing with OpenAI',
 'Permission required to use Watermelon AI.'
]
translations = {
 'en': keys,
 'pt-PT': ['Privacidade da IA','A partilha com a IA está ativa.','A partilha com a IA está desativada.','A Watermelon envia as suas mensagens, a conversa recente, o identificador da conversa e os dados relevantes da viagem ou proposta à OpenAI para gerar sugestões. Isto inclui os dados pessoais que escrever.','A entrada por voz utiliza o reconhecimento de fala da Apple. O áudio pode ser processado pela Apple; apenas o texto resultante é enviado ao serviço de IA.','Pode recusar e continuar a explorar experiências ou a pedir propostas sem IA. Pode alterar esta escolha aqui a qualquer momento.','Desativar a partilha impede novos pedidos à IA. Para pedir a eliminação de informação já enviada, contacte info@watermelonexperiences.pt.','Permitir partilha com a OpenAI','Agora não','Desativar partilha com a OpenAI','É necessária autorização para utilizar a Watermelon AI.'],
 'pt-BR': ['Privacidade da IA','O compartilhamento com a IA está ativado.','O compartilhamento com a IA está desativado.','A Watermelon envia suas mensagens, a conversa recente, o identificador da conversa e os dados relevantes da viagem ou proposta à OpenAI para gerar sugestões. Isso inclui os dados pessoais que você digitar.','A entrada por voz usa o reconhecimento de fala da Apple. O áudio pode ser processado pela Apple; apenas o texto resultante é enviado ao serviço de IA.','Você pode recusar e continuar explorando experiências ou solicitando propostas sem IA. Altere esta escolha aqui a qualquer momento.','Desativar o compartilhamento impede novas solicitações à IA. Para solicitar a exclusão de informações já enviadas, entre em contato com info@watermelonexperiences.pt.','Permitir compartilhamento com a OpenAI','Agora não','Desativar compartilhamento com a OpenAI','É necessária autorização para usar a Watermelon AI.'],
 'es': ['Privacidad de la IA','El intercambio con la IA está activado.','El intercambio con la IA está desactivado.','Watermelon envía tus mensajes, la conversación reciente, su identificador y los datos relevantes del viaje o propuesta a OpenAI para generar sugerencias. Esto incluye los datos personales que escribas.','La entrada por voz utiliza el reconocimiento de voz de Apple. Apple puede procesar el audio; solo el texto resultante se envía al servicio de IA.','Puedes rechazarlo y seguir explorando experiencias o solicitando propuestas sin IA. Cambia esta elección aquí cuando quieras.','Desactivar el intercambio impide nuevas solicitudes a la IA. Para solicitar la eliminación de información ya enviada, contacta con info@watermelonexperiences.pt.','Permitir compartir con OpenAI','Ahora no','Dejar de compartir con OpenAI','Se necesita permiso para usar Watermelon AI.'],
 'fr': ['Confidentialité de l’IA','Le partage avec l’IA est activé.','Le partage avec l’IA est désactivé.','Watermelon transmet vos messages, la conversation récente, son identifiant et les informations pertinentes du voyage ou du devis à OpenAI pour générer des suggestions. Cela inclut les données personnelles que vous saisissez.','La saisie vocale utilise la reconnaissance vocale d’Apple. Apple peut traiter l’audio ; seul le texte obtenu est transmis au service d’IA.','Vous pouvez refuser et continuer à explorer les expériences ou à demander des devis sans IA. Modifiez ce choix ici à tout moment.','Désactiver le partage empêche toute nouvelle demande à l’IA. Pour supprimer des informations déjà transmises, contactez info@watermelonexperiences.pt.','Autoriser le partage avec OpenAI','Pas maintenant','Arrêter le partage avec OpenAI','Une autorisation est nécessaire pour utiliser Watermelon AI.'],
 'de': ['KI-Datenschutz','Die Datenweitergabe an die KI ist aktiviert.','Die Datenweitergabe an die KI ist deaktiviert.','Watermelon sendet Ihre Nachrichten, den bisherigen Gesprächsverlauf, die Gesprächskennung sowie relevante Reise- oder Angebotsdaten an OpenAI, um Vorschläge zu erstellen. Dies schließt persönliche Angaben ein, die Sie eingeben.','Die Spracheingabe nutzt Apples Spracherkennung. Apple kann Audiodaten verarbeiten; nur der daraus entstandene Text wird an den KI-Dienst gesendet.','Sie können ablehnen und weiterhin Erlebnisse ansehen oder Angebote ohne KI anfragen. Sie können diese Entscheidung hier jederzeit ändern.','Das Deaktivieren verhindert weitere KI-Anfragen. Zur Löschung bereits gesendeter Informationen kontaktieren Sie info@watermelonexperiences.pt.','Datenweitergabe an OpenAI erlauben','Jetzt nicht','Datenweitergabe an OpenAI beenden','Für Watermelon AI ist Ihre Zustimmung erforderlich.'],
 'it': ['Privacy dell’IA','La condivisione con l’IA è attiva.','La condivisione con l’IA è disattivata.','Watermelon invia i tuoi messaggi, la conversazione recente, il suo identificativo e i dati pertinenti del viaggio o del preventivo a OpenAI per generare suggerimenti. Sono inclusi i dati personali che inserisci.','L’inserimento vocale usa il riconoscimento vocale di Apple. Apple può elaborare l’audio; solo il testo risultante viene inviato al servizio di IA.','Puoi rifiutare e continuare a esplorare esperienze o richiedere preventivi senza IA. Puoi modificare questa scelta qui in qualsiasi momento.','Disattivare la condivisione impedisce nuove richieste all’IA. Per eliminare informazioni già inviate, contatta info@watermelonexperiences.pt.','Consenti condivisione con OpenAI','Non ora','Interrompi condivisione con OpenAI','È necessaria l’autorizzazione per usare Watermelon AI.'],
 'nl': ['AI-privacy','Delen met AI is ingeschakeld.','Delen met AI is uitgeschakeld.','Watermelon stuurt uw berichten, het recente gesprek, de gespreksidentificatie en relevante reis- of offertegegevens naar OpenAI om suggesties te genereren. Dit omvat de persoonlijke gegevens die u invoert.','Spraakinvoer gebruikt de spraakherkenning van Apple. Apple kan audio verwerken; alleen de resulterende tekst wordt naar de AI-dienst gestuurd.','U kunt weigeren en ervaringen blijven bekijken of offertes aanvragen zonder AI. U kunt deze keuze hier op elk moment wijzigen.','Delen uitschakelen voorkomt nieuwe AI-verzoeken. Neem voor het verwijderen van eerder verstuurde informatie contact op via info@watermelonexperiences.pt.','Delen met OpenAI toestaan','Niet nu','Stoppen met delen met OpenAI','Toestemming is vereist om Watermelon AI te gebruiken.']
}
for locale, values in translations.items():
    assert len(values) == len(keys)
    path = ROOT / f'Watermelon/{locale}.lproj/Localizable.strings'
    content = read(path)
    additions = []
    for key, value in zip(keys, values):
        quoted = json.dumps(key, ensure_ascii=False)
        if quoted + ' =' not in content and quoted + '=' not in content:
            additions.append(quoted + ' = ' + json.dumps(value, ensure_ascii=False) + ';')
    edits[path] = content + '\n// Explicit AI data-sharing consent\n' + '\n'.join(additions) + '\n'

# Write only after every source anchor has been checked.
for path, content in edits.items():
    path.write_text(content)
    print(path)
print('AI privacy change applied. No credentials, customer data or Apple declarations changed.')
