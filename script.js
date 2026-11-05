// =========================================
// COOLKIDLABS SIDEBAR MENU
// =========================================

(() => {

    const menuToggle = document.getElementById('menuToggle');
    const menuClose = document.getElementById('menuClose');
    const siteMenu = document.getElementById('siteMenu');
    const menuBackdrop = document.getElementById('menuBackdrop');

    if (!menuToggle || !menuClose || !siteMenu || !menuBackdrop) {
        return;
    }

    let closeFallback;


    // OPEN MENU
    function openMenu() {

        window.clearTimeout(closeFallback);

        document.body.classList.remove('menu-closing');
        document.body.classList.add('menu-open');

        menuToggle.setAttribute('aria-expanded', 'true');

        siteMenu.setAttribute('aria-hidden', 'false');
        siteMenu.removeAttribute('inert');

        menuBackdrop.setAttribute('aria-hidden', 'false');

        menuClose.focus();
    }


    // CLOSE MENU
    function closeMenu() {

        if (!document.body.classList.contains('menu-open')) {
            return;
        }

        document.body.classList.remove('menu-open');

        // Keep the menu button hidden while the sidebar slides away.
        document.body.classList.add('menu-closing');

        menuToggle.setAttribute('aria-expanded', 'false');

        siteMenu.setAttribute('aria-hidden', 'true');
        siteMenu.setAttribute('inert', '');

        menuBackdrop.setAttribute('aria-hidden', 'true');


        // Show the menu icon after the closing animation finishes.
        function finishClosing(event) {

            if (
                event &&
                (
                    event.target !== siteMenu ||
                    event.propertyName !== 'transform'
                )
            ) {
                return;
            }

            document.body.classList.remove('menu-closing');

            window.clearTimeout(closeFallback);

            siteMenu.removeEventListener('transitionend', finishClosing);

            menuToggle.focus();
        }


        siteMenu.addEventListener('transitionend', finishClosing);

        // Backup in case the browser does not fire transitionend.
        closeFallback = window.setTimeout(() => {
            finishClosing();
        }, 500);

    }


    // MENU BUTTON
    menuToggle.addEventListener('click', () => {

        if (document.body.classList.contains('menu-open')) {
            closeMenu();
        } else {
            openMenu();
        }

    });


    // X BUTTON
    menuClose.addEventListener('click', closeMenu);


    // CLICKING OUTSIDE THE SIDEBAR
    menuBackdrop.addEventListener('click', closeMenu);


    // CLOSE MENU WITH ESCAPE KEY
    document.addEventListener('keydown', (event) => {

        if (
            event.key === 'Escape' &&
            document.body.classList.contains('menu-open')
        ) {
            closeMenu();
        }

    });


    // CLOSE MENU WHEN A MENU LINK IS CLICKED
    const menuLinks = siteMenu.querySelectorAll('.menu-link');

    menuLinks.forEach((link) => {

        link.addEventListener('click', () => {
            closeMenu();
        });

    });

})();


// =========================================
// SHARE PAGE BUTTON
// =========================================

(() => {

    const shareButton = document.getElementById('sharePage');
    const shareStatus = document.getElementById('shareStatus');

    if (!shareButton || !shareStatus) {
        return;
    }

    let statusTimeout;


    // Fallback for browsers that cannot use the Clipboard API.
    function copyUsingFallback(text) {

        const temporaryInput = document.createElement('textarea');

        temporaryInput.value = text;

        temporaryInput.setAttribute('readonly', '');

        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        temporaryInput.style.pointerEvents = 'none';

        document.body.appendChild(temporaryInput);

        temporaryInput.select();
        temporaryInput.setSelectionRange(0, temporaryInput.value.length);

        const successful = document.execCommand('copy');

        temporaryInput.remove();

        if (!successful) {
            throw new Error('Clipboard copy failed.');
        }

    }


    // COPY CURRENT PAGE URL
    shareButton.addEventListener('click', async () => {

        const pageURL = window.location.href;

        shareStatus.textContent = '';

        window.clearTimeout(statusTimeout);

        try {

            // Use the modern Clipboard API when available.
            if (navigator.clipboard && window.isSecureContext) {

                await navigator.clipboard.writeText(pageURL);

            } else {

                // Use the fallback for unsupported contexts.
                copyUsingFallback(pageURL);

            }

            shareStatus.textContent = 'Page link copied to clipboard!';

            shareButton.classList.add('is-copied');

        } catch (error) {

            console.error('Could not copy page link:', error);

            shareStatus.textContent = 'Unable to copy link. Check browser permissions.';

        }


        // Remove the success appearance after a short time.
        statusTimeout = window.setTimeout(() => {

            shareButton.classList.remove('is-copied');

        }, 2200);

    });

})();


// =========================================
// RELOAD BUTTON
// =========================================

(() => {

    const button = document.getElementById('ckl-reload-control');

    if (!button) {
        return;
    }

    let reloading = false;

    button.addEventListener('click', () => {

        if (reloading) {
            return;
        }

        reloading = true;

        button.classList.add('ckl-spinning');

        button.setAttribute('aria-label', 'Reloading page');

        const tooltip = button.querySelector('.ckl-reload-tip');

        if (tooltip) {
            tooltip.textContent = 'Reloading…';
        }

        window.setTimeout(() => {
            window.location.reload();
        }, 1000);

    });

})();