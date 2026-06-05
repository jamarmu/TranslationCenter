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

    const path = "gs://californiahotel_translation_output_files/8_translation_candidate_English.pdf";
    console.log(`Testing download of ${path}...`);
    const downloadRes = await fetch(`http://127.0.0.1:8080/api/download?path=${encodeURIComponent(path)}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    console.log(`Download response status: ${downloadRes.status}`);
    if (downloadRes.ok) {
      console.log("SUCCESS! Download completed successfully.");
    } else {
      console.log(`FAILED! Response body: ${await downloadRes.text()}`);
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
};

main();
