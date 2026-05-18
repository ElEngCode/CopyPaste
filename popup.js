const startBtn = document.getElementById("startBtn");

startBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    action: "START_LOOP"
  });
});
