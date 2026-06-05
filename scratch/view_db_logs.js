const main = async () => {
  try {
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    const { token } = await loginRes.json();

    const logsRes = await fetch("http://127.0.0.1:8080/api/admin/logs?severity=ERROR&timeframe=1d", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const logs = await logsRes.json();
    console.log("Database Error Logs:");
    console.log(JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("Failed to query logs:", err);
  }
};

main();
