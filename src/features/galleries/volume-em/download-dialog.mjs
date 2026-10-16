import { copyWithFeedback } from "../../../components/ui/clipboard.mjs";
import { resourceURL } from "../../../security/urls.mjs";
import { downloadCommand } from "./download-command.mjs";

/** API/collection values stay in text nodes and event closures, never HTML or JavaScript source. */
export function copyURI(opener) {
    const uri = opener.getAttribute("data-uri");
    if (!resourceURL(uri)) return;
    const command = downloadCommand(uri);
    const title = "OME-Zarr S3 Location";
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", title);
    Object.assign(dialog.style, { border: "1px solid #ccc", borderRadius: "8px", boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)", maxWidth: "80vw" });
    const content = document.createElement("div");
    Object.assign(content.style, { padding: "20px", textAlign: "left", maxWidth: "600px" });
    function element(tag, text, style) {
        const node = document.createElement(tag);
        node.textContent = text;
        if (style) Object.assign(node.style, style);
        content.append(node);
        return node;
    }
    function button(text, handler) {
        const node = element("button", text);
        node.type = "button";
        node.className = "bia-button";
        node.addEventListener("click", handler);
        return node;
    }
    const close = button("×", () => dialog.close());
    close.setAttribute("aria-label", "Close");
    Object.assign(close.style, { position: "absolute", top: "10px", right: "10px", background: "none", border: "none", fontSize: "20px", fontWeight: "bold", cursor: "pointer" });
    element("h3", title, { textAlign: "center", marginBottom: "15px" });
    element("h4", "S3 URI:");
    element("p", uri, { wordBreak: "break-all", fontFamily: "monospace", background: "#f5f5f5", padding: "10px", borderRadius: "4px" });
    if (command) {
        element("h4", "Download with AWS CLI (bash/zsh):");
        element("p", "1. Install the AWS CLI if you haven't already.");
        element("p", "2. Download from this path-style S3 endpoint recursively (no credentials needed):");
        element("pre", command, { background: "#f5f5f5", padding: "10px", borderRadius: "4px", overflowX: "auto" });
    } else {
        element("p", "You can copy this URI. An anonymous AWS CLI command is not available for this address.");
    }
    async function copy(value, control) {
        if (await copyWithFeedback(control, value, { success: "Copied" })) dialog.close();
    }
    const copyLocation = button("Copy S3 URI", () => copy(uri, copyLocation));
    if (command) {
        const copyCommand = button("Copy AWS Command", () => copy(command, copyCommand));
    }
    dialog.append(content);
    dialog.addEventListener("close", () => { dialog.remove(); opener.focus(); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
}
