const main = async () => {
  try {
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    const { token } = await loginRes.json();

    const jobsRes = await fetch("http://127.0.0.1:8080/api/jobs", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const jobs = await jobsRes.json();
    const job = jobs.find(j => j.id === 16);
    console.log("Job 16 Details:", JSON.stringify(job, null, 2));

    const logsRes = await fetch("http://127.0.0.1:8080/api/admin/logs?timeframe=24h", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const logs = await logsRes.json();
    const jobLogs = logs.filter(l => l.message.includes("Job ID 16") || l.message.includes("Job 16") || l.id > 160);
    console.log("\nRecent Logs:");
    for (const l of jobLogs.slice(0, 15)) {
      console.log(`[${l.timestamp}] [${l.severity}] ID ${l.id}: ${l.message.substring(0, 300)}`);
    }
  } catch (err) {
    console.error(err);
  }
};

main();
