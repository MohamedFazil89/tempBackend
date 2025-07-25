import express from "express"
import { supabase } from "../SupabaseConfig/supabaseClient.js";
import multer from "multer";


const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// ---------------Info-Section------------------

// Routes:
//      /journey-status
//      /start-journey
//      /journey-upload
//      /return-journey-pins
//      /end-journey

// ---------------Info-Section------------------


// --1----Journey-status--------

app.post("/journey-status", async (req, res) => {
  const { username } = req.body;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("status")
      .eq("username", username)
      .single(); // we expect only one row

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const status = data?.status;

    // Assuming status is a boolean or can be interpreted as one
    return res.json({ journeyStatus: !!status });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


// ---2---Start--Journey---------
app.post("/start-journey", async (req, res) => {
  const { username, source, journeyname } = req.body;

  try {
    // 1. Insert journey data
    const { data: journeyData, error: journeyError } = await supabase
      .from("journey")
      .insert([
        {
          username: username,
          source: source,
          destination: null,
          journeyname: journeyname,
          spotpins: null, // ignore for now,
          status: true
        },
      ]);

    if (journeyError) {
      return res
        .status(400)
        .json({ success: false, message: journeyError.message });
    }

    // 2. Update user status to true
    const { data: userData, error: userError } = await supabase
      .from("users")
      .update({ status: true })
      .eq("username", username);

    if (userError) {
      return res
        .status(400)
        .json({ success: false, message: userError.message });
    }

    return res.json({ success: true, message: "Journey started successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----4--Journey-upload--------
app.post(
  "/journey-upload",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { username, title, latitude, description, longitude } = req.body;
      const audioFile = req.files?.audio?.[0];
      const imageFile = req.files?.image?.[0];

      if (!username || !audioFile || !imageFile) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields" });
      }

      // 1. Check user status
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("status")
        .eq("username", username)
        .single();

      if (userError || !user?.status) {
        return res
          .status(403)
          .json({ success: false, message: "Inactive or missing user" });
      }

      // 2. Get active journey
      const { data: journey, error: journeyFetchError } = await supabase
        .from("journey")
        .select("id, spotpins")
        .eq("username", username)
        .eq("status", true)
        .maybeSingle();

      if (journeyFetchError || !journey) {
        return res
          .status(404)
          .json({ success: false, message: "Active journey not found" });
      }

      const timestamp = Date.now();

      // 3. Upload audio to journeymap/audio/
      const audioPath = `audio/${timestamp}_${audioFile.originalname}`;
      await supabase.storage
        .from("journeymap")
        .upload(audioPath, audioFile.buffer, {
          contentType: audioFile.mimetype,
        });
      const { publicUrl: audio_url } = supabase.storage
        .from("journeymap")
        .getPublicUrl(audioPath).data;

      // 4. Upload image to journeymap/images/
      const imagePath = `images/${timestamp}_${imageFile.originalname}`;
      await supabase.storage
        .from("journeymap")
        .upload(imagePath, imageFile.buffer, {
          contentType: imageFile.mimetype,
        });
      const { publicUrl: image_url } = supabase.storage
        .from("journeymap")
        .getPublicUrl(imagePath).data;

      // 5. Create new spot pin
      const newSpotPin = {
        title: title || "Untitled Spot",
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        audio_url,
        description,
        image_url,
        uploaded_at: new Date().toISOString(),
      };

      // 6. Merge and update journey
      const updatedSpotpins = Array.isArray(journey.spotpins)
        ? [...journey.spotpins, newSpotPin]
        : [newSpotPin];

      const { error: updateError } = await supabase
        .from("journey")
        .update({ spotpins: updatedSpotpins })
        .eq("id", journey.id);

      if (updateError) {
        return res
          .status(500)
          .json({ success: false, message: updateError.message });
      }

      return res.json({
        success: true,
        message: "Spot pin added to journey",
        spotpin: newSpotPin,
      });
    } catch (err) {
      console.error("❌ Journey upload error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: err.message,
      });
    }
  }
);

// ---5---Journey-pins--------
app.post("/return-journey-pins", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: "Username is required" });
  }

  try {
    // 1. Check if user is active
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("status")
      .eq("username", username)
      .single();

    if (userError || !user || user.status !== true) {
      return res.status(400).json({ success: false, message: "User not active or not found" });
    }

    // 2. Fetch active journey for user
    const { data: journey, error: journeyError } = await supabase
      .from("journey")
      .select("spotpins, source, destination")
      .eq("username", username)
      .eq("status", true)
      .maybeSingle();

    if (journeyError || !journey) {
      return res.status(400).json({ success: false, message: "Active journey not found" });
    }

    console.log({
      success: true,
      spotpins: journey.spotpins,
      source: journey.source,
      destination: journey.destination,
    });

    // 3. Return the journey data
    return res.json({
      success: true,
      spotpins: journey.spotpins,
      source: journey.source,
      destination: journey.destination,
    });


  } catch (err) {
    console.error("Error fetching journey pins:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/end-journey", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: "Username required" });
  }

  try {
    // 1. Validate user is active
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("status")
      .eq("username", username)
      .single();

    if (userError || !user || user.status != true) {
      return res.status(403).json({ success: false, message: "User is not active or not found" });
    }

    // 2. Fetch active journey for the user
    const { data: journey, error: journeyError } = await supabase
      .from("journey")
      .select("id, spotpins")
      .eq("username", username)
      .eq("status", true)
      .maybeSingle();

    if (journeyError || !journey?.id) {
      return res.status(404).json({ success: false, message: "Active journey not found" });
    }

    // 3. Extract last spotpin as destination (optional)
    let destination = null;
    if (Array.isArray(journey.spotpins) && journey.spotpins.length > 0) {
      destination = journey.spotpins[journey.spotpins.length - 1];
    }

    // 4. End the journey and deactivate user
    const [{ error: userUpdateError }, { error: journeyUpdateError }] = await Promise.all([
      supabase.from("users").update({ status: false }).eq("username", username),
      supabase
        .from("journey")
        .update({ status: false, destination })
        .eq("id", journey.id),
    ]);

    if (userUpdateError || journeyUpdateError) {
      console.error("❌ Update errors:", userUpdateError, journeyUpdateError);
      return res.status(500).json({ success: false, message: "Failed to end journey" });
    }

    console.log({
      success: true,
      message: "Journey ended and destination saved",
      destination,
    });

    return res.json({
      success: true,
      message: "Journey ended and destination saved",
      destination,
    });
  } catch (err) {
    console.error("❌ Server error on end-journey:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default app;
