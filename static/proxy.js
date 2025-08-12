// Client-side proxy script to handle URL rewriting and form submissions
(function() {
    'use strict';
    
    // Get the current proxy URL to determine the target domain
    const getCurrentProxyInfo = () => {
        const currentUrl = window.location.href;
        const proxyMatch = currentUrl.match(/\/proxy\/(.+)/);
        if (proxyMatch) {
            const targetUrl = decodeURIComponent(proxyMatch[1]);
            try {
                const url = new URL(targetUrl);
                return {
                    targetOrigin: url.origin,
                    targetHost: url.host,
                    proxyBase: window.location.origin + '/proxy/'
                };
            } catch (e) {
                console.error('Failed to parse target URL:', targetUrl, e);
            }
        }
        return null;
    };

    const proxyInfo = getCurrentProxyInfo();
    if (!proxyInfo) {
        console.warn('Could not determine proxy target from current URL');
        return;
    }

    console.log('Proxy script initialized for:', proxyInfo.targetOrigin);

    // Function to convert a URL to proxy format
    const toProxyUrl = (url) => {
        if (!url) return url;
        
        try {
            // Skip if already a proxy URL
            if (url.startsWith('/proxy/') || url.includes('/proxy/')) {
                return url;
            }
            
            // Skip javascript: and # URLs
            if (url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('data:')) {
                return url;
            }
            
            // Handle absolute URLs
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return proxyInfo.proxyBase + encodeURIComponent(url);
            }
            
            // Handle protocol-relative URLs
            if (url.startsWith('//')) {
                return proxyInfo.proxyBase + encodeURIComponent('https:' + url);
            }
            
            // Handle absolute paths
            if (url.startsWith('/')) {
                return proxyInfo.proxyBase + encodeURIComponent(proxyInfo.targetOrigin + url);
            }
            
            // Handle relative URLs
            const currentPath = window.location.pathname.replace(/\/proxy\/[^\/]+/, '');
            const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/';
            return proxyInfo.proxyBase + encodeURIComponent(proxyInfo.targetOrigin + basePath + url);
        } catch (e) {
            console.error('Error converting URL to proxy format:', url, e);
            return url;
        }
    };

    // Override form submissions
    const interceptFormSubmissions = () => {
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.tagName !== 'FORM') return;

            // Prevent default submission
            event.preventDefault();
            
            const action = form.getAttribute('action') || '';
            let finalAction;
            
            if (action) {
                finalAction = toProxyUrl(action);
            } else {
                // If no action specified, use current page URL
                finalAction = window.location.href;
            }
            
            console.log('Intercepting form submission. Original action:', action, 'Final action:', finalAction);
            
            // Create form data
            const formData = new FormData(form);
            const method = (form.getAttribute('method') || 'GET').toUpperCase();
            
            if (method === 'GET') {
                // For GET requests, append form data to URL as query parameters
                const params = new URLSearchParams(formData);
                const separator = finalAction.includes('?') ? '&' : '?';
                const newUrl = finalAction + separator + params.toString();
                console.log('Navigating to:', newUrl);
                window.location.href = newUrl;
            } else {
                // For POST requests, submit with fetch
                fetch(finalAction, {
                    method: method,
                    body: formData
                }).then(response => {
                    if (response.ok) {
                        window.location.href = response.url;
                    }
                }).catch(error => {
                    console.error('Form submission error:', error);
                    // Fallback: try to navigate anyway
                    window.location.href = finalAction;
                });
            }
        });
    };

    // Override link clicks
    const interceptLinkClicks = () => {
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (!link) return;

            // Remove target attributes to prevent opening in new windows
            link.removeAttribute('target');
            link.removeAttribute('rel');

            const href = link.getAttribute('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                const newHref = toProxyUrl(href);
                if (newHref !== href) {
                    console.log('Redirecting link from', href, 'to', newHref);
                    link.setAttribute('href', newHref);
                }
            }
        });
    };

    // Override fetch requests
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = input;
        if (typeof input === 'object' && input.url) {
            url = input.url;
        }
        
        const proxyUrl = toProxyUrl(url);
        if (proxyUrl !== url) {
            console.log('Proxying fetch request from', url, 'to', proxyUrl);
            if (typeof input === 'string') {
                return originalFetch.call(this, proxyUrl, init);
            } else {
                return originalFetch.call(this, { ...input, url: proxyUrl }, init);
            }
        }
        
        return originalFetch.call(this, input, init);
    };

    // Override XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        const proxyUrl = toProxyUrl(url);
        if (proxyUrl !== url) {
            console.log('Proxying XHR request from', url, 'to', proxyUrl);
            return originalXHROpen.call(this, method, proxyUrl, ...args);
        }
        return originalXHROpen.call(this, method, url, ...args);
    };

    // Override window.open to prevent new windows
    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
        console.log('Intercepting window.open call:', url, target, features);
        
        // If target is _blank or similar, redirect in current window instead
        if (target === '_blank' || target === '_new' || !target) {
            const proxyUrl = toProxyUrl(url);
            console.log('Redirecting window.open to current window:', proxyUrl);
            window.location.href = proxyUrl;
            return window;
        }
        
        // For other targets, still redirect in current window
        const proxyUrl = toProxyUrl(url);
        window.location.href = proxyUrl;
        return window;
    };

    // Fix existing elements on page load
    const fixExistingElements = () => {
        // Fix forms
        document.querySelectorAll('form[action]').forEach(form => {
            const action = form.getAttribute('action');
            const newAction = toProxyUrl(action);
            if (newAction !== action) {
                form.setAttribute('action', newAction);
            }
        });

        // Fix links
        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                const newHref = toProxyUrl(href);
                if (newHref !== href) {
                    link.setAttribute('href', newHref);
                }
            }
        });

        // Fix images, scripts, stylesheets
        const resourceSelectors = [
            'img[src]',
            'script[src]',
            'link[href]',
            'iframe[src]',
            'source[src]',
            'track[src]'
        ];

        resourceSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                const attr = element.hasAttribute('src') ? 'src' : 'href';
                const url = element.getAttribute(attr);
                const newUrl = toProxyUrl(url);
                if (newUrl !== url) {
                    element.setAttribute(attr, newUrl);
                }
            });
        });
    };

    // Initialize immediately and also when DOM is ready
    const initializeProxy = () => {
        fixExistingElements();
        interceptFormSubmissions();
        interceptLinkClicks();
        
        // Force remove target attributes from all existing links
        document.querySelectorAll('a').forEach(link => {
            link.removeAttribute('target');
            link.removeAttribute('rel');
            
            // Remove problematic onclick handlers
            const onclick = link.getAttribute('onclick');
            if (onclick && (onclick.includes('window.open') || onclick.includes('_blank'))) {
                link.removeAttribute('onclick');
            }
        });
        
        // Force remove target attributes from all forms
        document.querySelectorAll('form').forEach(form => {
            form.removeAttribute('target');
        });
        
        console.log('Proxy initialization complete');
    };

    // Run immediately
    initializeProxy();
    
    // Also run when DOM is ready (in case we missed some elements)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeProxy);
    }
    
    // Run again after a short delay to catch any dynamically loaded content
    setTimeout(initializeProxy, 100);
    setTimeout(initializeProxy, 500);
    setTimeout(initializeProxy, 1000);

    // Also fix elements added dynamically
    const setupMutationObserver = () => {
        if (!document.body) {
            // If body doesn't exist yet, try again later
            setTimeout(setupMutationObserver, 100);
            return;
        }
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Fix the new element and its children
                        const elements = [node, ...node.querySelectorAll('*')];
                        elements.forEach(element => {
                            // Remove target attributes from all links
                            if (element.tagName === 'A') {
                                element.removeAttribute('target');
                                element.removeAttribute('rel');
                                
                                // Handle onclick events that might open new windows
                                const onclick = element.getAttribute('onclick');
                                if (onclick && (onclick.includes('window.open') || onclick.includes('_blank'))) {
                                    element.removeAttribute('onclick');
                                }
                                
                                if (element.hasAttribute('href')) {
                                    const href = element.getAttribute('href');
                                    if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                                        const newHref = toProxyUrl(href);
                                        if (newHref !== href) {
                                            element.setAttribute('href', newHref);
                                        }
                                    }
                                }
                            }
                            
                            if (element.tagName === 'FORM') {
                                element.removeAttribute('target');
                                
                                if (element.hasAttribute('action')) {
                                    const action = element.getAttribute('action');
                                    const newAction = toProxyUrl(action);
                                    if (newAction !== action) {
                                        element.setAttribute('action', newAction);
                                    }
                                }
                            }
                        });
                    }
                });
            });
        });

        try {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('MutationObserver setup complete');
        } catch (error) {
            console.error('Failed to setup MutationObserver:', error);
        }
    };
    
    // Setup mutation observer
    setupMutationObserver();

    console.log('Proxy script setup complete');
})();
