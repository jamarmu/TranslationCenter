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

    console.log("\nFetching job list...");
    const jobsRes = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/jobs", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!jobsRes.ok) throw new Error(`Failed to fetch jobs: ${jobsRes.status}`);
    const jobs = await jobsRes.json();
    console.log(`Retrieved ${jobs.length} jobs.`);
    
    // Print the first few jobs
    jobs.slice(0, 5).forEach(job => {
      console.log(`Job ID: ${job.id}, Name: ${job.job_name}, Status: ${job.status}, Tokens Consumed: ${job.tokens_consumed}`);
    });
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  }
};

main();
