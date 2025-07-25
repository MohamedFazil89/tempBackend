// index.js
import express from "express";
import { supabase } from "../SupabaseConfig/supabaseClient.js";
import axios from "axios";
import getBoundingBox from "../functions/getBoundingBox.js"
import distanceMeters from "../functions/distanceMeters.js";
const app = express();

app.use(express.json());



// ---------------Info-Section------------------

// Routes:
//      /translation
//      /returnsummary
//      /search-spots
//      /nearby

// ---------------Info-Section------------------


// -----------------------------------------------------

app.get("/translation", async (req, res) => {
  const { username, lat, lon, lang } = req.query;

  console.log("🔎 Incoming Query Params:", { username, lat, lon, lang });

  if (!username || !lat || !lon || !lang) {
    console.warn("⚠️ Missing required query parameters");
    return res.status(400).json({
      error: "username, lat, lon, and lang query parameters are required",
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  console.log(`📌 Parsed lat/lon: ${latitude}, ${longitude}`);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    console.error("❌ Invalid lat/lon values");
    return res.status(400).json({
      error: "lat and lon must be valid numbers",
    });
  }

  // 🌐 Map language name to language code
  const langMap = {
    english: "en",
    french: "fr",
    hindi: "hi",
    german: "de",
  };

  const langCode = langMap[lang.toLowerCase()];
  console.log(langCode);

  if (!langCode) {
    console.warn(`⚠️ Unsupported language requested: ${lang}`);
    return res.status(400).json({ error: `Unsupported language: ${lang}` });
  }

  console.log(`🌐 Mapped language '${lang}' to code '${langCode}'`);

  try {
    console.log("📡 Querying Supabase...");

    const { data: spot, error } = await supabase
      .from("spots")
      .select("translated_captions, username, latitude, longitude")
      .eq("username", username)
      // 🔥 Add small tolerance for floating-point comparison
      .gte("latitude", latitude - 0.00001)
      .lte("latitude", latitude + 0.00001)
      .gte("longitude", longitude - 0.00001)
      .lte("longitude", longitude + 0.00001)
      .maybeSingle(); // ✅ safer than .single()

    console.log("📦 Supabase Query Result:", spot);

    if (error) {
      console.error("❌ Supabase Query Error:", error.message);
      return res.status(500).json({ error: "Supabase query failed" });
    }

    if (!spot) {
      console.warn("⚠️ No spot found for given username/lat/lon");
      return res.status(404).json({ error: "Spot not found" });
    }

    const translation = spot.translated_captions?.[langCode];

    if (!translation) {
      console.warn(`⚠️ Translation for language '${langCode}' not found`);
      return res.status(404).json({
        error: `Translation for language '${langCode}' not found`,
      });
    }

    console.log("✅ Translation found:", translation);

    return res.status(200).json({
      username: spot.username,
      latitude: spot.latitude,
      longitude: spot.longitude,
      language: langCode,
      translation,
    });
  } catch (err) {
    console.error("❌ Internal Server Error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------

app.get("/returnsummary", async (req, res) => {
  const { username, lat, lon } = req.query;

  if (!username || !lat || !lon) {
    return res.status(400).json({
      error: "username, lat, and lon query parameters are required",
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({
      error: "lat and lon must be valid numbers",
    });
  }

  try {
    const { data: spots, error } = await supabase
      .from("spots")
      .select("spotname, description, summary")
      .eq("username", username)
      .gte("latitude", latitude - 0.000001)
      .lte("latitude", latitude + 0.000001)
      .gte("longitude", longitude - 0.000001)
      .lte("longitude", longitude + 0.000001);

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }

    if (!spots || spots.length === 0) {
      console.error("❌ No spot found for query:", {
        username,
        latitude,
        longitude,
      });
      return res.status(404).json({ error: "Spot not found" });
    }

    const spot = spots[0];

    return res.status(200).json({
      username,
      latitude,
      longitude,
      spotname: spot.spotname,
      description: spot.description,
      summary: spot.summary,
    });
  } catch (err) {
    console.error("❌ Internal Server Error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


// -------------------Search-Spots----------------------
const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY;
// Route: /search-spots
app.post("/search-spots", async (req, res) => {
  const { SearchQuery } = req.body;

  if (!SearchQuery) {
    return res.status(400).json({ error: "SearchQuery is required" });
  }

  try {
    // 1. Convert query to lat/lon
    const geoRes = await axios.get(
      "https://api.opencagedata.com/geocode/v1/json",
      {
        params: {
          q: SearchQuery,
          key: OPENCAGE_API_KEY,
        },
      }
    );

    const results = geoRes.data.results;
    if (!results || results.length === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    const { lat, lng } = results[0].geometry;

    // 2. Calculate bounding box
    const box = getBoundingBox(lat, lng, 2); // 2km radius

    // 3. Query Supabase spots table within bounding box
    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .lte("latitude", box.maxLat)
      .gte("latitude", box.minLat)
      .lte("longitude", box.maxLon)
      .gte("longitude", box.minLon);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      location: results[0].formatted,
      total_spots: data.length,
      spots: data,
    });
    console.log("Spots", data);
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --------------------Return Nearby Spots---------------

app.get("/nearby", async (req, res) => {
  const userLat = Number(req.query.lat); // ← fixed
  const userLng = Number(req.query.lng); // ← fixed
  const SelectedCategory = req.query.SearchQuery;
  // const { lat,lng, SearchCategry} = req.body;
  // const userLat = lat
  // const userLng = lng
  // const SelectedCategory = SearchCategry;

  if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
    return res
      .status(400)
      .json({ error: "lat & lng query params are required numbers" });
  }

  const { data: spots, error } = await supabase
    .from("spots")
    .select("spotname, latitude, longitude, category, username"); // 👈 include username

  if (error) return res.status(500).json({ error: error.message });

  const result = spots
    .map((s) => ({
      ...s,
      distance: distanceMeters(userLat, userLng, s.latitude, s.longitude),
    }))
    .filter((s) => s.distance <= 7000 && s.category === SelectedCategory)
    .sort((a, b) => a.distance - b.distance);
  // console.log(result);

  res.json(result);
});


// --------------------Return Nearby Spots---------------


export default app;
