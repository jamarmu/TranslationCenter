const fs = require('fs');

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

    // TEST 1: Default Model Override
    console.log("\n[TEST 1] Submitting job with DEFAULT model...");
    const formData1 = new FormData();
    formData1.append("job_name", "Test Default Model " + new Date().toISOString());
    formData1.append("source_lang", "English");
    formData1.append("target_lang", "Spanish");
    formData1.append("model_override", ""); // default
    
    const fileContent = fs.readFileSync("/Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/scratch/sample.pdf");
    const blob1 = new Blob([fileContent], { type: "application/pdf" });
    formData1.append("file", blob1, "sample.pdf");

    const submitRes1 = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/jobs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData1
    });
    if (!submitRes1.ok) throw new Error(`Submission 1 failed: ${submitRes1.status} ${await submitRes1.text()}`);
    const submitData1 = await submitRes1.json();
    const jobId1 = submitData1.job_id;
    console.log("Job 1 submitted successfully! Job ID:", jobId1);

    // Poll Job 1
    console.log("Polling Job 1 status...");
    let job1 = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const jobsRes = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/jobs", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!jobsRes.ok) throw new Error(`Failed to fetch jobs: ${jobsRes.status}`);
      const jobs = await jobsRes.json();
      job1 = jobs.find(j => j.id === jobId1);
      if (!job1) throw new Error("Job 1 not found in list!");
      
      console.log(`Poll #${i+1}: Status = ${job1.status}, Model Used = ${job1.model_used}`);
      if (job1.status !== "PENDING" && job1.status !== "TRANSLATING") {
        break;
      }
    }

    if (job1.model_used.includes(",")) {
      throw new Error(`FAIL: Model used still contains comma-separated list: ${job1.model_used}`);
    }
    console.log(`SUCCESS: Job 1 used model: ${job1.model_used}`);

    // TEST 2: Specific Model Override (gemini-2.5-flash)
    console.log("\n[TEST 2] Submitting job with gemini-2.5-flash override...");
    const formData2 = new FormData();
    formData2.append("job_name", "Test Specific Model " + new Date().toISOString());
    formData2.append("source_lang", "Spanish");
    formData2.append("target_lang", "English");
    formData2.append("model_override", "gemini-2.5-flash");
    
    const blob2 = new Blob([fileContent], { type: "application/pdf" });
    formData2.append("file", blob2, "sample.pdf");

    const submitRes2 = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/jobs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData2
    });
    if (!submitRes2.ok) throw new Error(`Submission 2 failed: ${submitRes2.status} ${await submitRes2.text()}`);
    const submitData2 = await submitRes2.json();
    const jobId2 = submitData2.job_id;
    console.log("Job 2 submitted successfully! Job ID:", jobId2);

    // Poll Job 2
    console.log("Polling Job 2 status...");
    let job2 = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const jobsRes = await fetch("https://translation-frontend-36581472908.us-central1.run.app/api/jobs", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!jobsRes.ok) throw new Error(`Failed to fetch jobs: ${jobsRes.status}`);
      const jobs = await jobsRes.json();
      job2 = jobs.find(j => j.id === jobId2);
      if (!job2) throw new Error("Job 2 not found in list!");
      
      console.log(`Poll #${i+1}: Status = ${job2.status}, Model Used = ${job2.model_used}`);
      if (job2.status !== "PENDING" && job2.status !== "TRANSLATING") {
        break;
      }
    }

    if (job2.model_used !== "gemini-2.5-flash") {
      throw new Error(`FAIL: Job 2 did not use gemini-2.5-flash. Used: ${job2.model_used}`);
    }
    console.log(`SUCCESS: Job 2 used model: ${job2.model_used}`);

    console.log("\nAll model selection verifications PASSED successfully!");
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  }
};

main();
