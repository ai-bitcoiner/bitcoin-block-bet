// BabyMonitor-Project/Sources/main.swift - Main Application
import Cocoa
import AVFoundation
import Speech
import Vision
import Combine

// Helper function for logging
func log(_ msg: String) {
    let logPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".openclaw/workspace/baby_monitor_debug.log")
    let entry = "\(Date()): \(msg)\n"
    if let data = entry.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logPath.path) {
            if let handle = try? FileHandle(forWritingTo: logPath) {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            }
        } else {
            try? data.write(to: logPath)
        }
    }
    print(msg)
}

// MARK: - Motion Detector
@available(macOS 11.0, *)
class MotionDetector: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    @Published var statusText = "Initializing..."
    @Published var lastDetectionTime: Date?
    private let session = AVCaptureSession()
    private let videoOutput = AVCaptureVideoDataOutput()
    private var lastFrame: CVPixelBuffer?
    private var frameCounter = 0
    private let frameSkip = 10 
    
    override init() {
        super.init()
        log("MotionDetector init")
        setupCamera()
        startAnalysisTimer()
    }
    
    func setupCamera() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            log("Camera authorized")
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted {
                    log("Camera access granted")
                    self.configureSession()
                } else {
                    log("Camera access denied")
                    DispatchQueue.main.async { self.statusText = "Error: Camera access denied." }
                }
            }
        case .denied, .restricted:
            log("Camera access previously denied/restricted")
            DispatchQueue.main.async { self.statusText = "Error: Camera access denied." }
        @unknown default:
            log("Camera unknown status")
        }
    }
    
    func configureSession() {
        session.beginConfiguration()
        guard let device = AVCaptureDevice.default(for: .video) else {
            log("No camera device found")
            session.commitConfiguration()
            return
        }
        
        do {
            let input = try AVCaptureDeviceInput(device: device)
            if session.canAddInput(input) { session.addInput(input) }
            
            videoOutput.setSampleBufferDelegate(self, queue: DispatchQueue(label: "videoQueue"))
            if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
            
            session.commitConfiguration()
            
            DispatchQueue.global().async {
                self.session.startRunning()
                log("Camera session started")
            }
            
            DispatchQueue.main.async { self.statusText = "Camera active. Watching & Listening..." }
        } catch {
            log("Camera setup failed: \(error)")
        }
    }
    
    func startAnalysisTimer() {
        Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            let now = Date()
            if let last = self.lastDetectionTime, now.timeIntervalSince(last) < 5 {
                // Keep status
            } else {
                self.statusText = "Monitoring... No significant movement."
            }
        }
    }
    
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        frameCounter += 1
        if frameCounter % frameSkip != 0 { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        
        let request = VNDetectHumanBodyPoseRequest { request, error in
            if let error = error {
                log("Vision error: \(error)")
                return
            }
            guard let observations = request.results as? [VNHumanBodyPoseObservation], !observations.isEmpty else { return }
            
            DispatchQueue.main.async {
                self.lastDetectionTime = Date()
                self.statusText = "MOVEMENT DETECTED! Analyzing pose..."
                self.triggerAction()
            }
        }
        try? VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:]).perform([request])
    }
    
    func triggerAction() {
        // Use ConfigManager to get prompts
        ConfigManager.shared.load() // Reload to catch manual edits
        let prompts = ConfigManager.shared.config.prompts
        let prompt = prompts.randomElement() ?? "play music"
        
        let logPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".openclaw/workspace/baby_monitor.log")
        let entry = "\(Date()): MOVEMENT -> REQUEST: \(prompt)\n"
        
        if let data = entry.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: logPath.path) {
                if let fileHandle = try? FileHandle(forWritingTo: logPath) {
                    fileHandle.seekToEndOfFile()
                    fileHandle.write(data)
                    fileHandle.closeFile()
                }
            } else {
                try? data.write(to: logPath, options: .atomic)
            }
        }
    }
}

// MARK: - Audio Listener
class AudioListener: NSObject, SFSpeechRecognizerDelegate, ObservableObject {
    @Published var lastTranscript = ""
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    
    override init() {
        super.init()
        log("AudioListener init")
        requestPermissions()
    }
    
    func requestPermissions() {
        SFSpeechRecognizer.requestAuthorization { authStatus in
            switch authStatus {
            case .authorized:
                log("Speech authorized")
                switch AVCaptureDevice.authorizationStatus(for: .audio) {
                case .authorized:
                    log("Mic authorized")
                    try? self.startRecording()
                case .notDetermined:
                    AVCaptureDevice.requestAccess(for: .audio) { granted in
                        if granted {
                            log("Mic access granted")
                            try? self.startRecording()
                        } else {
                            log("Mic access denied")
                        }
                    }
                default:
                    log("Mic permission denied/restricted")
                }
            case .denied: log("Speech denied")
            case .restricted: log("Speech restricted")
            case .notDetermined: log("Speech not determined")
            @unknown default: log("Speech unknown")
            }
        }
    }
    
