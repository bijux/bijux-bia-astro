const boundButtons = new WeakSet();

function initialiseMetadata() {
    const wrap = document.getElementById('meta-wrap');
    const content = document.getElementById('meta-content');
    const button = document.getElementById('meta-toggle');
    if (!wrap || !content || !button || boundButtons.has(button)) return;

    const collapsedHeight = 250;
    if (content.scrollHeight <= collapsedHeight) {
        button.remove();
        return;
    }
    button.hidden = false;
    wrap.dataset.collapsed = 'true';
    content.style.maxHeight = `${collapsedHeight}px`;
    button.onclick = () => {
        const wasOpen = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!wasOpen));
        button.textContent = wasOpen ? 'See more' : 'See less';
        wrap.dataset.collapsed = String(wasOpen);
        content.style.maxHeight = wasOpen ? `${collapsedHeight}px` : '';
    };
    boundButtons.add(button);
}

function initialiseFilePaths() {
    const extra = document.getElementById('file-path-extra');
    const button = document.getElementById('file-path-toggle');
    if (!extra || !button || boundButtons.has(button)) return;
    button.onclick = () => {
        const wasOpen = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!wasOpen));
        button.textContent = wasOpen ? 'See more' : 'See less';
        extra.hidden = wasOpen;
    };
    boundButtons.add(button);
}

function initialise() {
    initialiseMetadata();
    initialiseFilePaths();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
else initialise();
document.addEventListener('astro:page-load', initialise);
