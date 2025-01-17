import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { IncomingMessage } from "http";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { promises as fs } from "fs";
import ffmpeg from "fluent-ffmpeg";

// Disable body parsing for FormData handling
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to convert video/audio to MP3
async function convertToMp3(inputPath: string): Promise<{ filepath: string; mimetype: string }> {
  const outputPath = `${inputPath}.mp3`;

  return new Promise((resolve, reject) => {
    console.log(`Converting file: ${inputPath} to MP3 format...`);
    ffmpeg(inputPath)
      .toFormat("mp3")
      .on("end", () => {
        console.log(`Conversion complete: ${inputPath} -> ${outputPath}`);
        resolve({
          filepath: outputPath,
          mimetype: "audio/mp3",
        });
      })
      .on("error", (err) => {
        console.error(`Error during conversion of ${inputPath}:`, err);
        reject(err);
      })
      .save(outputPath);
  });
}

// Helper function to parse FormData
async function parseFormData(req: IncomingMessage): Promise<{ files: formidable.Files }> {
  const form = formidable({
    multiples: false,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    filter: ({ mimetype }) => {
      const supportedTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/ogg",
        "audio/webm",
        "video/webm", // Added support for video/webm
      ];

      if (!mimetype || !supportedTypes.includes(mimetype)) {
        console.warn(`Unsupported MIME type: ${mimetype}`);
        return false;
      }

      return true;
    },
    keepExtensions: true,
    uploadDir: "/tmp",
    filename: (_name, _ext, part) => `${Date.now()}-${part.originalFilename}`,
  });

  return new Promise((resolve, reject) => {
    console.log("Parsing incoming form data...");
    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error("Error parsing form data:", err);
        reject(err);
        return;
      }

      console.log("Parsed fields:", fields);
      console.log("Parsed files:", files);

      if (!files || !Object.keys(files).length) {
        reject(new Error("No file uploaded"));
        return;
      }

      resolve({ files });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let parsedFiles: formidable.Files | null = null;

  try {
    // Parse the uploaded file
    const { files } = await parseFormData(req);
    parsedFiles = files; // Save parsed files for cleanup
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file || !file.mimetype) {
      return res.status(400).json({ error: "Invalid or missing file" });
    }

    console.log(`Uploaded file details:`, {
      originalFilename: file.originalFilename,
      filepath: file.filepath,
      mimetype: file.mimetype,
    });

    // Convert the uploaded file to MP3 format if necessary
    let processedFile = { filepath: file.filepath, mimetype: file.mimetype };
    if (file.mimetype.startsWith("video/") || file.mimetype === "audio/webm") {
      processedFile = await convertToMp3(file.filepath);
    }

    console.log(`Processed file details:`, processedFile);

    // Initialize Google AI File Manager with API key
    const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!);

    // Upload the processed audio file
    const uploadResult = await fileManager.uploadFile(processedFile.filepath, {
      mimeType: processedFile.mimetype,
      displayName: file.originalFilename || "audio_file",
    });

    console.log(`File uploaded successfully to Google AI File Manager. File URI: ${uploadResult.file.uri}`);

    // Poll for processing status
    let processedFileStatus = await fileManager.getFile(uploadResult.file.name);
    while (processedFileStatus.state === FileState.PROCESSING) {
      console.log(`Waiting for processing... Current state: ${processedFileStatus.state}`);
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 10 seconds
      processedFileStatus = await fileManager.getFile(uploadResult.file.name);
    }

    if (processedFileStatus.state === FileState.FAILED) {
      throw new Error("Audio processing failed");
    }

    console.log(`Audio processing completed. Final state: ${processedFileStatus.state}`);

    // Initialize Google Generative AI client
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Generate content based on the uploaded audio
    const result = await model.generateContent([
      "transcribe the given audio file",
      {
        fileData: {
          fileUri: uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType,
        },
      },
    ]);

    console.log("Generated content:", result.response.text());

    return res.status(200).json({
      status: "success",
      timestamp: new Date().toISOString(),
      generatedContent: result.response.text(),
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Processing failed",
      details:
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error",
    });
  } finally {
    if (parsedFiles) {
      const file = Array.isArray(parsedFiles.file) ? parsedFiles.file[0] : parsedFiles.file;
      if (file) {
        try {
          console.log(`Cleaning up temporary files for ${file.filepath}`);
          await fs.unlink(file.filepath); // Delete original uploaded file
          await fs.unlink(file.filepath + ".mp3"); // Delete converted mp3 file if it exists
        } catch (error) {
          console.error("Error cleaning up files:", error);
        }
      }
    }
  }
}
