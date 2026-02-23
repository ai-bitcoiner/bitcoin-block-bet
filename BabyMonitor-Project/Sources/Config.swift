import Foundation

struct Configuration: Codable {
    var prompts: [String] = [
        "play baby shark dance",
        "play wheels on the bus super simple songs",
        "play cocomelon nursery rhymes",
        "play disney lullabies",
        "play funny baby giggling videos"
    ]
    var cooldownSeconds: Double = 120.0
    var motionSensitivity: Float = 0.5
}

class ConfigManager {
    static let shared = ConfigManager()
    private let configURL: URL
    
    var config: Configuration
    
    private init() {
        self.config = Configuration()
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.configURL = home.appendingPathComponent(".openclaw/workspace/baby_monitor_config.json")
        load()
    }
    
    func load() {
        guard let data = try? Data(contentsOf: configURL),
              let loaded = try? JSONDecoder().decode(Configuration.self, from: data) else {
            save() // Create default if missing
            return
        }
        self.config = loaded
    }
    
    func save() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        if let data = try? encoder.encode(config) {
            try? data.write(to: configURL)
        }
    }
}
