import { copyWithFeedback } from "../../../components/ui/clipboard.mjs";
const commandDialog = document.querySelector('.spora-command-dialog');
const commandCode = commandDialog?.querySelector('code');
const commandCopyButton = document.querySelector('.spora-command-copy');
document.querySelectorAll('.spora-step-trigger').forEach((button) => {
  button.addEventListener('click', () => {
    if (!commandDialog || !commandCode) return;
    commandCode.textContent = button.dataset.command || '';
    commandDialog.showModal();
  });
});
if (commandCopyButton && commandCode) {
  commandCopyButton.addEventListener('click', async () => {
    await copyWithFeedback(commandCopyButton, commandCode.textContent || '', { success: 'Copied!', duration: 1000 });
  });
}
const copyButton = document.querySelector('.spora-citation-box .spora-citation-copy');
if (copyButton) {
  copyButton.addEventListener('click', async () => {
    await copyWithFeedback(copyButton, copyButton.dataset.copyText || '', { success: 'Copied!', duration: 1000 });
  });
}
