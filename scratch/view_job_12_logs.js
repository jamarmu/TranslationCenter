const main = async () => {
  try {
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    const { token } = await loginRes.json();

    const logsRes = await fetch("http://127.0.0.1:8080/api/admin/logs?timeframe=1h", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const logs = await logsRes.json();
    
    // Sort ascending to see chronological order
    const jobLogs = logs
      .filter(l => new Date(l.timestamp) >= new Date("2026-06-05T16:24:00.000Z"))
      .sort((a, b) => a.id - b.id);
      
    console.log(`Found ${jobLogs.length} logs for Job 12:`);
    for (const log of jobLogs) {
      console.log(`\n[${log.timestamp}] [${log.severity}] ID ${log.id}:`);
      console.log(log.message.substring(0, 500) + (log.message.length > 500 ? "..." : ""));
    }
  } catch (err) {
    console.error("Failed to query logs:", err);
  }
};

main();
