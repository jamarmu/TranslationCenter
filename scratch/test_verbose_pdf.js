const fs = require('fs');
const path = require('path');

const main = async () => {
  try {
    console.log("Logging in as admin1...");
    const loginRes = await fetch("http://127.0.0.1:8080/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const { token } = await loginRes.json();
    console.log("Login successful! Token retrieved.");

    console.log("\nSubmitting a new PDF translation job with verbose=true...");
    const formData = new FormData();
    formData.append("job_name", "Test PDF Verbose Translation " + new Date().toISOString());
    formData.append("source_lang", "Spanish");
    formData.append("target_lang", "English");
    formData.append("verbose", "true");
    
    const scratchDir = "/Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/scratch";
    const files = fs.readdirSync(scratchDir);
    const pdfFile = files.find(f => f.endsWith(".pdf") && f.includes("Conducta"));
    if (!pdfFile) throw new Error("No test PDF file found in scratch directory!");
    
    const pdfPath = path.join(scratchDir, pdfFile);
    console.log("Using PDF file:", pdfPath);
    const fileContent = fs.readFileSync(pdfPath);
    const blob = new Blob([fileContent], { type: "application/pdf" });
    formData.append("file", blob, "Co_digo_Conducta_ES.pdf");

    const submitRes = await fetch("http://127.0.0.1:8080/api/jobs", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });
    if (!submitRes.ok) throw new Error(`Submission failed: ${submitRes.status} ${await submitRes.text()}`);
    const submitData = await submitRes.json();
    const jobId = submitData.job_id;
    console.log("Job submitted successfully! Job ID:", jobId);

    console.log("\nPolling job status...");
    let job = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // poll every 5s
      const jobsRes = await fetch("http://127.0.0.1:8080/api/jobs", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!jobsRes.ok) throw new Error(`Failed to fetch jobs: ${jobsRes.status}`);
      const jobs = await jobsRes.json();
      job = jobs.find(j => j.id === jobId);
      if (!job) throw new Error("Job not found in list!");
      
      console.log(`Poll #${i+1}: Status = ${job.status}`);
      if (job.status !== "PENDING" && job.status !== "TRANSLATING") {
        break;
      }
    }

    if (job.status === "PENDING" || job.status === "TRANSLATING") {
      throw new Error(`Job timed out with status: ${job.status}`);
    }

    if (job.status === "FAILED") {
      throw new Error("Job failed during backend processing.");
    }

    console.log("\nPDF Translation succeeded!");
    console.log("Job Details:");
    console.log(JSON.stringify(job, null, 2));
    
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  }
};

main();
