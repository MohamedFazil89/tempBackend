// Auth.js
import express from "express";
import { supabase } from "../SupabaseConfig/supabaseClient.js";
import dotenv, { decrypt } from "dotenv";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { Credentials, Translator } from "@translated/lara";
import updateUserStreak from "../functions/updateUserStreak.js"

import convertAACtoMP3 from "../functions/AudioConvetor.js";



const app = express();
app.use(express.json());

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });


const LARA_ACCESS_KEY_ID = process.env.LARA_ACCESS_KEY_ID;
const LARA_ACCESS_KEY_SECRET = process.env.LARA_ACCESS_KEY_SECRET;
const credentials = new Credentials(LARA_ACCESS_KEY_ID, LARA_ACCESS_KEY_SECRET);
const lara = new Translator(credentials);
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;


// ✅ Helper function using SDK
const translateText = async (text, targetLang) => {
  try {
    const res = await lara.translate(text, "en-US", targetLang);
    return res.translation;
  } catch (err) {
    console.error(
      `❌ Lara Translation SDK error for ${targetLang}:`,
      err.message
    );
    throw new Error(`Translation to ${targetLang} failed.`);
  }
};

// ------------------badges-function-----------------
export async function updateBadgesForUser(username, supabase) {
  // 1️⃣ try to fetch the row
  const { data: row, error: selErr } = await supabase
    .from("badges")
    .select("scores") // only need the counter
    .eq("username", username)
    .maybeSingle(); // returns null if not found

  if (selErr) throw selErr;

  if (row) {
    // 2a️⃣ already exists → increment
    const { data, error } = await supabase
      .from("badges")
      .update({ scores: row.scores + 5 })
      .eq("username", username)
      .select("scores"); // get new value back

    if (error) throw error;
    return data[0].scores;
  } else {
    // 2b️⃣ no record yet → insert
    const { data, error } = await supabase
      .from("badges")
      .insert({ username, scores: 5 })
      .select("scores")
      .single();

    if (error) throw error;
    return data.scores;
  }
}
export async function updatePostCountForUser(username, supabase) {
  // 1️⃣ Count how many spots this user has posted
  const { count, error: countErr } = await supabase
    .from("spots")
    .select("*", { count: "exact", head: true }) // just count, don't fetch rows
    .eq("username", username);

  if (countErr) throw countErr;

  // 2️⃣ Update the user's postCount
  const { data, error: updateErr } = await supabase
    .from("users")
    .update({ postcount: count })
    .eq("username", username)
    .select("postcount")
    .single();

  if (updateErr) throw updateErr;

  return data.postCount;
}



// ------------------end-badge-function--------------

