import SwiftUI
import EventKit
import EventKitUI

struct TripsView: View {
    @EnvironmentObject private var store: TravelStore
    var body: some View {
        List {
            if store.saved.receipts.isEmpty && store.saved.links.isEmpty {
                ContentUnavailableView("Your trips start here", systemImage: "suitcase.rolling",
                                       description: Text("Your requests and received proposals will be saved on this iPhone."))
            }
            if !store.saved.receipts.isEmpty {
                Section("Reservation and proposal requests") {
                    ForEach(store.saved.receipts) { receipt in
                        NavigationLink { ReceiptView(receipt: receipt) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(receipt.items.first?.title ?? receipt.reference).font(.headline)
                                Text(receipt.reference).font(.caption)
                                Label("Request pending", systemImage: "clock").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if !store.saved.links.isEmpty {
                Section("Received programmes") {
                    ForEach(store.saved.links) { link in
                        NavigationLink { NativeProposalView(link: link) } label: {
                            Label(link.reference, systemImage: "doc.text")
                        }
                    }
                }
            }
            Section {
                Text("Saved details are available offline. Request status is not updated automatically; contact Watermelon for reservation confirmation.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }.navigationTitle("My trips")
    }
}

struct ReceiptView: View {
    let receipt: RequestReceipt
    private var summary: String {
        (["WATERMELON EXPERIENCES", receipt.reference, String(localized: "Request pending — awaiting confirmation")]
         + receipt.items.map { "\($0.title) · \(PortugalDate.display($0.date)) · \($0.guests) guests" }).joined(separator: "\n")
    }
    private var contactURL: URL {
        var components = URLComponents(string: "https://wa.me/351918404101")!
        components.queryItems = [URLQueryItem(name: "text", value: "Hello Watermelon, I would like to check request " + receipt.reference)]
        return components.url!
    }
    var body: some View {
        List {
            Section {
                Label("Request received", systemImage: "checkmark.circle.fill").font(.title2.bold()).foregroundStyle(Brand.green)
                Text(receipt.reference).font(.headline).textSelection(.enabled).accessibilityIdentifier("requestReference")
                Text("Awaiting Watermelon confirmation").font(.headline)
                Text("Your request has been saved in the CRM. Watermelon will contact you to confirm availability and final arrangements.")
            }
            ForEach(receipt.items) { item in Section { TripItemView(item: item) } }
            Section {
                ShareLink(item: summary) { Label("Share request summary", systemImage: "square.and.arrow.up") }
                Link(destination: contactURL) { Label("Contact Watermelon", systemImage: "message") }
            }
        }.navigationTitle("Your request").navigationBarTitleDisplayMode(.inline)
    }
}

struct TripItemView: View {
    let item: TripItem
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(item.title).font(.headline)
            if !item.optionName.isEmpty { Text(item.optionName).font(.subheadline) }
            Label(PortugalDate.display(item.date), systemImage: "calendar")
            if !item.time.isEmpty { Label(item.time, systemImage: "clock") }
            Label("\(item.guests) guests", systemImage: "person.2")
            if let total = item.total { Text(money(total, item.currency)).font(.headline).foregroundStyle(Brand.green) }
            if !item.location.isEmpty {
                Text(item.location).font(.subheadline)
                DirectionsButton(place: item.location)
            }
            if !item.date.isEmpty { CalendarButton(item: item) }
        }.padding(.vertical, 8)
    }
}

struct DirectionsButton: View {
    let place: String
    private var url: URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "q", value: place)]
        return components?.url
    }
    var body: some View {
        if let url { Link(destination: url) { Label("Open in Maps", systemImage: "map") } }
    }
}

struct CalendarButton: View {
    let item: TripItem
    @State private var store = EKEventStore()
    @State private var event: EKEvent?
    @State private var present = false
    @State private var message = ""
    @State private var asking = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Task { await prepare() }
            } label: { Label("Add planned date to Calendar", systemImage: "calendar.badge.plus") }.disabled(asking)
            if !message.isEmpty { Text(message).font(.caption).foregroundStyle(.secondary) }
        }
        .sheet(isPresented: $present) {
            if let event {
                EventEditor(store: store, event: event) { saved in
                    present = false
                    if saved { message = String(localized: "Saved in Calendar.") }
                }
            }
        }
    }
    private func prepare() async {
        guard !asking else { return }
        asking = true
        defer { asking = false }
        do {
            guard try await store.requestWriteOnlyAccessToEvents() else {
                message = String(localized: "Calendar access was not granted. You can enable it in iPhone Settings."); return
            }
            guard let start = PortugalDate.start(day: item.date, time: "00:00") else { return }
            let draft = EKEvent(eventStore: store)
            draft.title = String(localized: "Planned — ") + item.title
            draft.location = item.location
            draft.isAllDay = true
            draft.startDate = start
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = PortugalDate.timeZone
            draft.endDate = calendar.date(byAdding: .day, value: 1, to: start)
            draft.timeZone = PortugalDate.timeZone
            draft.notes = "Watermelon Experiences\n" + String(localized: "Provisional date. Confirm time and duration with Watermelon.") + "\n" + item.time
            event = draft
            message = ""
            present = true
        } catch { message = error.localizedDescription }
    }
}

struct EventEditor: UIViewControllerRepresentable {
    let store: EKEventStore
    let event: EKEvent
    let completion: (Bool) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let controller = EKEventEditViewController()
        controller.eventStore = store
        controller.event = event
        controller.editViewDelegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) { }
    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let completion: (Bool) -> Void
        init(completion: @escaping (Bool) -> Void) { self.completion = completion }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            completion(action == .saved)
        }
    }
}

struct MoreView: View {
    @EnvironmentObject private var store: TravelStore
    @State private var deleting = false
    var body: some View {
        List {
            Section {
                Image("BrandLogo").resizable().scaledToFit().frame(maxWidth: .infinity).frame(height: 150).accessibilityLabel("Watermelon Experiences")
                Text("Explore Portugal with Watermelon Experiences. Build your programme and keep your travel details close.")
            }
            Section("Contact") {
                Link("WhatsApp Watermelon", destination: URL(string: "https://wa.me/351918404101")!)
                Link("Website", destination: URL(string: "https://www.watermelonexperiences.pt")!)
            }
            Section("Privacy") {
                Link("Privacy policy", destination: URL(string: "https://www.watermelonexperiences.pt/privacy")!)
                Text("Favorites, proposals and request summaries are saved on this device. Received proposal links contain private access tokens; share them only with people you trust.")
                    .font(.footnote).foregroundStyle(.secondary)
                Button("Remove saved data", role: .destructive) { deleting = true }
            }
            Section {
                LabeledContent("Version", value: (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"))
            }
        }
        .navigationTitle("Watermelon Experiences")
        .confirmationDialog("Remove all saved data on this iPhone?", isPresented: $deleting, titleVisibility: .visible) {
            Button("Remove saved data", role: .destructive) { store.clear() }
            Button("Cancel", role: .cancel) { }
        } message: { Text("This removes local favorites and travel details. Requests already sent to Watermelon remain with Watermelon.") }
    }
}
