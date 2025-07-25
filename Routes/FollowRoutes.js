import express from "express";
import { supabase } from "../SupabaseConfig/supabaseClient.js";
const app = express()

app.use(express.json());


// ---------------Info-Section------------------

// Routes:
//      /follow
//      /unfollow
//      /getfollows-info

// ---------------Info-Section------------------



// -------------------- FOLLOW ---------------------------
app.post("/follow", async (req, res) => {
  const { follower, following } = req.body;

  if (!follower || !following || follower === following) {
    return res.status(400).json({ error: "Invalid request." });
  }

  try {
    // Fetch both users
    const { data: targetUser } = await supabase
      .from("users")
      .select("followers")
      .eq("username", following)
      .single();
    const { data: sourceUser } = await supabase
      .from("users")
      .select("following")
      .eq("username", follower)
      .single();
    if (!targetUser || !sourceUser) {
      return res.status(404).json({ error: "User(s) not found." });
    }
    // Update followers
    const newFollowers = [...new Set([...(targetUser.followers || []), follower])];
    await supabase
      .from("users")
      .update({
        followers: newFollowers,
        followers_count: newFollowers.length,
      })
      .eq("username", following);

    // Update following
    const newFollowing = [...new Set([...(sourceUser.following || []), following])];
    await supabase
      .from("users")
      .update({
        following: newFollowing,
        following_count: newFollowing.length,
      })
      .eq("username", follower);

    console.log({ success: true, message: `${follower} now follows ${following}` });
    res.json({ success: true, message: `${follower} now follows ${following}` });

  } catch (err) {
    console.error("Follow error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------- UNFOLLOW ---------------------------
app.post("/unfollow", async (req, res) => {
  const { follower, following } = req.body;

  if (!follower || !following || follower === following) {
    console.log({ error: "Invalid request." });
  }

  try {
    const { data: targetUser } = await supabase
      .from("users")
      .select("followers")
      .eq("username", following)
      .single();

    const { data: sourceUser } = await supabase
      .from("users")
      .select("following")
      .eq("username", follower)
      .single();

    if (!targetUser || !sourceUser) {
      console.log({ error: "User(s) not found." });
      return res.status(404).json({ error: "User(s) not found." });
    }
    // Remove from followers
    const updatedFollowers = (targetUser.followers || []).filter(u => u !== follower);
    await supabase
      .from("users")
      .update({
        followers: updatedFollowers,
        followers_count: updatedFollowers.length,
      })
      .eq("username", following);

    // Remove from following
    const updatedFollowing = (sourceUser.following || []).filter(u => u !== following);
    await supabase
      .from("users")
      .update({
        following: updatedFollowing,
        following_count: updatedFollowing.length,
      })
      .eq("username", follower);
    console.log({ success: true, message: `${follower} unfollowed ${following}` });
    res.json({ success: true, message: `${follower} unfollowed ${following}` });

  } catch (err) {
    console.error("Unfollow error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// -------------------- GET FOLLOWS INFO ---------------------------
app.post("/getfollows-info", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("followers, following, followers_count, following_count")
      .eq("username", username)
      .single();
    if (error || !user) {
      return res.status(404).json({ error: "User not found." });
    }
    console.log("response:", username,
      user.followers_count,
      user.following_count,
      user.followers,
      user.following)
    res.json({
      success: true,
      username,
      followersCount: user.followers_count || 0,
      followingCount: user.following_count || 0,
      followers: user.followers || [],
      following: user.following || [],
    });

  } catch (err) {
    console.error("Get follows error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


export default app;