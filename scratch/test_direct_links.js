const main = async () => {
  try {
    console.log("Logging in as admin1...");
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    const { token } = await loginRes.json();
    console.log("Login successful! Token retrieved.");

    // Start local tunnel check
    console.log("Fetching jobs list...");
    const jobsRes = await fetch("http://127.0.0.1:8080/api/jobs", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    const jobs = await jobsRes.json();
    console.log(`Fetched ${jobs.length} jobs.`);
    
    if (jobs.length > 0) {
      const job = jobs[0];
      console.log("\nSample Job Details:");
      console.log(`Job Name: ${job.job_name}`);
      console.log(`Source File Path: ${job.source_file_path}`);
      console.log(`Candidate File Path: ${job.candidate_file_path}`);
      console.log(`Output File Path: ${job.output_file_path}`);
      
      const isDirect = (p) => !p || p.startsWith("https://storage.cloud.google.com/");
      
      if (isDirect(job.source_file_path) && isDirect(job.candidate_file_path) && isDirect(job.output_file_path)) {
        console.log("\nSUCCESS! All file paths point directly to Google Cloud Storage HTTP objects (storage.cloud.google.com)!");
      } else {
        console.log("\nFAILED! File paths do not point to storage.cloud.google.com directly!");
      }
    } else {
      console.log("No jobs to verify.");
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
};

main();
