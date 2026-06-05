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
    
    const promptLog = logs.find(l => l.id === 125);
    const responseLog = logs.find(l => l.id === 129);
    
    if (!promptLog || !responseLog) {
      console.log("Could not find prompt or response logs");
      return;
    }
    
    const promptBlocks = [];
    const promptRegex = /<block id="([^"]+)">/g;
    let match;
    while ((match = promptRegex.exec(promptLog.message)) !== null) {
      promptBlocks.push(match[1]);
    }
    
    const responseBlocks = [];
    const responseRegex = /<block id="([^"]+)">/g;
    while ((match = responseRegex.exec(responseLog.message)) !== null) {
      responseBlocks.push(match[1]);
    }
    
    console.log(`Prompt Blocks Count: ${promptBlocks.length}`);
    console.log(`Response Blocks Count: ${responseBlocks.length}`);
    
    const missingInResponse = promptBlocks.filter(b => !responseBlocks.includes(b));
    const extraInResponse = responseBlocks.filter(b => !promptBlocks.includes(b));
    
    console.log(`Missing in response (${missingInResponse.length}):`, missingInResponse);
    console.log(`Extra in response (${extraInResponse.length}):`, extraInResponse);
  } catch (err) {
    console.error(err);
  }
};

main();