app.post(
  "/spots",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),

  async (req, res) => {
    try {
      if (!req.files?.audio || !req.files?.image) {
        return res.status(400).json({ error: "Audio and image are required." });
      }

      const audioFile = req.files.audio[0];
      const imageFile = req.files.image[0];

      const audioPath = `audio/${Date.now()}_${audioFile.originalname}`;
      const imagePath = `images/${Date.now()}_${imageFile.originalname}`;

      await supabase.storage
        .from("audiofiles")
        .upload(audioPath, audioFile.buffer, {
          contentType: audioFile.mimetype,
        });

      await supabase.storage
        .from("spotimages")
        .upload(imagePath, imageFile.buffer, {
          contentType: imageFile.mimetype,
        });

      const { publicUrl: audio_url } = supabase.storage
        .from("audiofiles")
        .getPublicUrl(audioPath).data;
      const { publicUrl: image } = supabase.storage
        .from("spotimages")
        .getPublicUrl(imagePath).data;

      const { username, spotname, latitude, longitude } = req.body;
      const response = await updateUserStreak(username, supabase);

      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      const { LastUpdateData, LastUpdateErr } = await supabase
        .from("users")
        .update({ latest_update: new Date().toISOString() })  // ← update with proper value
        .eq("username", "johndoe")  // ← filter by username
        .single();


      if (isNaN(lat) || isNaN(lng)) {
        return res
          .status(400)
          .json({ error: "Latitude and longitude must be numbers" });
      }

      // // Transcribe
      const convertedBuffer = await convertAACtoMP3(audioFile.buffer);

      const whisperForm = new FormData();
      whisperForm.append("audio", convertedBuffer, {
        filename: "audio.mp3",
        contentType: "audio/mpeg",
      });

      const whisperRes = await axios.post(
        "http://127.0.0.1:5002/transcribe",
        whisperForm,
        { headers: whisperForm.getHeaders() }
      );

      const transcription = whisperRes.data.text?.trim() || "";
      console.log("📝 Transcription:", transcription);

      const translatedCaptions = {
        fr: await translateText(transcription, "fr-FR"),
        de: await translateText(transcription, "de-DE"),
        hi: await translateText(transcription, "hi-IN"),
      };

      const summary =
        "Quick summary: " +
        transcription.split(" ").slice(0, 6).join(" ") +
        "...";

      const insertPayload = {
        username,
        spotname: spotname?.trim() || "Unnamed Spot",
        latitude: lat,
        longitude: lng,
        original_language: "en",
        audio_url,
        image,
        viewcount: 0,
        category: "Food",
        description: "More",
        created_at: new Date().toISOString(),
        caption: transcription,
        transcription: transcription,
        translated_captions: translatedCaptions,
        summary,
        likes_count: 0,
      };

      const { data, error } = await supabase
        .from("spots")
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        return res.status(400).json({
          error: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        });
      }

      // 🏅 Badge + post count update before sending response
      const newCount = await updateBadgesForUser(username, supabase);
      const postCount = await updatePostCountForUser(username, supabase);

      // ✅ Send single response
      res.status(201).json({
        spot: data,
        badges: newCount,
        postCount,
        response
      });
    } catch (err) {
      console.error("❌ Spot Upload Error:", err);
      res
        .status(500)
        .json({ error: err.message, details: err.response?.data || err.stack });
    }
  }
);


app.post("/audiotitle", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Audio file is required." });
    }

    console.log("🎧 Received audio file:", req.file.originalname);

    // 1️⃣ Upload to AssemblyAI
    console.log("⬆️ Uploading to AssemblyAI...");
    const uploadRes = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      req.file.buffer,
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          "content-type": "application/octet-stream",
        },
      }
    );

    const audioUrl = uploadRes.data.upload_url;
    console.log("✅ Uploaded. Audio URL:", audioUrl);

    // 2️⃣ Start transcription with auto_chapters
    console.log("📝 Starting transcription...");
    const transcriptRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      {
        audio_url: audioUrl,
        auto_chapters: true,
      },
      {
        headers: {
          authorization: process.env.ASSEMBLYAI_API_KEY,
          "content-type": "application/json",
        },
      }
    );

    const transcriptId = transcriptRes.data.id;
    console.log("🚀 Transcription job started. ID:", transcriptId);

    // 3️⃣ Poll for completion
    let transcript;
    while (true) {
      const pollRes = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
        }
      );

      if (pollRes.data.status === "completed") {
        transcript = pollRes.data;
        console.log("✅ Transcription completed.");
        break;
      } else if (pollRes.data.status === "error") {
        console.error("❌ Transcription failed:", pollRes.data.error);
        return res
          .status(500)
          .json({ error: "Transcription failed", details: pollRes.data.error });
      }

      console.log("⏳ Waiting for transcription to complete...");
      await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3s
    }

    // 4️⃣ Extract title and build 2-line description
    const title = transcript.chapters?.[0]?.headline || "No title generated";

    let description =
      transcript.chapters?.[0]?.summary || "No short description available";

    // ✂️ Trim to only first 2 sentences
    const sentences = description.split(".").filter(Boolean);
    description = sentences.slice(0, 2).join(". ").trim();
    if (description && !description.endsWith(".")) {
      description += ".";
    }

    res.json({
      title,
      description,
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: err.message });
  }
});


export default app;