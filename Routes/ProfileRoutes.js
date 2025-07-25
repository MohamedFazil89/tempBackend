import express, { json } from "express"
import { supabase } from "../SupabaseConfig/supabaseClient.js";
const app = express(json());




// ---------------Info-Section------------------
// Routes:
//     1. /return-profile
//     2. /spotintro
//     3. ViewCount function
//     4. /fullspot
//     5. /Get-Posts
//     6. /set-home
//     7. /delete-post



// ---------------Info-Section------------------


// // ----------------Profile-Return-------------------------

app.post("/return-profile", async (req, res) => {
  const { username } = req.body;

  console.log("🛠 Incoming username:", username);

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("postcount, profilepic") // 👈 SELECT profile_image too
      .ilike("username", cleanUsername)
      .single();

    console.log("🧩 Supabase user result:", user);
    console.log("🧩 Supabase error:", userErr);

    if (userErr || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { data: spots, error: spotErr } = await supabase
      .from("spots")
      .select("id, image, spotname, viewcount, likes_count")
      .ilike("username", cleanUsername);

    if (spotErr) {
      return res.status(500).json({ error: "Error fetching spots" });
    }

    const uploaded_spots = spots.map((spot) => ({
      id: spot.id,
      spotimage: spot.image,
      title: spot.spotname,
      viewscount: spot.viewcount,
      likescount: spot.likes_count,
    }));

    const { data: badges, error: badgeErr } = await supabase
      .from("badges")
      .select("scores")
      .ilike("username", cleanUsername)
      .single();

    if (badgeErr) {
      return res.status(500).json({ error: "Error fetching badge" });
    }

    res.json({
      username: cleanUsername,
      profile_image: user.profilepic || null, // 👈 Include it in the response
      postcount: user.postcount || 0,
      score: badges.scores || 0,
      uploaded_spots,
    });
  } catch (err) {
    console.error("❌ Profile fetch error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// -------------------Spot-intro-------------------------------------
app.get("/spotintro", async (req, res) => {
  const { username, lat, lon } = req.query;

  console.log("📥 Incoming request to /spotintro with query:", {
    username,
    lat,
    lon,
  });

  if (!username || !lat || !lon) {
    console.warn("⚠️ Missing query parameters");
    return res.status(400).json({
      error: "username, lat, and lon query parameters are required",
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    console.warn("⚠️ Invalid latitude or longitude format", { lat, lon });
    return res.status(400).json({
      error: "lat and lon must be valid numbers",
    });
  }

  console.log("🔍 Querying Supabase for spot with:");
  console.log(`   Username: ${username}`);
  console.log(
    `   Latitude range: [${latitude - 0.000001}, ${latitude + 0.000001}]`
  );
  console.log(
    `   Longitude range: [${longitude - 0.000001}, ${longitude + 0.000001}]`
  );

  try {
    const { data: spots, error } = await supabase
      .from("spots")
      .select("spotname, category, description, viewcount")
      .eq("username", username)
      .gte("latitude", latitude - 0.000001)
      .lte("latitude", latitude + 0.000001)
      .gte("longitude", longitude - 0.000001)
      .lte("longitude", longitude + 0.000001);

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }

    console.log(`✅ Supabase returned ${spots.length} result(s)`);

    if (!spots || spots.length === 0) {
      console.warn("⚠️ No spot found matching the location and username", {
        username,
        latitude,
        longitude,
      });
      return res.status(404).json({ error: "Spot not found" });
    }

    const spot = spots[0];

    console.log("📤 Sending spot data:", {
      username,
      latitude,
      longitude,
      category: spot.category,
      description: spot.description,
      viewcount: spot.viewcount,
      spotname: spot.spotname,
    });

    return res.status(200).json({
      username,
      latitude,
      longitude,
      category: spot.category,
      description: spot.description,
      viewcount: spot.viewcount,
      spotname: spot.spotname,
    });
  } catch (err) {
    console.error("❌ Internal Server Error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ------------------View-Count--Function--------------------
export async function ViewCount(lat, lon) {
  try {
    const range = 0.00001;
    console.log("🔍 ViewCount called with:", { lat, lon });

    const { data: allMatches, error: matchError } = await supabase
      .from("spots")
      .select("id, viewcount")
      .gte("latitude", lat - range)
      .lte("latitude", lat + range)
      .gte("longitude", lon - range)
      .lte("longitude", lon + range);

    if (matchError) {
      console.error("❌ Error fetching matching spots:", matchError.message);
      return;
    }

    console.log(
      `📊 Found ${allMatches?.length} matching spot(s) for viewcount`
    );

    if (!allMatches || allMatches.length === 0) {
      console.warn(
        "⚠️ No spot found for given lat/lon to increment view count"
      );
      return;
    }

    const spot = allMatches[0];
    const newViewCount = (spot.viewcount || 0) + 1;

    const { data: updatedSpot, error: updateErr } = await supabase
      .from("spots")
      .update({ viewcount: newViewCount })
      .eq("id", spot.id)
      .select("viewcount")
      .maybeSingle();

    if (updateErr) {
      console.error("❌ Failed to update viewcount:", updateErr.message);
      return;
    }

    console.log(
      `✅ Viewcount updated to ${updatedSpot.viewcount} for spot ID ${spot.id}`
    );
  } catch (error) {
    console.error("❌ ViewCount unexpected error:", error.message);
  }
}

// ----------------full spot-------------------------
app.get("/fullspot", async (req, res) => {
  const { username, lat, lon } = req.query;

  console.log("📥 Incoming /fullspot request:", { username, lat, lon });

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
    await ViewCount(latitude, longitude);

    const range = 0.00001;

    const { data: spot, error } = await supabase
      .from("spots")
      .select("id, spotname, image, audio_url, transcription")
      .eq("username", username)
      .gte("latitude", latitude - range)
      .lte("latitude", latitude + range)
      .gte("longitude", longitude - range)
      .lte("longitude", longitude + range)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase error while fetching spot:", error.message);
      return res.status(500).json({ error: "Database error" });
    }

    if (!spot) {
      console.warn("❌ No spot found matching given username and location", {
        username,
        latitude,
        longitude,
      });
      return res.status(404).json({ error: "Spot not found" });
    }

    console.log("✅ Spot found:", {
      id: spot.id,
      name: spot.spotname,
      audio: spot.audio_url,
    });

    return res.status(200).json({
      id: spot.id,
      username,
      latitude,
      longitude,
      image: spot.image,
      audio: spot.audio_url,
      spotname: spot.spotname,
      script: spot.transcription,
    });
  } catch (err) {
    console.error("❌ Internal Server Error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});



// -------------Get-User-Posts------------

app.get("/Get-Posts", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const { data: posts, error } = await supabase
      .from("spots")
      .select("*")
      .eq("username", username);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// --------------------Set-Home-Location + Area Name Update -----------------------
app.post("/set-home", async (req, res) => {
  try {
    const { username, lat, lon } = req.body;

    if (!username || typeof lat !== "number" || typeof lon !== "number") {
      return res.status(400).json({ error: "Invalid or missing input data." });
    }

    // Fetch user
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("latitude, longitude")
      .eq("username", username)
      .single();

    if (fetchError) {
      console.error("Error fetching user:", fetchError.message);
      return res
        .status(500)
        .json({ error: "Database error while checking user." });
    }

    if (!user) {
      return res.status(404).json({ error: `User '${username}' not found.` });
    }

    // Only update if lat/lon is null
    if (user.latitude === null || user.longitude === null) {
      const areaName = await getLocationName(lat, lon);

      if (!areaName) {
        return res
          .status(500)
          .json({ error: "Failed to resolve area name from coordinates." });
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          latitude: lat,
          longitude: lon,
          area_name: areaName,
        })
        .eq("username", username);

      if (updateError) {
        console.error("Error updating user location:", updateError.message);
        return res
          .status(500)
          .json({ error: "Failed to update user location." });
      }

      return res
        .status(200)
        .json({ message: "Location and area updated successfully." });
    } else {
      return res.status(200).json({ message: "Location already set." });
    }
  } catch (err) {
    console.error("Unexpected server error in /set-home:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
});

// --------------delete-spots------------------
app.delete("/delete-post", async (req, res) => {
  const id = req.query.id;

  console.log("🧾 Incoming DELETE request to /delete-post");
  console.log("🔍 ID received:", id);

  if (!id) {
    console.warn("⚠️ No ID provided in query params.");
    return res.status(400).json({ error: "ID is required" });
  }

  try {
    console.log("📡 Attempting to delete from 'spot' table where id =", id);

    const { data, error } = await supabase.from("spots").delete().eq("id", id);

    if (error) {
      console.error("❌ Supabase deletion error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log("✅ Spot deleted successfully. Deleted data:", data);
    res.json({ message: "Spot deleted successfully", data });
  } catch (err) {
    console.error("🚨 Server error during deletion:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

export default app;