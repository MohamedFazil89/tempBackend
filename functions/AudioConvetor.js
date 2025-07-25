import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import os from "os";
import fs from "fs";
import path from "path";





ffmpeg.setFfmpegPath(ffmpegPath.path);



const convertAACtoMP3 = (buffer) =>
  new Promise((resolve, reject) => {
    const tempDir = os.tmpdir(); // Cross-platform temp directory
    const tempInput = path.join(tempDir, `temp_${Date.now()}.aac`);
    const tempOutput = path.join(tempDir, `temp_${Date.now()}.mp3`);

    try {
      fs.writeFileSync(tempInput, buffer);
    } catch (err) {
      console.error("❌ Failed to write temp .aac file:", err);
      return reject(err);
    }

    ffmpeg(tempInput)
      .setFfmpegPath(ffmpegPath.path)
      .toFormat("mp3")
      .on("error", (err) => {
        console.error("❌ FFmpeg conversion failed:", err.message);
        reject(err);
      })
      .on("end", () => {
        try {
          const mp3Buffer = fs.readFileSync(tempOutput);
          fs.unlinkSync(tempInput);
          fs.unlinkSync(tempOutput);
          resolve(mp3Buffer);
        } catch (readErr) {
          console.error("❌ Failed to read or clean up files:", readErr);
          reject(readErr);
        }
      })
      .save(tempOutput);
  });

export default convertAACtoMP3;