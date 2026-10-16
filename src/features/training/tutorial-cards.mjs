import { navigationURL } from "../../security/urls.mjs";

const first = value => Array.isArray(value) ? value[0] : value;
const text = value => String(first(value) ?? "");

/** Render validated records as native cards; parsed description nodes remain inert. */
export function renderTutorials(container, entries, type) {
    const nodes = entries.slice(0, 2).map(item => {
        const fields = item.fields;
        const entry = document.createElement("div");
        entry.className = "vf-summary vf-summary--event";
        function element(tag, className, value, parent = entry) {
            const node = document.createElement(tag);
            node.className = className;
            node.textContent = value;
            parent.append(node);
            return node;
        }
        element("p", "vf-summary__date", text(fields.type));
        const heading = element("h3", "vf-summary__title", "");
        const subtitle = text(fields.subtitle);
        const title = text(fields.title) + (subtitle && subtitle !== "null" ? `: ${subtitle}` : "");
        const href = navigationURL(first(fields.url));
        const link = element(href ? "a" : "span", "vf-link vf-summary__link", title, heading);
        if (href) { link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; }
        // Template content stays inert: extract text and never attach its parsed nodes.
        const parsed = document.createElement("template");
        parsed.innerHTML = text(fields.description);
        const description = parsed.content.textContent ?? "";
        element("div", "vf-summary__text", description.length > 200 ? description.slice(0, 200) + "…" : description);
        if (type === "live") {
            const location = element("div", "vf-summary__location", "");
            element("div", "vf-u-margin__top--400", "", location);
            element("span", "", text(fields.status), location);
            location.append(" | ");
            const date = element("span", "", "", location);
            element("i", "icon icon-common icon-calendar-alt", "", date);
            date.append(` ${text(fields.date_time_clean)}`);
            location.append(" | ");
            const venue = element("span", "", "", location);
            element("i", "icon icon-common icon-location", "", venue);
            venue.append(` ${text(fields.venue) === "null" ? "Online" : text(fields.venue)}`);
        }
        return entry;
    });
    if (!nodes.length) {
        const message = document.createElement("p");
        message.textContent = type === 'live'
            ? "Currently there are no upcoming events - please click the below link for more information"
            : "Currently there are no on-demand tutorials. Use the link below for more information.";
        nodes.push(message);
    }
    container.replaceChildren(...nodes);
}
