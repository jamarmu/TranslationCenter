const main = async () => {
  try {
    console.log("Logging in as admin1...");
    const loginRes = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const { token } = await loginRes.json();
    console.log("Login successful! Token retrieved.");

    console.log("\nTriggering database cleanup...");
    const cleanupRes = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/admin/cleanup", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!cleanupRes.ok) throw new Error(`Cleanup failed: ${cleanupRes.status} ${await cleanupRes.text()}`);
    const cleanupData = await cleanupRes.json();
    console.log("Cleanup response:", cleanupData);
  } catch (err) {
    console.error("Cleanup failed:", err);
    process.exit(1);
  }
};

main();
