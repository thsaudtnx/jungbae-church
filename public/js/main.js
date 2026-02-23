document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu');

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
                if (navMenu.classList.contains('active')) {
                    navMenu.classList.remove('active');
                }
            }
        });

        // Close menu when clicking on a link (optional but good for UX)
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
            });
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

    // Force reload on back button to prevent showing cached logged-in state
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            window.location.reload();
        }
    });
});
