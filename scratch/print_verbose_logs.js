const main = async () => {
  try {
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    const { token } = await loginRes.json();

    const logsRes = await fetch("http://127.0.0.1:8080/api/admin/logs?timeframe=1d", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const logs = await logsRes.json();
    const geminiLogs = logs.filter(l => l.message && (l.message.includes("Gemini") || l.message.includes("translation request")));
    console.log(`Found ${geminiLogs.length} Gemini logs:`);
    for (const log of geminiLogs) {
      console.log(`\n--- Log ID: ${log.id} | Severity: ${log.severity} | Time: ${log.timestamp} ---`);
      console.log(log.message);
    }
  } catch (err) {
    console.error("Failed to query logs:", err);
  }
};

main();
