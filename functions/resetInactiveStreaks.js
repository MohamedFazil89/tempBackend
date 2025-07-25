export default async function resetInactiveStreaks(supabase) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const yestStr = yesterday.toISOString().split("T")[0];

  // Fetch all users
  const { data: users, error } = await supabase
    .from("users")
    .select("username, latest_update, streaks_count");

  if (error) {
    console.error("Failed to fetch users:", error);
    return;
  }
  for (const user of users) {
    const lastUpdateStr = new Date(user.latest_update).toISOString().split("T")[0];

    if (lastUpdateStr !== yestStr && lastUpdateStr !== today.toISOString().split("T")[0]) {
      const { error: updateErr } = await supabase
        .from("users")
        .update({ streaks_count: 1 })
        .eq("username", user.username);
      if (updateErr) {
        console.error(`Failed to reset streak for ${user.username}:`, updateErr);
      } else {
        console.log(`Streak reset for ${user.username}`);
      }
    }
  }
}