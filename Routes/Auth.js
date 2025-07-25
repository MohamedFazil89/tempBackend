// Auth.js
import express from "express";
import { supabase } from "../SupabaseConfig/supabaseClient.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import { execSync } from "child_process";
import cors from "cors";

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });


// ---------------Info-Section------------------

// Routes:
//      /SignUp
//      /login

// ---------------Info-Section------------------






// ----------------SignUp--Route--------------------
app.post(
  "/signup",
  upload.none(),
  async (req, res) => {
    const { username, password } = req.body;

    console.log("📥 Received:", req.body);

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username & password are required" });
    }

    try {
      // ✅ Prepare data
      const preferlng = "EN";
      const hash = await bcrypt.hash(password, 12);

      // ✅ Generate emoji via Python
      const prompt = "emoji cat boy";
      const emojiPath = execSync(`python genmoji.py "${prompt}"`)
        .toString()
        .trim();
      console.log("✅ Generated emoji at:", emojiPath);

      // ✅ Upload to Supabase Storage
      const emojiFile = fs.readFileSync(emojiPath);
      const imagePath = `profilepics/${Date.now()}_${username}.png`;

      const { error: uploadError } = await supabase.storage
        .from("profilepics")
        .upload(imagePath, emojiFile, { contentType: "image/png" });

      if (uploadError) throw uploadError;

      // ✅ Get public URL
      const { publicUrl: profilepic } = supabase.storage
        .from("profilepics")
        .getPublicUrl(imagePath).data;

      console.log("✅ Uploaded to Supabase:", profilepic);

      // ✅ Clean up local file
      await fs.promises.unlink(emojiPath);

      // ✅ Insert into DB
      const { data, error: dbError } = await supabase
        .from("users")
        .insert([{ username, password: hash, preferlng }])
        .select();

      if (dbError) {
        console.error("❌ DB Insert error:", dbError);
        return res.status(400).json({ error: dbError.message });
      }

      console.log("🚀 Insert result:", data);

      return res.status(200).json({
        message: "Signup successful",
        user: data[0],
      });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
);


// ----------------Login--Route--------------------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (error || !user) {
    console.log(error.message)
    return res.status(400).json({ error: "Invalid username or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});


export default app;