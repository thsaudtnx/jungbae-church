document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }


    // Unregister existing Service Workers (to fix caching issues in development)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (let registration of registrations) {
                registration.unregister();
                console.log('Service Worker unregistered');
            }
        });
    }

    // NProgress Setup
    if (typeof NProgress !== 'undefined') {
        NProgress.configure({ showSpinner: false });

        // Show progress bar on page unload (navigation start)
        window.addEventListener('beforeunload', () => {
            NProgress.start();
        });

        // Complete progress bar on page load
        window.addEventListener('load', () => {
            NProgress.done();
        });
    }
});