    func startRecording() throws {
        if recognitionTask != nil {
            recognitionTask?.cancel()
            recognitionTask = nil
        }
        
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        let inputNode = audioEngine.inputNode
        
        guard let recognitionRequest = recognitionRequest else {
            log("Unable to create SFSpeechAudioBufferRecognitionRequest")
            return
        }
        recognitionRequest.shouldReportPartialResults = true
        
        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { result, error in
            if let result = result {
                let text = result.bestTranscription.formattedString.lowercased()
                self.processSpeech(text)
            }
            if let error = error {
                log("Speech recognition error/end: \(error)")
                self.audioEngine.stop()
                inputNode.removeTap(onBus: 0)
                self.recognitionRequest = nil
                self.recognitionTask = nil
                
                DispatchQueue.global().asyncAfter(deadline: .now() + 1.0) {
                    try? self.startRecording()
                }
            }
        }
        
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { (buffer, when) in
            self.recognitionRequest?.append(buffer)
        }
        
        audioEngine.prepare()
        try audioEngine.start()
        log("AudioEngine started")
    }
    
    func processSpeech(_ text: String) {
        var prompt: String?
        
        if text.contains("bus") || text.contains("wheels") {
            prompt = "play wheels on the bus super simple songs"
        } else if text.contains("shark") || text.contains("baby shark") {
            prompt = "play baby shark dance"
        } else if text.contains("coco") || text.contains("melon") {
            prompt = "play cocomelon nursery rhymes"
        } else if text.contains("disney") || text.contains("mickey") {
            prompt = "play disney lullabies"
        } else if text.contains("giggly") || text.contains("funny") {
            prompt = "play funny baby giggling videos"
        }
        
        if let p = prompt {
            DispatchQueue.main.async { self.lastTranscript = "Heard: '\(text)' -> \(p)" }
            log("SPEECH MATCH: \(p)")
            
            let logPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".openclaw/workspace/baby_monitor.log")
            let entry = "\(Date()): SPEECH -> REQUEST: \(p)\n"
            
            if let data = entry.data(using: .utf8) {
                if FileManager.default.fileExists(atPath: logPath.path) {
                    if let fileHandle = try? FileHandle(forWritingTo: logPath) {
                        fileHandle.seekToEndOfFile()
                        fileHandle.write(data)
                        fileHandle.closeFile()
                    }
                } else {
                    try? data.write(to: logPath, options: .atomic)
                }
            }
        }
    }
}

// MARK: - App Delegate & UI
@available(macOS 11.0, *)
class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var detector: MotionDetector!
    var audioListener: AudioListener!
    var statusLabel: NSTextField!
    var speechLabel: NSTextField!
    var cancellables = Set<AnyCancellable>()

    func applicationDidFinishLaunching(_ notification: Notification) {
        log("App launched")
        detector = MotionDetector()
        audioListener = AudioListener()
        
        // Window Setup
        let windowSize = NSSize(width: 500, height: 300)
        let screenSize = NSScreen.main?.frame.size ?? .zero
        let rect = NSRect(x: (screenSize.width - windowSize.width) / 2,
                          y: (screenSize.height - windowSize.height) / 2,
                          width: windowSize.width,
                          height: windowSize.height)
                          
        window = NSWindow(contentRect: rect,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered,
                          defer: false)
        window.title = "Baby Monitor (Watch & Listen)"
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        
        let contentView = NSView(frame: window.contentView!.bounds)
        window.contentView = contentView

        let titleLabel = NSTextField(labelWithString: "👶 Baby Monitor Active")
        titleLabel.font = NSFont.systemFont(ofSize: 24, weight: .bold)
        titleLabel.isEditable = false
        titleLabel.isBezeled = false
        titleLabel.drawsBackground = false
        titleLabel.frame = NSRect(x: 20, y: 220, width: 450, height: 30)
        contentView.addSubview(titleLabel)
        
        statusLabel = NSTextField(labelWithString: "Initializing Camera...")
        statusLabel.font = NSFont.systemFont(ofSize: 14)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.isEditable = false
        statusLabel.isBezeled = false
        statusLabel.drawsBackground = false
        statusLabel.frame = NSRect(x: 20, y: 180, width: 450, height: 20)
        contentView.addSubview(statusLabel)
        
        speechLabel = NSTextField(labelWithString: "Listening for requests...")
        speechLabel.font = NSFont.systemFont(ofSize: 14)
        speechLabel.textColor = .controlAccentColor
        speechLabel.isEditable = false
        speechLabel.isBezeled = false
        speechLabel.drawsBackground = false
        speechLabel.frame = NSRect(x: 20, y: 140, width: 450, height: 20)
        contentView.addSubview(speechLabel)
        
        // Bind UI
        detector.$statusText
            .receive(on: RunLoop.main)
            .sink { [weak self] text in self?.statusLabel.stringValue = text }
            .store(in: &cancellables)
            
        audioListener.$lastTranscript
            .receive(on: RunLoop.main)
            .sink { [weak self] text in self?.speechLabel.stringValue = text }
            .store(in: &cancellables)
    }
    
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return true }
}

@main
@available(macOS 11.0, *)
struct App {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
}
