module.exports = {
  input: "textarea#prompt-textarea, div[contenteditable='true'][data-testid='composer-input']",
  sendButton: "button[data-testid='send-button'], button[aria-label='Send message']",
  assistantMessages: "[data-message-author-role='assistant']",
  continueGenerating: "button:has-text('Continue generating')",
  stopGenerating: "button:has-text('Stop generating')",
  newChat: "a[href='/'], button:has-text('New chat')"
};
