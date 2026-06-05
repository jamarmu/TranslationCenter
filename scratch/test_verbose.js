const fs = require('fs');
const path = require('path');

const API_BASE = "http://127.0.0.1:8080";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  try {
    console.log("1. Logging in as admin1...");
    const loginRes = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin1", password: "123Translate" })
    });
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${await loginRes.text()}`);
    }
    const { token } = await loginRes.json();
    console.log("Login successful!");

    // Find a PDF in scratch directory
    const scratchDir = path.join(__dirname, '../scratch');
    const files = fs.readdirSync(scratchDir);
    const pdfFile = files.find(f => f.endsWith('.pdf'));
    if (!pdfFile) {
      throw new Error("No PDF file found in scratch directory to upload.");
    }
    const pdfPath = path.join(scratchDir, pdfFile);
    console.log(`Using PDF file for test upload: ${pdfFile}`);
    const fileBytes = fs.readFileSync(pdfPath);
    
    // Submit job 1: Verbose Disabled
    console.log("\n2. Submitting Job 1: Verbose Disabled...");
    const form1 = new FormData();
    form1.append('job_name', 'Test-Verbose-Disabled-1');
    form1.append('source_lang', 'Spanish');
    form1.append('target_lang', 'English');
    form1.append('verbose', 'false');
    const blob1 = new Blob([fileBytes], { type: 'application/pdf' });
    form1.append('file', blob1, 'test_doc.pdf');

    const res1 = await fetch(`${API_BASE}/api/jobs`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form1
    });
    if (!res1.ok) {
      throw new Error(`Failed to submit job 1: ${await res1.text()}`);
    }
    const job1Data = await res1.json();
    console.log(`Job 1 submitted successfully! Job ID: ${job1Data.job_id}`);

    // Submit job 2: Verbose Enabled
    console.log("\n3. Submitting Job 2: Verbose Enabled...");
    const form2 = new FormData();
    form2.append('job_name', 'Test-Verbose-Enabled-1');
    form2.append('source_lang', 'Spanish');
    form2.append('target_lang', 'English');
    form2.append('verbose', 'true');
    const blob2 = new Blob([fileBytes], { type: 'application/pdf' });
    form2.append('file', blob2, 'test_doc.pdf');

    const res2 = await fetch(`${API_BASE}/api/jobs`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: form2
    });
    if (!res2.ok) {
      throw new Error(`Failed to submit job 2: ${await res2.text()}`);
    }
    const job2Data = await res2.json();
    console.log(`Job 2 submitted successfully! Job ID: ${job2Data.job_id}`);

    // Wait for jobs to process
    console.log("\n4. Waiting 25 seconds for backend translation tasks to run...");
    await wait(25000);

    // Fetch and check logs
    console.log("\n5. Querying database event logs...");
    const logsRes = await fetch(`${API_BASE}/api/admin/logs?severity=ALL&timeframe=1h`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!logsRes.ok) {
      throw new Error(`Failed to fetch logs: ${await logsRes.text()}`);
    }
    const logs = await logsRes.json();

    // Verify if prompt was logged for verbose-enabled job, and not for verbose-disabled job
    const promptLogs = logs.filter(l => l.message.includes("Gemini Prompt:"));
    console.log(`Found ${promptLogs.length} prompt log entries in the database:`);
    console.log(JSON.stringify(promptLogs, null, 2));

    const loggedForJob2 = promptLogs.some(l => l.message.includes("<block id=")); // Since prompts contain XML blocks
    
    // Check if there is any prompt log specifically for the disabled job
    // Actually, prompt logs contain the whole prompt but no explicit job_id in the prompt string.
    // However, since only Job 2 had verbose enabled, if we have exactly 1 prompt log, it must be for Job 2.
    // Let's print out validation status
    console.log("\n--- VERIFICATION RESULT ---");
    if (promptLogs.length === 1) {
      console.log("SUCCESS: Exactly one prompt was logged in the database, corresponding to the verbose-enabled job!");
    } else if (promptLogs.length === 0) {
      console.log("FAILED: No prompt log entries found in the database. (Check if backend failed due to Vertex AI 404 or other errors)");
    } else {
      console.log(`FAILED: Unexpected number of prompt logs: ${promptLogs.length}`);
    }

    // Print out the recent logs to debug backend processing status
    console.log("\n6. Recent logs for debug:");
    console.log(JSON.stringify(logs.slice(0, 15), null, 2));

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

main();
