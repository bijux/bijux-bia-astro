const initialised = new WeakSet();

function initialiseNavigation() {
  document.querySelectorAll('[data-primary-navigation]').forEach(nav => {
    if (initialised.has(nav)) return;
    const toggle = nav.querySelector('.nav-toggle');
    const menu = nav.querySelector('.nav-list');
    if (!toggle || !menu) return;
    const mobile = window.matchMedia('(max-width: 768px)');
    let focusedControl = null;
    document.addEventListener('focusin', event => {
      focusedControl = nav.contains(event.target) ? event.target : null;
    });
    const closeMenu = (restoreFocus = false) => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus && mobile.matches) toggle.focus();
    };

    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('a')) {
        closeMenu(menu.contains(document.activeElement));
      }
    });
    document.addEventListener('click', event => {
      if (!nav.contains(event.target)) closeMenu(menu.contains(document.activeElement));
    });
    nav.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (mobile.matches && nav.classList.contains('is-open')) {
        event.preventDefault();
        closeMenu(true);
      } else if (!mobile.matches && event.target instanceof Element) {
        const item = event.target.closest('.nav-item');
        const submenu = item?.querySelector('.nav-dropdown');
        if (submenu && getComputedStyle(submenu).display !== 'none') {
          event.preventDefault();
          item.querySelector('a')?.focus();
          item.classList.add('is-dismissed');
        }
      }
    });
    menu.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('pointerenter', () => item.classList.remove('is-dismissed'));
      item.addEventListener('focusout', event => {
        if (!item.contains(event.relatedTarget)) item.classList.remove('is-dismissed');
      });
    });
    mobile.addEventListener('change', () => {
      // CSS can blur a newly hidden control before the media-query event runs.
      const focused = document.activeElement === document.body ? focusedControl : document.activeElement;
      const focusInMenu = menu.contains(focused);
      const focusOnToggle = focused === toggle;
      closeMenu();
      menu.querySelectorAll('.is-dismissed').forEach(item => item.classList.remove('is-dismissed'));
      if (mobile.matches && focusInMenu) toggle.focus();
      else if (!mobile.matches && focusOnToggle) menu.querySelector('a')?.focus();
    });

    initialised.add(nav);
    nav.dataset.navigationReady = 'true';
    toggle.hidden = false;
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialiseNavigation, { once: true });
else initialiseNavigation();
document.addEventListener('astro:page-load', initialiseNavigation);
