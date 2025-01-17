import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { IncomingMessage } from "http";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Disable body parsing for FormData handling
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to parse FormData
async function parseFormData(req: IncomingMessage): Promise<{ files: formidable.Files }> {
  const form = formidable({
    multiples: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    filter: ({ mimetype }) => !!mimetype && ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"].includes(mimetype),
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, _fields, files) => {
      if (err) reject(err);
      resolve({ files });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse the uploaded file
    const { files } = await parseFormData(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file || !file.mimetype || !["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"].includes(file.mimetype)) {
      return res.status(400).json({ error: "Invalid or missing file" });
    }

    // Initialize Google AI File Manager with API key
    const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!);

    // Upload the audio file using its file path
    const uploadResult = await fileManager.uploadFile(file.filepath, {
      mimeType: file.mimetype,
      displayName: file.originalFilename || "audio_file",
    });

    // Poll for processing status
    let processedFile = await fileManager.getFile(uploadResult.file.name);
    while (processedFile.state === FileState.PROCESSING) {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 10 seconds
      processedFile = await fileManager.getFile(uploadResult.file.name);
    }

    if (processedFile.state === FileState.FAILED) {
      throw new Error("Audio processing failed");
    }

    // Initialize Google Generative AI client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Generate content based on the uploaded audio
    const result = await model.generateContent(
      [
        "transcribe the given audio file",
        {
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        },
      ]
    );

    return res.status(200).json({
      status: "success",
      generatedContent: result.response.text(),
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Processing failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
