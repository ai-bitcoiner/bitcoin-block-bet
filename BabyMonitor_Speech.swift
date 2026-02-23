// Add Speech Recognition to BabyMonitor.swift
import Cocoa
import AVFoundation
import Speech
import Vision
import Combine

// MARK: - Audio Listener (New)
class AudioListener: NSObject, SFSpeechRecognizerDelegate {
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    
    @Published var lastTranscript = ""
    
    override init() {
        super.init()
        setupAudio()
    }
    
    func setupAudio() {
        SFSpeechRecognizer.requestAuthorization { authStatus in
            switch authStatus {
            case .authorized:
                print("Speech recognition authorized")
                try? self.startRecording()
            default:
                print("Speech recognition not authorized")
            }
        }
    }
    
    func startRecording() throws {
        if recognitionTask != nil {
            recognitionTask?.cancel()
            recognitionTask = nil
        }
        
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        let inputNode = audioEngine.inputNode
        
        guard let recognitionRequest = recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true
        
        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { result, error in
            if let result = result {
                let text = result.bestTranscription.formattedString.lowercased()
                self.processSpeech(text)
            }
            if error != nil || (result?.isFinal ?? false) {
                self.audioEngine.stop()
                inputNode.removeTap(onBus: 0)
                self.recognitionRequest = nil
                self.recognitionTask = nil
                try? self.startRecording() // Restart immediately
            }
        }
        
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { (buffer, when) in
            self.recognitionRequest?.append(buffer)
        }
        
        audioEngine.prepare()
        try audioEngine.start()
        print("Audio Listener Started")
    }
    
    func processSpeech(_ text: String) {
        // Simple keyword spotting for baby requests
        var prompt: String?
        
        if text.contains("bus") || text.contains("wheels") {
            prompt = "play wheels on the bus super simple songs"
        } else if text.contains("shark") || text.contains("baby shark") {
            prompt = "play baby shark dance"
        } else if text.contains("cocomelon") || text.contains("coco") {
            prompt = "play cocomelon nursery rhymes"
        } else if text.contains("disney") || text.contains("mickey") {
            prompt = "play disney lullabies"
        } else if text.contains("giggly") || text.contains("funny") {
            prompt = "play funny baby giggling videos"
        }
        
        if let prompt = prompt {
            self.lastTranscript = "Heard: \(text) -> Playing: \(prompt)"
            print("SPEECH_TRIGGER: \(prompt)")
            
            // Log to file for agent
            let logPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".openclaw/workspace/baby_monitor.log")
            let entry = "\(Date()): SPEECH -> REQUEST: \(prompt)\n"
            if let data = entry.data(using: .utf8) {
                if FileManager.default.fileExists(atPath: logPath.path) {
                    if let fileHandle = try? FileHandle(forWritingTo: logPath) {
                        fileHandle.seekToEndOfFile()
                        fileHandle.write(data)
                        fileHandle.closeFile()
                    }
                } else {
                    try? data.write(to: logPath)
                }
            }
        }
    }
}

// ... (Rest of existing MotionDetector code remains same, just hook up AudioListener too) ...
// For brevity, I will rewrite the full file with AudioListener integrated.
