const main = async () => {
  try {
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    const { token } = await loginRes.json();

    const logsRes = await fetch("http://127.0.0.1:8080/api/admin/logs?timeframe=24h", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const logs = await logsRes.json();
    
    const responseLogs = logs.filter(l => l.message.includes("Gemini Response:"));
    console.log(`Found ${responseLogs.length} Gemini Response logs:`);
    for (const log of responseLogs) {
      console.log(`\n--- Log ID ${log.id} (${log.timestamp}) ---`);
      console.log(log.message);
    }
  } catch (err) {
    console.error("Failed to query logs:", err);
  }
};

main();
