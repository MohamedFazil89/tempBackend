

export default async function updateUserStreak(username, supabase) {
  const { data: user, error } = await supabase
    .from("users")
    .select("latest_update, streaks_count, rewards")
    .eq("username", username)
    .maybeSingle();

  if (error || !user) {
    console.error("User fetch failed:", error);
    return { error: "User not found" };
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Normalize to YYYY-MM-DD
  const todayStr = today.toISOString().split("T")[0];
  const yestStr = yesterday.toISOString().split("T")[0];
  const lastUpdateStr = new Date(user.latest_update).toISOString().split("T")[0];

  let streak = 1;
  let rewards = user.rewards || [];

  if (lastUpdateStr === yestStr) {
    streak = (user.streaks_count || 0) + 1;
  } else if (lastUpdateStr === todayStr) {
    return {
      message: "Already updated streak today",
      streaks_count: user.streaks_count,
      rewards,
    };
  }
  // Add reward if 5-day streak and not already given
  const alreadyRewarded = rewards.some(
    (r) => r.reason === "5-day posting streak" && r.date === todayStr
  );
  if (streak === 5 && !alreadyRewarded) {
    rewards.push({
      item: "Free drink at partner cafe",
      date: todayStr,
      reason: "5-day posting streak",
    });
  }
  const { error: updateErr } = await supabase
    .from("users")
    .update({
      streaks_count: streak,
      rewards,
      latest_update: today.toISOString(),
    })
    .eq("username", username);

  if (updateErr) {
    console.error("Failed to update streak:", updateErr);
    return { error: "Streak update failed" };
  }
  return {
    message: "Streak updated successfully",
    streaks_count: streak,
    rewards,
  };
}