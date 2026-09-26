import AppKit
import Foundation
import Vision

struct RecognizedLine {
    let text: String
    let x: CGFloat
    let y: CGFloat
}

func recognize(path: String) throws -> [RecognizedLine] {
    guard let image = NSImage(contentsOfFile: path),
          let data = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: data),
          let cgImage = bitmap.cgImage else {
        throw NSError(domain: "VINZLocalOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Immagine non leggibile"])
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["it-IT", "en-US"]
    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])

    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return RecognizedLine(text: candidate.string, x: observation.boundingBox.minX, y: observation.boundingBox.maxY)
    }.sorted { left, right in
        if abs(left.y - right.y) > 0.012 { return left.y > right.y }
        return left.x < right.x
    }
}

do {
    for (index, path) in CommandLine.arguments.dropFirst().enumerated() {
        print("--- IMMAGINE \(index + 1) ---")
        for line in try recognize(path: path) { print(line.text) }
    }
} catch {
    FileHandle.standardError.write(Data("OCR locale non riuscito: \(error.localizedDescription)\n".utf8))
    exit(1)
}
