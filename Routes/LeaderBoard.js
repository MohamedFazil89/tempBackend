import express from "express";
import getLocationName from "../functions/getLocationName.js"
import { supabase } from "../SupabaseConfig/supabaseClient.js";
import axios from "axios";

const app = express()

app.use(express.json());

// ---------------Info-Section------------------

// Routes:
//      /area-leaderboard

// ---------------Info-Section------------------



app.post("/area-leaderboard", async (req, res) => {
  try {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ error: "lat/lon missing" });
    }

    // Step 1: Convert lat/lon to area name
    const areaName = await getLocationName(lat, lon);
    if (!areaName) {
      return res.status(500).json({ error: "Unable to resolve area name" });
    }

    // Step 2: Get all users in that area
    const { data: usersInArea, error: usersErr } = await supabase
      .from("users")
      .select("username")
      .eq("area_name", areaName);

    if (usersErr) {
      console.error("Error fetching users in area:", usersErr.message);
      return res.status(500).json({ error: "Failed to fetch area users" });
    }

    const usernames = usersInArea.map((user) => user.username);
    if (usernames.length === 0) {
      return res.json({ area: areaName, leaderboard: [] });
    }

    // Step 3: Fetch their scores from badges
    const { data: scores, error: badgeErr } = await supabase
      .from("badges")
      .select("username, scores")
      .in("username", usernames);

    if (badgeErr) {
      console.error("Error fetching badge scores:", badgeErr.message);
      return res.status(500).json({ error: "Failed to fetch scores" });
    }

    // Step 4: Sort by score
    const leaderboard = scores.sort((a, b) => b.scores - a.scores);

    return res.status(200).json({
      area: areaName,
      leaderboard,
    });
  } catch (err) {
    console.error("Unexpected error in /area-leaderboard:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default app;